'use strict';

const TEMPLATE_KEYS = ['name', 'sku', 'price', 'type', 'mpn', 'category', 'brand', 'condition'];

/**
 * Fill a template like '[[name]] by [[brand]]' with product values.
 * Same cleanup as PHP: ', ' → ' ', repeated whitespace / tabs / new lines → one space.
 *
 * @param {string} template
 * @param {object} productData - result of getProductTemplateData
 */
const applyProductTemplate = (template, productData) => {
  let text = String(template || '').replaceAll(', ', ' ');

  for (const key of TEMPLATE_KEYS) {
    text = text.replaceAll(`[[${key}]]`, String(productData?.[key] ?? ''));
  }

  return text.replace(/\s{2,}/g, ' ').replace(/[\t\n]/g, ' ');
};

/**
 * Parse the imgopt_setting.setting column (JSON string or object).
 *
 * @param {string|object|null} raw
 * @returns {object|null}
 */
const parseImageSetting = (raw) => {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch (_err) {
    return null;
  }
};

/**
 * Work out what to apply to an image from the store's image optimizer setting.
 * Port of ImgoptController@get_setting_value (without DB access).
 *
 * AI alt text needs the database (credits, models, usage log), so the caller passes it in
 * as `generateAiAlt`. Pass it only when the store uses AI alt mode; otherwise the alt
 * template is used.
 *
 * @param {object} params
 * @param {object} params.setting - parsed imgopt_setting.setting
 * @param {object|null} params.productData - result of getProductTemplateData
 * @param {boolean} [params.skipAiAlt=false] - alt was already generated (SEO Copilot)
 * @param {(productData: object|null) => Promise<{ altText?: string, creditsExhausted?: boolean }>} [params.generateAiAlt]
 * @returns {Promise<{
 *   fileNameStatus: number, altStatus: number, fileSizeStatus: number,
 *   fileName: string, altText: string, imgQuality: string, convertPngToJpg: number,
 *   aiCreditsExhausted: boolean
 * }>}
 */
const resolveImageSetting = async ({ setting, productData, skipAiAlt = false, generateAiAlt }) => {
  const fileNameStatus = Number(setting?.file_name_status) === 1 ? 1 : 0;
  const altStatus = Number(setting?.alt_status) === 1 ? 1 : 0;
  const fileSizeStatus = Number(setting?.file_size_status) === 1 ? 1 : 0;

  const fileName = fileNameStatus
    ? applyProductTemplate(setting.file_name_data?.file_data, productData)
    : '';

  let altText = '';
  let aiCreditsExhausted = false;

  if (altStatus && !skipAiAlt) {
    if (typeof generateAiAlt === 'function') {
      try {
        // product data (brand / category) is passed so the AI call does not load it again
        const aiResult = await generateAiAlt(productData);
        aiCreditsExhausted = Boolean(aiResult?.creditsExhausted);
        altText = String(aiResult?.altText || '').trim();
      } catch (err) {
        console.warn('AI alt generation failed, using alt template', { error: err.message });
      }
    }

    // Credits exhausted: no template fallback, the caller stops the optimization.
    if (!altText && !aiCreditsExhausted) {
      altText = applyProductTemplate(setting.alt_data?.alt_data, productData);
    }
  }

  return {
    fileNameStatus,
    altStatus,
    fileSizeStatus,
    fileName,
    altText,
    imgQuality: fileSizeStatus ? setting.file_size_data?.img_quality || '' : '',
    convertPngToJpg: fileSizeStatus && Number(setting.file_size_data?.cnvrt_png_jpg) === 1 ? 1 : 0,
    aiCreditsExhausted,
  };
};

module.exports = {
  TEMPLATE_KEYS,
  applyProductTemplate,
  parseImageSetting,
  resolveImageSetting,
};
