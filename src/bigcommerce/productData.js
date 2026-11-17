'use strict';

const { BIGCAPI, isBigcError } = require('./bigCapi');

/**
 * First category name of a product ('' when none).
 */
const getCategoryName = async (shop, accessToken, categoryId) => {
  if (!categoryId) return '';
  const res = await BIGCAPI(
    'GET',
    '/v3/catalog/trees/categories',
    { 'category_id:in': categoryId },
    shop,
    accessToken
  );
  if (isBigcError(res)) return '';
  return String(res.data?.data?.[0]?.name || '').trim();
};

/**
 * Brand name of a product ('' when none).
 */
const getBrandName = async (shop, accessToken, brandId) => {
  if (!brandId || Number(brandId) === 0) return '';
  const res = await BIGCAPI('GET', `/v3/catalog/brands/${brandId}`, '', shop, accessToken);
  if (isBigcError(res)) return '';
  return String(res.data?.data?.name || '').trim();
};

/**
 * Product values used by the file name / alt text templates
 * ([[name]], [[sku]], [[price]], [[type]], [[mpn]], [[category]], [[brand]], [[condition]]).
 * Port of the product lookup part of ImgoptController@get_setting_value
 *
 * @param {string} shop - store hash
 * @param {string} accessToken
 * @param {number|string} productId
 * @returns {Promise<object|null>} null when the product can't be loaded
 */
const getProductTemplateData = async (shop, accessToken, productId) => {
  const res = await BIGCAPI('GET', `/v3/catalog/products/${productId}`, '', shop, accessToken);
  if (isBigcError(res) || !res.data?.data) return null;

  const product = res.data.data;
  const [category, brand] = await Promise.all([
    getCategoryName(shop, accessToken, product.categories?.[0]),
    getBrandName(shop, accessToken, product.brand_id),
  ]);

  return {
    name: String(product.name || '').trim(),
    sku: product.sku ?? '',
    price: product.price ?? '',
    type: product.type ?? '',
    mpn: product.mpn ?? '',
    condition: product.condition ?? '',
    category,
    brand,
  };
};

module.exports = {
  getProductTemplateData,
};
