'use strict';

const axios = require('axios');
const { bigCApiCall } = require('../bigcommerce/bigCapi');

/**
 * AI alt text for a product image (OpenAI vision), shared by the API and the worker.
 * Port of App\Ai\Prompts\ImageOptimizerPrompt + ImageOptimizerAiService + AiImageAltModel@calculateCost.
 *
 * No database access here: the caller passes the active model / pricing and a `saveGeneration`
 * callback (ai_image_alt_generations row), and counts the used credit on success.
 */

const DEFAULT_AI_ALT_MODEL = 'gpt-5-nano';
const DEFAULT_AI_ALT_PRICING = { model_key: DEFAULT_AI_ALT_MODEL, input_per_1m: 0.05, output_per_1m: 0.4 };
const MAX_ALT_CHARS = 100;
const MAX_TOKENS = 500;
const IMAGE_DETAIL = 'low';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_TIMEOUT_MS = 60000;

const aiAltSystemPrompt = (lang = 'English') => {
  const language = String(lang || '').trim() || 'English';
  return (
    'You are an expert e-commerce SEO image alt text writer.' +
    '\n\n' +
    `Generate accurate, natural, and descriptive ${language} alt text based on the provided product image and product name.` +
    '\n\n' +
    'Rules:' +
    '\n1. Identify the actual product shown in the image.' +
    '\n2. Use the product name as context to accurately identify the product, but do not blindly copy it.' +
    '\n3. Prioritize the product type, distinguishing features, and clearly visible attributes such as color, material, design, and pattern.' +
    '\n4. Preserve important product identifiers such as brand, model, size, or variant when relevant and supported by the provided context.' +
    '\n5. Describe the specific image rather than repeating identical alt text across different product images.' +
    '\n6. Avoid describing backgrounds, surroundings, or positioning unless essential to understanding the product.' +
    '\n7. Never invent product specifications or visual details.' +
    '\n8. Avoid promotional language, keyword stuffing, and phrases such as "image of", "photo of", or "picture of".' +
    `\n9. Keep the alt text concise, natural, and under ${MAX_ALT_CHARS} characters.` +
    '\n10. If the image does not match the product name, describe what is visible in the image.' +
    '\n11. Return only the final alt text without quotation marks or explanations.'
  );
};

const aiAltUserPrompt = (productName = '', brand = '', category = '') => {
  const lines = [`Product: ${String(productName || '').trim()}`];
  if (String(brand || '').trim()) lines.push(`Brand: ${String(brand).trim()}`);
  if (String(category || '').trim()) lines.push(`Category: ${String(category).trim()}`);
  lines.push('Reply with only the alt text.');
  return lines.join('\n');
};

/** Alt ON + AI mode (PHP no longer limits AI alt to the demo store) */
const canUseAiAlt = (altMode, altStatus = 1) => {
  if (Number(altStatus) !== 1) return false;
  return String(altMode || '').trim().toLowerCase() === 'ai';
};

/** Port of AiImageAltModel::calculateCost */
const calculateAiAltCost = (promptTokens, completionTokens, pricing) => {
  const inputPer1m = Number(pricing?.input_per_1m ?? 0);
  const outputPer1m = Number(pricing?.output_per_1m ?? 0);
  const promptCost = (inputPer1m / 1000000) * Number(promptTokens || 0);
  const completionCost = (outputPer1m / 1000000) * Number(completionTokens || 0);

  return {
    total_prompts: Number(promptTokens || 0) + Number(completionTokens || 0),
    prompt_cost: promptCost.toFixed(7),
    completion_cost: completionCost.toFixed(7),
    total_cost: (promptCost + completionCost).toFixed(7),
  };
};

/**
 * OpenAI chat completions (key: OPEN_AI_LIVE_KEY, else OPENAI_API_KEY).
 * Port of App\Services\Ai\OpenAiClient@chatCompletions. Returns { error } on failure.
 */
