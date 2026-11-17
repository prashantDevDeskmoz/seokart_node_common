'use strict';

const { IMGOPT_STATUS } = require('./constants');
const { getImageFileName } = require('./fileName');
const { toDateString } = require('./optimizeLimit');

/**
 * Build an `imgopt` row from a BigCommerce product image, ready for Imgopt.create().
 * Keeps the original alt / file / path so the image can be restored later.
 * Same columns as the PHP insert in ApiImageController@imageOptimize / Imageopt job.
 *
 * @param {object} params
 * @param {string} params.storeHash
 * @param {object} params.image - BigCommerce image object (id, product_id, image_file, description, ...)
 * @param {number} [params.status=IMGOPT_STATUS.OPTIMIZE_IN_PROGRESS]
 */
const buildImgoptRecord = ({ storeHash, image, status = IMGOPT_STATUS.OPTIMIZE_IN_PROGRESS }) => ({
  store_hash: storeHash,
  old_alt_text: image.description ?? null,
  old_file_name: getImageFileName(image.image_file),
  real_image: image.image_file,
  product_id: image.product_id,
  image_id: image.id,
  is_thumbnail: image.is_thumbnail ? '1' : '0',
  sort_order: image.sort_order ?? 0,
  status,
  created_at: toDateString(new Date()),
});

module.exports = {
  buildImgoptRecord,
};
