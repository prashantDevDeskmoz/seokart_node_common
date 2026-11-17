'use strict';

/**
 * Port of App\Ai\Prompts\SeoCopilotPrompt (meta title + meta description only).
 * Prompt text is kept identical to the PHP so output quality does not change.
 */

// PHP json_encode(string, UNESCAPED_UNICODE | UNESCAPED_SLASHES) == JSON.stringify.
const promptLiteral = (value) => JSON.stringify(String(value ?? ''));

const clientCustomInstructionsBlock = (customInstructions) => {
  const custom = String(customInstructions || '').trim();
  if (custom === '') return '';

  return (
    '\nCLIENT CUSTOM INSTRUCTIONS (HIGHEST PRIORITY):\n' +
    '- Follow these client instructions whenever they do not force inventing facts or breaking JSON/output format.\n' +
    '- When these conflict with other style/wording preferences above, prefer the client instructions.\n' +
    '- Still never invent unsupported specs/features; keep keyword, length, and JSON rules.\n' +
    `Instructions:\n${custom}\n`
  );
};

/** Shared header fields used by both prompts. */
const buildContext = ({ itemName, itemType, keyword, lang, itemDescription, storeDomain, brand, verifiedAttributes }) => {
  const trimmedLang = String(lang || '').trim() || 'English';
  const trimmedKeyword = String(keyword || '').trim() || itemName;
  const isHome = String(itemType || '').trim().toLowerCase() === 'home';
  const sd = String(storeDomain || '').trim();
  const brandTrim = String(brand || '').trim();
  const attrTrim = String(verifiedAttributes || '').trim();

  return {
    lang: trimmedLang,
    keywordLit: promptLiteral(trimmedKeyword),
    itemNameLit: promptLiteral(itemName),
    itemTypeLit: promptLiteral(isHome ? 'Home Page' : itemType),
    nameLabel: isHome ? 'Brand Name' : 'Item Name',
    itemDescLit: promptLiteral(String(itemDescription || '').trim()),
    pageSubtypeLit: promptLiteral(''),
    langLit: promptLiteral(trimmedLang),
    storeDomainBlock: isHome && sd !== '' ? `Store domain: ${sd}\n` : '',
    brandLine: brandTrim !== '' ? `Brand: ${promptLiteral(brandTrim)}\n` : '',
    verifiedAttributesLine: attrTrim !== '' ? `Verified Attributes: ${promptLiteral(attrTrim)}\n` : '',
  };
};

const metaTitle = ({
  itemName,
  itemType,
  keyword,
  lang = 'English',
  previousTitlePrefixes = [],
  itemDescription = '',
  storeDomain = '',
  customInstructions = '',
  brand = '',
  verifiedAttributes = '',
}) => {
  const c = buildContext({ itemName, itemType, keyword, lang, itemDescription, storeDomain, brand, verifiedAttributes });

  const uniqueTitles = [
    ...new Set(previousTitlePrefixes.map((t) => String(t ?? '').trim()).filter((t) => t !== '')),
  ];
  const previousTitlesList = uniqueTitles.map(promptLiteral).join(', ');

  const previousTitlesSystemBlock =
    previousTitlesList !== ''
      ? `- Do NOT reuse or closely match any of these previous titles: ${previousTitlesList}\n- Write a clearly different title — change wording, structure, or supporting phrase; reordering alone is not enough.\n`
      : '';
  const previousTitlesUserReq =
    previousTitlesList !== '' ? '- Must not match or closely resemble any Previous Title.\n' : '';
  const customBlock = clientCustomInstructionsBlock(customInstructions);

  const system = `You are an SEO meta title writer.

Rules:
- Include ${c.keywordLit} exactly once as one continuous exact phrase.
- Keep the final title strictly within 40–60 characters including spaces when possible.
- If the exact Target Keyword itself makes 60 characters impossible, keep the keyword unchanged and allow the title to exceed 60 rather than shortening or altering it.
- Before returning, count the characters. If under 40, expand using one unused verified detail from Description or Verified Attributes. If over 60 and the keyword itself does not force the excess, remove nonessential wording.
- Never invent information, add generic filler, or repeat information solely to meet the character limit.
- Do not repeat Item Name, Brand, specifications, or other identifying terms already clearly represented in the Target Keyword unless needed for natural wording. Use Brand only when it adds distinct useful information not already present.
- Keep ${c.keywordLit} exactly unchanged.
- Make the title natural, concise, search-focused, and relevant to the page.
- Add one verified differentiator only when it adds useful information not already present in the Target Keyword and fits naturally within 60 characters.
- If model numbers, technical terms, dimensions or units are used, reproduce them accurately.
- Do not invent features, benefits, specifications, materials, compatibility, or use cases.
- Match the supplied Item Type and Page Subtype: use product-specific details for Product pages, category scope for Category pages, informational intent for Blog/Guide pages, and only supported store/brand context for Home and Brand pages.
- Vary the title structure; do not always place the keyword first with a comma and suffix.
- Write like a natural Google title, not a keyword-plus-label template.
- After the keyword, do not repeat words already present in the keyword.
- Do not reuse the same supporting phrase or ending from any Previous Title.
- Prefer flowing phrasing (e.g. "for …", "– …", "| …") over comma-separated tag lists when it fits within 60 characters.
${previousTitlesSystemBlock}- Use ${c.lang} only.
- No keyword stuffing, HTML, markdown, or explanation text.
- Return only valid JSON:
{"meta_title":"..."}`;

  const user = `Item Type: ${c.itemTypeLit}
Page Subtype: ${c.pageSubtypeLit}
${c.nameLabel}: ${c.itemNameLit}
Keyword: ${c.keywordLit}
${c.brandLine}Description: ${c.itemDescLit}
${c.verifiedAttributesLine}Previous Titles: ${previousTitlesList}
${c.storeDomainBlock}Generate exactly 1 SEO meta title.

Requirements:
- Include ${c.keywordLit} exactly once.
- Total length MUST be at least 40 characters; prefer 40–60 when possible.
- Do not add unsupported information.
${previousTitlesUserReq}- Return only JSON:
{"meta_title":"..."}
${customBlock}`;

  return { system, user };
};