const chatCompletions = async (payload) => {
  const rawKey = String(process.env.OPEN_AI_LIVE_KEY || process.env.OPENAI_API_KEY || '').trim();
  if (!rawKey) return { error: { message: 'OpenAI API key missing (OPEN_AI_LIVE_KEY / OPENAI_API_KEY)' } };
  const authorization = rawKey.toLowerCase().startsWith('bearer ') ? rawKey : `Bearer ${rawKey}`;

  // newer models take max_completion_tokens instead of max_tokens
  const body = { ...payload };
  if (/^(o[1-4]|gpt-4\.1|gpt-5)/i.test(String(body.model || '')) && body.max_tokens != null) {
    body.max_completion_tokens = body.max_tokens;
    delete body.max_tokens;
  }

  try {
    const resp = await axios.post(OPENAI_URL, body, {
      headers: { 'Content-Type': 'application/json', Authorization: authorization },
      validateStatus: () => true,
      timeout: OPENAI_TIMEOUT_MS,
    });
    return resp.data && typeof resp.data === 'object' ? resp.data : { error: { message: 'OpenAI non-JSON response' } };
  } catch (err) {
    return { error: { message: err.message } };
  }
};

const resolveImageUrl = (imageData) => {
  const imageUrl = String(imageData?.url_standard || imageData?.url_thumbnail || imageData?.url_zoom || '').trim();
  try {
    return new URL(imageUrl).href ? imageUrl : '';
  } catch (_err) {
    return '';
  }
};

const extractMessageContent = (data) => {
  const content = data?.choices?.[0]?.message?.content;
  if (!Array.isArray(content)) return String(content || '').trim();
  return content
    .map((part) => (typeof part === 'string' ? part : part?.text != null ? String(part.text) : ''))
    .filter(Boolean)
    .join(' ')
    .trim();
};

