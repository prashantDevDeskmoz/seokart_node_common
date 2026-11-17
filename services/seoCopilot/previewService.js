'use strict';

const axios = require('axios');
const { createAiService } = require('./aiService');
const { calculateCost } = require('./pricing');
const { CONTROL_CHARS } = require('./text');
const { logError } = require('../../utils/logger');

const str = (value) => String(value ?? '').trim();

/** Port of SeoCopilotPreviewController::sanitizeCustomInstructions. */
const sanitizeCustomInstructions = (value) =>
  Array.from(str(value))
    .slice(0, 2000)
    .join('')
    .replace(CONTROL_CHARS, '')
    .replace(/[\r\n]/g, ' ')
    .trim();

const validationFailed = (fields) => ({
  success: 0,
  error: 'validation_failed',
  messages: Object.fromEntries(fields.map((field) => [field, [`The ${field} field is required.`]])),
});

const missingFields = (input, required) => required.filter((field) => str(input?.[field]) === '');

/** GET a BigCommerce catalog resource; returns decoded JSON or {} (same as the PHP helper). */
const fetchBigCommerceCatalogJson = async (storeHash, accessToken, catalogPath) => {
  const hash = str(storeHash);
  const token = str(accessToken);
  if (hash === '' || token === '') return {};

  try {
    const resp = await axios.get(`https://api.bigcommerce.com/stores/${hash}/${String(catalogPath).replace(/^\/+/, '')}`, {
      headers: { 'X-Auth-Token': token, Accept: 'application/json', 'Content-Type': 'application/json' },
      timeout: 20000,
      validateStatus: () => true,
    });
    if (resp.status !== 200) {
      logError({ message: 'SeoCopilotPreview: fetchBigCommerceCatalogJson non-200', path: catalogPath, status: resp.status });
      return {};
    }
    return resp.data && typeof resp.data === 'object' ? resp.data : {};
  } catch (error) {
    logError({ message: 'SeoCopilotPreview: fetchBigCommerceCatalogJson failed', path: catalogPath, error: error.message });
    return {};
  }
};

/** One product image by id, falling back to the first catalog image. */
const fetchProductImageRow = async (storeHash, accessToken, productId, imageId) => {
  if (productId <= 0) return null;

  if (imageId > 0) {
    const imageData = await fetchBigCommerceCatalogJson(storeHash, accessToken, `/v3/catalog/products/${productId}/images/${imageId}`);
    if (imageData?.data && typeof imageData.data === 'object') return imageData.data;
  }

  const imagesData = await fetchBigCommerceCatalogJson(
    storeHash,
    accessToken,
    `/v3/catalog/products/${productId}/images?limit=1&sort=sort_order`
  );
  const first = Array.isArray(imagesData?.data) ? imagesData.data[0] : null;
  return first && typeof first === 'object' ? first : null;
};

const isValidUrl = (value) => {
  try {
    return Boolean(new URL(value));
  } catch (_) {
    return false;
  }
};

/**
 * Port of SeoCopilotPreviewController (generateMetaTitle / generateMetaDesc / generateImageAlt).
 * Each method resolves to the JSON body the PHP route returned, so callers can read
 * `result.data.meta_title` exactly as before - there is just no HTTP hop any more.
 *
 * @param {{AiBulkModels:any, AiImageAltModels:any, AiBulkPreviewGenerations:any, StoreInfo?:any}} models
 */
