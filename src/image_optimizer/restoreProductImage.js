'use strict';

const { getStoreURL } = require('../bigcommerce/bigCapi');
const { createProductImageFromUrl, deleteProductImage } = require('../bigcommerce/productImages');
const { OPTIMIZE_RESULT } = require('./constants');

const failed = (message) => ({ success: false, status: OPTIMIZE_RESULT.FAILED, message });

const toBool = (value) =>
  value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true';

/**
 * Restore one optimized BigCommerce product image to its original file / alt.
 * Port of ImgoptController@queue_image_restore_api.
 *
 * This function does NOT touch the database. The caller loads the `imgopt` row
 * (status OPTIMIZED) and updates it after a successful restore.
 *
 * Steps:
 *   1. Re-upload the original from `store/product_images/{realImage}` via image_url
 *   2. Delete the optimized image
 *
 * @param {object} params
 * @param {string} params.shop - store hash
 * @param {string} params.accessToken
 * @param {number|string} params.productId
 * @param {number|string} params.imageId - current (optimized) BigCommerce image id
 * @param {string} params.realImage - original `image_file` path kept on the imgopt row
 * @param {string} [params.oldAltText] - original alt text
 * @param {boolean|string|number} [params.isThumbnail=false]
 * @param {number|string} [params.sortOrder=0]
 * @returns {Promise<{
 *   success: boolean, status: string, message: string,
 *   oldImageId?: number, newImageId?: number
 * }>}
 */
const restoreProductImage = async ({
  shop,
  accessToken,
  productId,
  imageId,
  realImage,
  oldAltText,
  isThumbnail = false,
  sortOrder = 0,
}) => {
  try {
    if (!realImage) return failed('Original image path not found');

    const newImage = await createProductImageFromUrl({
      shop,
      accessToken,
      productId,
      imageUrl: `${getStoreURL(shop)}/product_images/${realImage}`,
      description: oldAltText || '',
      isThumbnail: toBool(isThumbnail),
      sortOrder: Number(sortOrder) || 0,
    });
    if (!newImage?.id) return failed('BigCommerce restore upload failed');

    await deleteProductImage(shop, accessToken, productId, imageId);

    return {
      success: true,
      status: 'restored',
      message: 'Image restored',
      oldImageId: Number(imageId),
      newImageId: newImage.id,
    };
  } catch (err) {
    console.error('restoreProductImage error', { shop, productId, imageId, error: err.message });
    return failed(err.message);
  }
};

module.exports = {
  restoreProductImage,
};