const metaDescription = ({
  itemName,
  itemType,
  keyword,
  lang = 'English',
  itemDescription = '',
  storeDomain = '',
  customInstructions = '',
  brand = '',
  verifiedAttributes = '',
}) => {
  const c = buildContext({ itemName, itemType, keyword, lang, itemDescription, storeDomain, brand, verifiedAttributes });
  const customBlock = clientCustomInstructionsBlock(customInstructions);

  const system = `You are an SEO meta description writer.

Rules:
- Include ${c.keywordLit} exactly once as one continuous exact phrase.
- Target 120–160 characters including spaces. Prefer ~145–155 when enough details exist. If Description is short, get as close as possible without inventing specs.
- Before returning, count the characters. If under target and unused verified details remain, expand using an unused verified detail from Description, Brand, or Verified Attributes. If over 160, remove nonessential wording while keeping the Target Keyword unchanged.
- Never invent information, add generic filler, or repeat information solely to meet the character limit.
- Keep ${c.keywordLit} exactly unchanged.
- Use the supplied item description and verified attributes to understand the page.
- Write 1–2 natural, complete sentences. Prefer 1 sentence when the Target Keyword is long.
- Do not write in abbreviated catalog or comma-separated spec-list style.
- Spell out verified details in full natural wording so the description reads like normal sentences.
- Add verified details only as needed to reach the target range; stop once within range.
- Use verified page-specific details when they improve relevance and readability.
- Prefer specific factual information over generic promotional wording.
- Do not invent or infer unsupported features, benefits, specifications, compatibility, performance, durability, health, safety, or use cases.
- Match the supplied Item Type and Page Subtype: use product-specific details for Product pages, category scope for Category pages, informational wording for Blog/Guide pages, and only supported store/brand context for Home and Brand pages.
- Do not repeat Item Name, Brand, specifications, or other identifying information already clearly represented in the Target Keyword unless needed for natural wording.
- Use Brand only when it adds distinct useful information not already present.
- Do not use generic filler, stock closing phrases, or unnecessary CTAs.
- Use ${c.lang} only.
- No quotes, HTML, markdown, or explanation text.
- Return only valid JSON:
{"meta_description":"..."}`;

  const user = `Item Type: ${c.itemTypeLit}
Page Subtype: ${c.pageSubtypeLit}
${c.nameLabel}: ${c.itemNameLit}
Target Keyword: ${c.keywordLit}
${c.brandLine}Description: ${c.itemDescLit}
${c.verifiedAttributesLine}Language: ${c.langLit}
${c.storeDomainBlock}Generate exactly 1 SEO meta description following the System rules.

Requirements:
- Include the Target Keyword exactly once.
- Target 120–160 characters. Prefer ~145–155 when enough details exist. If Description is short, get as close as possible without inventing specs.
- Write 1–2 full sentences, not a short spec list.
- Do not add unsupported information.

Return only:
{"meta_description":"..."}
${customBlock}`;

  return { system, user };
};

const imageAltSystemPrompt = (lang) =>
  'You are an expert e-commerce SEO image alt text writer.\n\n' +
  `Generate accurate, natural, and descriptive ${lang} alt text based on the provided product image and product name.\n\n` +
  'Rules:\n' +
  '1. Identify the actual product shown in the image.\n' +
  '2. Use the product name as context to accurately identify the product, but do not blindly copy it.\n' +
  '3. Prioritize the product type, distinguishing features, and clearly visible attributes such as color, material, design, and pattern.\n' +
  '4. Preserve important product identifiers such as brand, model, size, or variant when relevant and supported by the provided context.\n' +
  '5. Describe the specific image rather than repeating identical alt text across different product images.\n' +
  '6. Avoid describing backgrounds, surroundings, or positioning unless essential to understanding the product.\n' +
  '7. Never invent product specifications or visual details.\n' +
  '8. Avoid promotional language, keyword stuffing, and phrases such as "image of", "photo of", or "picture of".\n' +
  '9. Keep the alt text concise, natural, and under 100 characters.\n' +
  '10. If the image does not match the product name, describe what is visible in the image.\n' +
  '11. Return only the final alt text without quotation marks or explanations.';

module.exports = { metaTitle, metaDescription, imageAltSystemPrompt, promptLiteral };