const createPreviewService = (models) => {
  const ai = createAiService(models);

  /** Insert the audit row; returns the new id or throws (caller maps to db_insert_failed). */
  const saveGeneration = async (fields, result, pricing, resultText, status, failMessage) => {
    const usage = result.usage || {};
    const promptTokens = Number(usage.prompt_tokens) || 0;
    const completionTokens = Number(usage.completion_tokens) || 0;
    const cost = calculateCost(promptTokens, completionTokens, pricing);
    const now = new Date();

    const row = await models.AiBulkPreviewGenerations.create({
      ...fields,
      model: str(result.model),
      result_text: resultText,
      prompt_tokens: promptTokens > 0 ? promptTokens : null,
      completion_tokens: completionTokens > 0 ? completionTokens : null,
      total_prompts: cost.total_prompts || null,
      prompt_cost: cost.prompt_cost,
      completion_cost: cost.completion_cost,
      total_cost: cost.total_cost,
      system_prompt: str(result.system_prompt),
      user_prompt: str(result.user_prompt),
      status,
      error_message: status === 'failed' ? failMessage : null,
      created_at: now,
      updated_at: now,
    });
    return row.id ?? null;
  };

  const dbInsertFailed = (label, error) => {
    logError({ message: `SeoCopilotPreview::${label} - db insert failed`, error: error.message });
    return { success: 0, error: 'db_insert_failed', message: error.message };
  };

  /** Shared body of generateMetaTitle / generateMetaDesc (they differ only in task + AI call). */
  const generateMeta = async (input, { task, label, resultKey, message, keywordRequired, generate }) => {
    const required = ['shop', 'store_id', 'channel_id', 'type', 'item_id', 'item_name'];
    if (keywordRequired) required.push('target_keyword');
    const missing = missingFields(input, required);
    if (missing.length) return validationFailed(missing);

    const itemType = str(input.item_type) || str(input.type);
    const itemName = str(input.item_name);
    const keyword = str(input.target_keyword) || itemName;
    const lang = str(input.lang) || 'English';
    const customInstructions = sanitizeCustomInstructions(input.custom_instructions);

    const result = await generate({
      itemName,
      itemType,
      keyword,
      lang,
      itemDescription: String(input.item_description ?? ''),
      storeDomain: String(input.store_domain ?? ''),
      customInstructions,
    });

    const text = result[resultKey] ?? null;
    const status = typeof text === 'string' && text.trim() !== '' ? 'success' : 'failed';

    try {
      const insertId = await saveGeneration(
        {
          store_url: str(input.shop),
          platform: str(input.platform) || 'bigcommerce',
          store_id: str(input.store_id),
          channel_id: str(input.channel_id),
          item_type: itemType,
          item_id: str(input.item_id),
          item_name: itemName,
          keyword,
          lang,
          task,
          custom_instructions: customInstructions !== '' ? customInstructions : null,
        },
        result,
        result.pricing,
        text,
        status,
        `${task}_empty_or_invalid`
      );

      return {
        status_code: 200,
        data: { success: status === 'success' ? 1 : 0, insert_id: insertId, [resultKey]: text },
        message,
      };
    } catch (error) {
      return dbInsertFailed(label, error);
    }
  };

  const generateMetaTitle = (input) =>
    generateMeta(input, {
      task: 'meta_title',
      label: 'generateMetaTitle',
      resultKey: 'meta_title',
      message: 'Meta title generated',
      keywordRequired: false,
      generate: ai.generateMetaTitle,
    });

  const generateMetaDesc = (input) =>
    generateMeta(input, {
      task: 'meta_description',
      label: 'generateMetaDesc',
      resultKey: 'meta_description',
      message: 'Meta description generated',
      keywordRequired: true,
      generate: ai.generateMetaDescription,
    });

  const generateImageAlt = async (input) => {
    const missing = missingFields(input, ['shop', 'product_id']);
    if (missing.length) return validationFailed(missing);

    const shopUrl = str(input.shop);
    const channelId = str(input.channel_id);
    const productId = Math.trunc(Number(input.product_id)) || 0;
    const imageId = Math.trunc(Number(input.image_id)) || 0;
    const lang = str(input.lang) || 'English';
    const customInstructions = sanitizeCustomInstructions(input.custom_instructions);

    if (productId <= 0) {
      return { success: 0, error: 'invalid_product_id', message: 'product_id must be a valid positive integer' };
    }

    let accessToken = str(input.access_token);
    let storeId = '';
    if (accessToken === '') {
      const storeInfo = models.StoreInfo
        ? await models.StoreInfo.findOne({ where: { store_hash: shopUrl }, attributes: ['id', 'access_token'], raw: true })
        : null;
      if (!storeInfo || str(storeInfo.access_token) === '') {
        return { success: 0, error: 'store_token_missing', message: 'Store access token missing' };
      }
      accessToken = str(storeInfo.access_token);
      storeId = String(storeInfo.id ?? '');
    }

    const imageRow = await fetchProductImageRow(shopUrl, accessToken, productId, imageId);
    if (!imageRow) {
      return { success: 0, error: 'image_not_found', message: 'Product image not found' };
    }

    const imageUrl = str(imageRow.url_standard || imageRow.url_zoom || imageRow.url_thumbnail);
    if (imageUrl === '' || !isValidUrl(imageUrl)) {
      return { success: 0, error: 'invalid_image_url', message: 'Image URL not available from BigCommerce' };
    }

    const productData = await fetchBigCommerceCatalogJson(shopUrl, accessToken, `/v3/catalog/products/${productId}`);
    const itemName = str(productData?.data?.name);

    const brandId = Number(productData?.data?.brand_id) || 0;
    const categoryId = Number(productData?.data?.categories?.[0]) || 0;
    const [brandData, categoryData] = await Promise.all([
      brandId > 0 ? fetchBigCommerceCatalogJson(shopUrl, accessToken, `/v3/catalog/brands/${brandId}`) : {},
      categoryId > 0
        ? fetchBigCommerceCatalogJson(shopUrl, accessToken, `/v3/catalog/trees/categories?category_id:in=${categoryId}`)
        : {},
    ]);

    const result = await ai.generateImageAltText({
      imageUrl,
      productName: itemName,
      lang,
      customInstructions,
      brand: str(brandData?.data?.name),
      category: str(categoryData?.data?.[0]?.name),
    });

    const altText = result.alt_text ?? null;
    const status = typeof altText === 'string' && altText.trim() !== '' ? 'success' : 'failed';

    try {
      const insertId = await saveGeneration(
        {
          store_url: shopUrl,
          platform: 'bigcommerce',
          store_id: storeId !== '' ? storeId : null,
          channel_id: channelId !== '' ? channelId : null,
          item_type: 'product',
          item_id: String(productId),
          item_name: itemName !== '' ? itemName : null,
          keyword: null,
          lang,
          task: 'image_alt',
          custom_instructions: customInstructions !== '' ? customInstructions : null,
        },
        result,
        result.pricing,
        altText,
        status,
        'alt_text_empty_or_invalid'
      );

      return {
        status_code: 200,
        data: { success: status === 'success' ? 1 : 0, insert_id: insertId, alt_text: altText },
        message: 'Image alt text generated',
      };
    } catch (error) {
      return dbInsertFailed('generateImageAlt', error);
    }
  };

  return { generateMetaTitle, generateMetaDesc, generateImageAlt };
};

module.exports = { createPreviewService, sanitizeCustomInstructions };
