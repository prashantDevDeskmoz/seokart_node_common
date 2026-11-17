'use strict';

const path = require('path');
const https = require('https');
const axios = require('axios');
const cheerio = require('cheerio');
const Typo = require('typo-js');
const { decodeHTML } = require('entities');

const SPELL_LANGUAGES = ['da', 'de', 'el', 'en', 'en_GB', 'en_US', 'es', 'fr', 'it', 'nl', 'ru'];
const DICTIONARY_DIR = path.join(path.dirname(require.resolve('typo-js')), 'dictionaries');
const LOREM_WORDS = new Set(['lorem', 'ipsum', 'dolor']);
const EXTERNAL_BROKEN_STATUSES = new Set([404, 410, 500, 502, 503, 504]);
const LINK_CHECK_CONCURRENCY = 5;
const HTTP_TIMEOUT_MS = 5000;
const REQUEST_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};
const insecureAgent = new https.Agent({ rejectUnauthorized: false }); // PHP Guzzle verify => false
const typoByDictionary = new Map();

/**
 * Plain words of an HTML string (scripts / styles / tags removed, only letters, digits and ').
 * Port of SeoauditController@stripTags
 */
const stripTags = (html = '') =>
  String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/</g, ' <')
    .replace(/&nbsp;|&ndash;/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[^a-zA-Z0-9']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Port of SeoauditController@checkLorem (+ chekLoremIpsum)
 * @returns {{ lorem_ipsum: 0|1 }}
 */
const checkLorem = (html) => ({
  lorem_ipsum: stripTags(html).split(' ').some((word) => LOREM_WORDS.has(word)) ? 1 : 0,
});

/**
 * Spell-check language of a store from seo_setting_bigc (language_code / country_code).
 * Port of the language part of SeoauditController@spellCheck
 */
const spellLanguage = (setting) => {
  let languageCode = setting?.language_code || 'en';
  const countryCode = setting?.country_code || 'US';
  if (!SPELL_LANGUAGES.includes(languageCode)) languageCode = 'en';
  if (languageCode === 'en' && (countryCode === 'GB' || countryCode === 'US')) {
    return `en_${countryCode}`;
  }
  return languageCode;
};

/**
 * Unique misspelled words of a plain text. Only the en_US and it dictionaries are bundled
 * (typo-js); other languages are checked with en_US.
 * Port of the Aspell check in SeoauditController@spellCheck
 *
 * @param {string} text - plain text (stripTags output)
 * @param {string} language - spellLanguage() result
 * @returns {string[]}
 */
const findMisspelledWords = (text, language) => {
  const dictionary = language === 'it' ? 'it' : 'en_US';
  if (!typoByDictionary.has(dictionary)) {
    typoByDictionary.set(dictionary, new Typo(dictionary, null, null, { dictionaryPath: DICTIONARY_DIR }));
  }
  const typo = typoByDictionary.get(dictionary);

  const words = new Set(String(text || '').split(/\s+/));
  return [...words].filter((word) => word.length > 1 && !/^\d+$/.test(word) && !typo.check(word));
};

/**
 * GET a URL like PHP Guzzle (no SSL verify, redirects followed). Never throws: a network error
 * is status 404 (PHP pageStatus) with an empty body.
 * Port of SeoauditController@sendGuzzleRequest / pageStatus
 *
 * @returns {Promise<{ status: number, body: string }>}
 */
const httpGet = async (url) => {
  try {
    const response = await axios.get(url, {
      timeout: HTTP_TIMEOUT_MS,
      maxRedirects: 5,
      validateStatus: () => true,
      headers: REQUEST_HEADERS,
      httpsAgent: insecureAgent,
      responseType: 'text',
    });
    return { status: Number(response.status) || 404, body: String(response.data ?? '') };
  } catch (_err) {
    return { status: 404, body: '' };
  }
};

/**
 * Title, meta description and text (HTML of every <p>, without scripts / styles / the banner
 * block / buttons) of the live home page.
 * Port of SeoauditController@metaByScraping + the <p> crawl of itemScrapingHome
 */
const readHomePage = (html) => {
  const $ = cheerio.load(html || '');
  const title = $('title').first().text().trim();
  const metaDescription = String($('meta[name="description"]').first().attr('content') || '').trim();

  $('script, style, div.banners, button').remove();
  const description = $('p').map((_index, element) => ` ${$(element).html()}`).get().join('');

  return { title, metaDescription, description };
};

/**
 * Count internal / external links and find broken + http (non https) links of an HTML string.
 * Port of SeoauditController@linkByScraping + pageStatus.
 *
 * Every link is requested once per job (`statusByLink` cache, shared by all items of a job)
 * and at most LINK_CHECK_CONCURRENCY at a time; PHP requested the same link again for every
 * item, one by one. Links in `knownLinks` (seo_links_bigc) are not requested again.
 * Broken rule (same as the Node item editor): internal link >= 400, external link 404/410/5xx.
 *
 * @param {string} html
 * @param {string} domain - store domain without protocol
 * @param {{ knownLinks?: Set<string>, statusByLink?: Map<string, Promise<number>> }} [cache]
 * @returns {Promise<{ internalLink: number, externalLink: number,
 *   brokenLinks: {type: number, link: string, text: string}[], httpLinks: {link: string, text: string}[],
 *   okLinks: string[] }>}
 */
const scanLinks = async (html, domain, { knownLinks = new Set(), statusByLink = new Map() } = {}) => {
  const $ = cheerio.load(String(html || '').replaceAll('%%GLOBAL_ShopPathSSL%%', `https://${domain}`));
  const lowerDomain = String(domain || '').toLowerCase();

  let internalLink = 0;
  let externalLink = 0;
  const httpLinks = [];
  const linksToCheck = [];

  $('a').each((_index, element) => {
    const link = String($(element).attr('href') || '');
    const text = $(element).text();
    const lowerLink = link.toLowerCase();
    const isInternal = lowerLink.includes(lowerDomain);

    if (!lowerLink.includes('http')) {
      internalLink += 1;
      return;
    }
    if (isInternal) internalLink += 1;
    else externalLink += 1;
    if (link.includes('?')) return;

    if (text.trim() && !knownLinks.has(link)) linksToCheck.push({ link, text, isInternal });
    if (!lowerLink.includes('https')) httpLinks.push({ link, text });
  });

  for (let start = 0; start < linksToCheck.length; start += LINK_CHECK_CONCURRENCY) {
    await Promise.all(
      linksToCheck.slice(start, start + LINK_CHECK_CONCURRENCY).map(async (item) => {
        if (!statusByLink.has(item.link)) {
          statusByLink.set(item.link, httpGet(item.link).then((result) => result.status));
        }
        item.status = await statusByLink.get(item.link);
      })
    );
  }

  const isBroken = (item) =>
    item.isInternal ? item.status >= 400 : EXTERNAL_BROKEN_STATUSES.has(item.status);

  return {
    internalLink,
    externalLink,
    brokenLinks: linksToCheck
      .filter(isBroken)
      .map((item) => ({ type: item.isInternal ? 1 : 2, link: item.link, text: item.text })),
    httpLinks,
    okLinks: linksToCheck.filter((item) => item.status === 200).map((item) => item.link),
  };
};

/**
 * SEO points of one audited page (seo_audit_bigc / seo_audit_bigc_points point1..point14).
 * Port of SeoauditController@itemScraping (item pages) and itemScrapingHome (home page):
 *  1 title 40-60 chars (2)        2 meta description 120-160 chars (2)
 *  3 keyword in title (3)         4 keyword in meta description (3)
 *  5 keyword in description / name (3)   6, 7 always 1 (duplicates are checked later)
 *  8 product image alt (1, other types 1)  9 no broken link (1)  10 no lorem ipsum (1)
 *  11 no spelling error or spell check off (1)  12 no http link (1)
 *  13 url < 49 chars (0.5)        14 keyword in url (0.5); home page: 13 and 14 always 0.5
 */
const calculatePoints = ({
  itemType,
  titleTag,
  metaDescription,
  targetKeyword,
  description,
  itemName,
  imageAlt,
  url,
  hasBrokenLink,
  hasLorem,
  hasSpellError,
  hasHttpLink,
}) => {
  const keyword = String(targetKeyword ?? '').toLowerCase();
  const contains = (text) => String(text ?? '').toLowerCase().includes(keyword);
  const titleLength = [...String(titleTag ?? '')].length;
  const metaLength = [...String(metaDescription ?? '')].length;
  const isHome = itemType === 'home';

  return {
    point1: titleLength >= 40 && titleLength <= 60 ? 2 : 0,
    point2: metaLength >= 120 && metaLength <= 160 ? 2 : 0,
    point3: contains(titleTag) ? 3 : 0,
    point4: contains(metaDescription) ? 3 : 0,
    point5: contains(decodeHTML(String(description ?? ''))) || (!isHome && contains(itemName)) ? 3 : 0,
    point6: 1,
    point7: 1,
    point8: itemType !== 'product' || imageAlt ? 1 : 0,
    point9: hasBrokenLink ? 0 : 1,
    point10: hasLorem ? 0 : 1,
    point11: hasSpellError ? 0 : 1,
    point12: hasHttpLink ? 0 : 1,
    point13: isHome || [...String(url ?? '')].length < 49 ? 0.5 : 0,
    point14: isHome || String(url ?? '').toLowerCase().includes(keyword.replaceAll(' ', '-')) ? 0.5 : 0,
  };
};

module.exports = {
  stripTags,
  checkLorem,
  spellLanguage,
  findMisspelledWords,
  httpGet,
  readHomePage,
  scanLinks,
  calculatePoints,
};
