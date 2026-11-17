'use strict';

const axios = require('axios');
const { BIGC_API_BASE, BIGCAPI, requestWithRateLimit, isBigcError } = require('./bigCapi');

const UPLOAD_TIMEOUT_MS = 60000;

const imagesPath = (productId) => `/v3/catalog/products/${productId}/images`;

/**
 * Get one product image from BigCommerce.
 *
 * @param {string} shop - store hash
 * @param {string} accessToken
 * @param {number|string} productId
 * @param {number|string} imageId
 * @returns {Promise<object|null>} BigCommerce image object, or null when not found
 */
const getProductImage = async (shop, accessToken, productId, imageId) => {
  const res = await BIGCAPI('GET', `${imagesPath(productId)}/${imageId}`, '', shop, accessToken);
  if (isBigcError(res)) return null;
  return res.data?.data || null;
};

/**
 * Upload an image file to a product (multipart `image_file`).
 *
 * The PHP app saved the file on its own server and sent BigCommerce an `image_url`.
 * Uploading the bytes directly means no public folder is needed, so this works the
 * same from the API server and from the worker server.
 *
 * @param {object} params
 * @param {string} params.shop - store hash
 * @param {string} params.accessToken
 * @param {number|string} params.productId
 * @param {Buffer} params.buffer - image bytes
 * @param {string} params.fileName - file name BigCommerce will store
 * @param {string} params.mime - e.g. 'image/jpeg'
 * @param {string} [params.description] - alt text
 * @param {boolean} [params.isThumbnail=false]
 * @param {number} [params.sortOrder=0]
 * @returns {Promise<object|null>} the new BigCommerce image object, or null on failure
 */
const createProductImage = async ({
  shop,
  accessToken,
  productId,
  buffer,
  fileName,
  mime,
  description = '',
  isThumbnail = false,
  sortOrder = 0,
}) => {
  try {
    const form = new FormData();
    form.append('image_file', new Blob([buffer], { type: mime }), fileName);
    form.append('is_thumbnail', String(Boolean(isThumbnail)));
    form.append('sort_order', String(Number(sortOrder) || 0));
    if (description) {
      form.append('description', description);
    }

    const resp = await requestWithRateLimit(shop, () =>
      axios.post(`${BIGC_API_BASE}/${shop}${imagesPath(productId)}`, form, {
        headers: { 'X-Auth-Token': accessToken, Accept: 'application/json' },
        timeout: UPLOAD_TIMEOUT_MS,
        maxBodyLength: Infinity,
        validateStatus: () => true,
      })
    );

    if (resp.status !== 200 && resp.status !== 201) {
      console.warn('BigC image upload failed', { shop, productId, status: resp.status, body: resp.data });
      return null;
    }

    return resp.data?.data || null;
  } catch (err) {
    console.error('BigC image upload error', { shop, productId, error: err.message });
    return null;
  }
};

/**
 * Create a product image from a public URL (JSON `image_url`).
 * Used for restore: re-upload the original from the store's product_images path.
 *
 * @returns {Promise<object|null>} the new BigCommerce image object, or null on failure
 */
const createProductImageFromUrl = async ({
  shop,
  accessToken,
  productId,
  imageUrl,
  description = '',
  isThumbnail = false,
  sortOrder = 0,
}) => {
  const payload = {
    image_url: imageUrl,
    is_thumbnail: Boolean(isThumbnail),
    sort_order: Number(sortOrder) || 0,
  };
  if (description) {
    payload.description = description;
  }

  const res = await BIGCAPI('POST', imagesPath(productId), payload, shop, accessToken);
  if (isBigcError(res)) return null;
  return res.data?.data || null;
};

/**
 * Update only the alt text (description) of a product image.
 *
 * @returns {Promise<boolean>} true when BigCommerce accepted the update
 */
const updateProductImageAlt = async (shop, accessToken, productId, imageId, altText) => {
  const res = await BIGCAPI(
    'PUT',
    `${imagesPath(productId)}/${imageId}`,
    { description: altText },
    shop,
    accessToken
  );
  return !isBigcError(res) && Boolean(res.data?.data);
};

/**
 * Delete a product image.
 *
 * @returns {Promise<boolean>} true when deleted
 */
const deleteProductImage = async (shop, accessToken, productId, imageId) => {
  const res = await BIGCAPI('DELETE', `${imagesPath(productId)}/${imageId}`, '', shop, accessToken);
  return !isBigcError(res);
};

module.exports = {
  getProductImage,
  createProductImage,
  createProductImageFromUrl,
  updateProductImageAlt,
  deleteProductImage,
};
