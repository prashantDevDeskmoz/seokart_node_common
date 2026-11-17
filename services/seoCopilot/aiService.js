'use strict';

const prompts = require('./prompts');
const text = require('./text');
const { chatCompletions } = require('./openAiClient');
const { BULK_DEFAULTS, IMAGE_ALT_DEFAULTS, getActiveModel } = require('./pricing');
const { logError } = require('../../utils/logger');

const isValidUrl = (value) => {
  try {
    return Boolean(new URL(value));
  } catch (_) {
    return false;
  }
};

const usageOf = (data) => (data?.usage && typeof data.usage === 'object' ? data.usage : {});

/**
 * Port of App\Services\Ai\SeoCopilotAiService (meta title, meta description, image alt).
 * Every method resolves the active model + pricing from the DB, calls OpenAI and never throws:
 * on failure the text field is null and usage is {}.
 *
 * @param {{AiBulkModels: any, AiImageAltModels: any}} models
 */
const createAiService = (models) => {
  const getBulkModel = () => getActiveModel(models.AiBulkModels, BULK_DEFAULTS);
  const getImageAltModel = () => getActiveModel(models.AiImageAltModels, IMAGE_ALT_DEFAULTS);

  const generateMetaTitle = async (params) => {
    const { system, user } = prompts.metaTitle(params);
    const pricing = await getBulkModel();
    const failed = { meta_title: null, usage: {}, system_prompt: system, user_prompt: user, model: pricing.model_key, pricing };

    try {
      const data = await chatCompletions({
        model: pricing.model_key,
        temperature: 0.7,
        // Enough room for JSON + long keywords / special chars (80 was truncating mid-JSON)
        max_tokens: 200,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      });

      const { value } = text.readJsonField(data?.choices?.[0]?.message?.content ?? '{}', 'meta_title');
      let metaTitle = text.enforceExactKeywordIfMissing(value, params.keyword, 70);
      metaTitle = text.ensureKeywordInMetaTitle(metaTitle, params.keyword);
      metaTitle = text.clampMetaTitleLength(metaTitle, params.keyword);

      if (!metaTitle) {
        logError({ message: 'SeoCopilotAiService: meta_title missing after parse', model: pricing.model_key });
      }
      return { ...failed, meta_title: metaTitle, usage: usageOf(data) };
    } catch (error) {
      logError({ message: 'SeoCopilotAiService::generateMetaTitle error', error: error.message });
      return failed;
    }
  };

  const generateMetaDescription = async (params) => {
    const { system, user } = prompts.metaDescription(params);
    const pricing = await getBulkModel();
    const failed = { meta_description: null, usage: {}, system_prompt: system, user_prompt: user, model: pricing.model_key, pricing };

    try {
      const data = await chatCompletions({
        model: pricing.model_key,
        temperature: 0.65,
        max_tokens: 280,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      });

      const { value } = text.readJsonField(data?.choices?.[0]?.message?.content ?? '{}', 'meta_description');
      let metaDesc = text.enforceExactKeywordIfMissing(value, params.keyword, 70);
      metaDesc = text.expandMetaDescriptionTowardTarget(metaDesc);

      if (!metaDesc) {
        logError({ message: 'SeoCopilotAiService: meta_description missing after parse', model: pricing.model_key });
      }
      return { ...failed, meta_description: metaDesc, usage: usageOf(data) };
    } catch (error) {
      logError({ message: 'SeoCopilotAiService::generateMetaDescription error', error: error.message });
      return failed;
    }
  };

  /** Vision alt text. customInstructions is passed as-is (no [[var]] resolving). */
  const generateImageAltText = async ({
    imageUrl,
    productName = '',
    lang = 'English',
    customInstructions = '',
    brand = '',
    category = '',
  }) => {
    const url = String(imageUrl || '').trim();
    const language = String(lang || '').trim() || 'English';
    const custom = String(customInstructions || '').trim();
    const name = String(productName || '').trim();
    const brandName = String(brand || '').trim();
    const categoryName = String(category || '').trim();

    const pricing = await getImageAltModel();
    const system = prompts.imageAltSystemPrompt(language);

    const userParts = [];
    if (name !== '') userParts.push(`Product name (context only, do not copy blindly): ${name}`);
    if (brandName !== '') userParts.push(`Brand: ${brandName}`);
    if (categoryName !== '') userParts.push(`Category: ${categoryName}`);
    if (custom !== '') {
      userParts.push(
        `CLIENT CUSTOM INSTRUCTIONS (HIGHEST PRIORITY) — follow when compatible with the image; prefer these over other style preferences; never invent unsupported details:\n${custom}`
      );
    }
    userParts.push('Write alt text for this product image.');
    const userText = userParts.join('\n');

    const failed = { alt_text: null, usage: {}, system_prompt: system, user_prompt: userText, model: pricing.model_key, pricing };

    if (url === '' || !isValidUrl(url)) {
      logError({ message: 'SeoCopilotAiService::generateImageAltText invalid image_url', image_url: url });
      return failed;
    }

    try {
      const payload = {
        model: pricing.model_key,
        max_tokens: 500,
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content: [
              { type: 'text', text: userText },
              { type: 'image_url', image_url: { url, detail: 'low' } },
            ],
          },
        ],
      };
      if (pricing.model_key.toLowerCase().startsWith('gpt-5')) payload.reasoning_effort = 'minimal';

      const data = await chatCompletions(payload);
      if (data?.error) {
        logError({ message: 'SeoCopilotAiService::generateImageAltText OpenAI error', error: data.error });
        return failed;
      }

      let content = data?.choices?.[0]?.message?.content ?? '';
      if (Array.isArray(content)) {
        content = content
          .map((part) => (typeof part === 'string' ? part : part?.text !== undefined ? String(part.text) : null))
          .filter((part) => part !== null)
          .join(' ');
      }

      let altText = String(content).trim().replace(/^[ \t\n\r\0\x0B"']+|[ \t\n\r\0\x0B"']+$/g, '');
      altText = altText.replace(/\s{2,}/g, ' ').replace(/[\t\n]/g, ' ').trim();

      if (altText === '') {
        logError({ message: 'SeoCopilotAiService::generateImageAltText empty content', model: pricing.model_key });
      } else if (Array.from(altText).length > 125) {
        // Soft cap near common SEO alt guidance
        altText = Array.from(altText).slice(0, 125).join('');
      }

      return { ...failed, alt_text: altText !== '' ? altText : null, usage: usageOf(data) };
    } catch (error) {
      logError({ message: 'SeoCopilotAiService::generateImageAltText error', error: error.message });
      return failed;
    }
  };

  return { generateMetaTitle, generateMetaDescription, generateImageAltText };
};

module.exports = { createAiService };