const normalizeAltText = (altText) =>
  String(altText || '')
    .trim()
    .replace(/^["'\s]+|["'\s]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/[\t\n]/g, ' ')
    .trim();

const buildOpenAiPayload = (model, imageUrl, systemPrompt, userPrompt) => ({
  model,
  max_tokens: MAX_TOKENS,
  messages: [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: [
        { type: 'text', text: userPrompt },
        { type: 'image_url', image_url: { url: imageUrl, detail: IMAGE_DETAIL } },
      ],
    },
  ],
  ...(String(model).toLowerCase().startsWith('gpt-5') && { reasoning_effort: 'minimal' }),
});

/** Brand and first category name of a product, for the prompt (when the caller has not loaded them). */
const loadBrandAndCategory = async (product, accessToken, shop) => {
  const brandId = Number(product.brand_id || 0);
  const categoryId = Number(product.categories?.[0] || 0);
  const [brandResp, categoryResp] = await Promise.all([
    brandId > 0 ? bigCApiCall(`brands/${brandId}`, accessToken, shop) : null,
    categoryId > 0 ? bigCApiCall(`trees/categories?category_id:in=${categoryId}`, accessToken, shop) : null,
  ]);
  return {
    brand: String(brandResp?.data?.name || '').trim(),
    category: String((Array.isArray(categoryResp?.data) ? categoryResp.data[0] : null)?.name || '').trim(),
  };
};

/**
 * Generate the alt text of one product image with OpenAI.
 * Port of ImageOptimizerAiService::generateAltForProductImage (without the DB parts).
 *
 * @param {object} params
 * @param {string} params.shop - store hash
 * @param {string} params.accessToken
 * @param {number} params.productId
 * @param {number} params.imageId
 * @param {string} [params.lang='English']
 * @param {string|null} [params.brand] - null = load from BigCommerce
 * @param {string|null} [params.category] - null = load from BigCommerce
 * @param {{ model_key: string, input_per_1m: number, output_per_1m: number }} [params.pricing] - active model
 * @param {(row: object) => Promise<void>} [params.saveGeneration] - saves the ai_image_alt_generations row
 * @returns {Promise<object>} { success: 1|0, alt_text, message, ... } (same shape as PHP)
 */
const generateImageAltText = async ({
  shop,
  accessToken,
  productId,
  imageId,
  lang = 'English',
  brand = null,
  category = null,
  pricing = DEFAULT_AI_ALT_PRICING,
  saveGeneration = async () => {},
}) => {
  const storeHash = String(shop || '').trim();
  const token = String(accessToken || '').trim();
  const language = String(lang || '').trim() || 'English';
  const model = String(pricing?.model_key || DEFAULT_AI_ALT_MODEL).trim() || DEFAULT_AI_ALT_MODEL;
  const base = { success: 0, alt_text: '', model, product_id: productId, image_id: imageId, product_name: '', image_url: '' };

  if (!(productId > 0) || !(imageId > 0)) {
    return { ...base, message: 'product_id and image_id must be valid positive integers' };
  }
  if (!storeHash || !token) return { ...base, message: 'Store hash or access token missing' };

  const imageResp = await bigCApiCall(`products/${productId}/images/${imageId}`, token, storeHash);
  const imageData = imageResp?.data;
  if (!imageData || typeof imageData !== 'object' || !Object.keys(imageData).length) {
    return { ...base, message: 'Product image not found' };
  }
  const imageUrl = resolveImageUrl(imageData);
  if (!imageUrl) return { ...base, message: 'Image URL not available from BigCommerce' };

  const productResp = await bigCApiCall(`products/${productId}`, token, storeHash);
  const product = productResp?.data && typeof productResp.data === 'object' ? productResp.data : {};
  const productName = String(product.name || '').trim();
  const loaded = brand === null || category === null ? await loadBrandAndCategory(product, token, storeHash) : {};

  const systemPrompt = aiAltSystemPrompt(language);
  const userPrompt = aiAltUserPrompt(productName, brand ?? loaded.brand, category ?? loaded.category);
  const data = await chatCompletions(buildOpenAiPayload(model, imageUrl, systemPrompt, userPrompt));
  const logRow = {
    store_url: storeHash,
    product_id: productId,
    image_id: imageId,
    image_url: imageUrl,
    system_prompt: systemPrompt,
    user_prompt: userPrompt,
  };
  const withImage = { ...base, product_name: productName, image_url: imageUrl };

  if (data?.error) {
    const message = String(data.error?.message || 'OpenAI error');
    console.error('generateImageAltText OpenAI error', { error: data.error, shop: storeHash, productId, imageId, model });
    await saveGeneration({ ...logRow, result_text: null, error_message: message });
    return { ...withImage, message };
  }

  const altText = normalizeAltText(extractMessageContent(data));
  const usage = data?.usage && typeof data.usage === 'object' ? data.usage : {};
  const promptTokens = Number(usage.prompt_tokens || 0);
  const completionTokens = Number(usage.completion_tokens || 0);
  const cost = calculateAiAltCost(promptTokens, completionTokens, pricing);
  const usageRow = {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens,
    prompt_cost: cost.prompt_cost,
    completion_cost: cost.completion_cost,
    total_cost: cost.total_cost,
  };

  if (!altText) {
    const message = 'Alt text missing from model response';
    await saveGeneration({ ...logRow, ...usageRow, result_text: null, error_message: message });
    return {
      ...withImage,
      finish_reason: data?.choices?.[0]?.finish_reason,
      refusal: data?.choices?.[0]?.message?.refusal,
      usage,
      message,
    };
  }

  await saveGeneration({ ...logRow, ...usageRow, result_text: altText, error_message: null });
  return { ...withImage, success: 1, alt_text: altText, usage, ...usageRow, message: 'Image alt text generated' };
};

module.exports = {
  DEFAULT_AI_ALT_MODEL,
  DEFAULT_AI_ALT_PRICING,
  aiAltSystemPrompt,
  aiAltUserPrompt,
  canUseAiAlt,
  calculateAiAltCost,
  generateImageAltText,
};
