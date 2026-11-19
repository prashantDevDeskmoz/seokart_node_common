'use strict';

const fs = require('fs');
const path = require('path');
const fsp = fs.promises;
const { formatSizeKb } = require('./downloadImage');

/**
 * Local path for one store's original images.
 * Same layout as PHP: img_opt/{storeHash}/original/{fileName}
 *
 * @param {string} baseDir - IMGOPT_STORAGE_PATH root
 * @param {string} storeHash
 */
const getOriginalDir = (baseDir, storeHash) => path.join(baseDir, storeHash, 'original');

/**
 * Ensure img_opt/{storeHash}/original (and optimized) exist.
 * Port of the mkdir block in ApiImageController@imageOptimize.
 *
 * @param {string} baseDir
 * @param {string} storeHash
 */
const ensureImgoptDirs = async (baseDir, storeHash) => {
  const storeDir = path.join(baseDir, storeHash);
  await fsp.mkdir(path.join(storeDir, 'original'), { recursive: true });
  await fsp.mkdir(path.join(storeDir, 'optimized'), { recursive: true });
};

/**
 * Save the original image bytes to disk after a successful optimize.
 * Port of ImgoptController@queue_image_optimization_api file_put_contents(.../original/...).
 *
 * @param {object} params
 * @param {string} params.baseDir
 * @param {string} params.storeHash
 * @param {string} params.fileName - e.g. old_file_name / img_name
 * @param {Buffer} params.buffer
 */
const saveOriginalImage = async ({ baseDir, storeHash, fileName, buffer }) => {
  if (!baseDir || !storeHash || !fileName || !buffer) return;

  await ensureImgoptDirs(baseDir, storeHash);
  const filePath = path.join(getOriginalDir(baseDir, storeHash), fileName);
  await fsp.writeFile(filePath, buffer);
};

/**
 * Size of the saved original, as "12.34 KB".
 * Null when the local copy is missing.
 *
 * @param {object} params
 * @param {string} params.baseDir
 * @param {string} params.storeHash
 * @param {string} params.fileName
 * @returns {Promise<string|null>}
 */
const getOriginalImageSize = async ({ baseDir, storeHash, fileName }) => {
  if (!baseDir || !storeHash || !fileName) return null;

  const filePath = path.join(getOriginalDir(baseDir, storeHash), fileName);
  try {
    const stat = await fsp.stat(filePath);
    if (!stat.isFile() || !stat.size) return null;
    return formatSizeKb(stat.size);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
};

/**
 * Delete the local original after a successful restore.
 * Port of the unlink in ImgoptController@queue_image_restore_api.
 *
 * @param {object} params
 * @param {string} params.baseDir
 * @param {string} params.storeHash
 * @param {string} params.fileName
 */
const deleteOriginalImage = async ({ baseDir, storeHash, fileName }) => {
  if (!baseDir || !storeHash || !fileName) return;

  const filePath = path.join(getOriginalDir(baseDir, storeHash), fileName);
  try {
    await fsp.unlink(filePath);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
};

module.exports = {
  getOriginalDir,
  ensureImgoptDirs,
  saveOriginalImage,
  getOriginalImageSize,
  deleteOriginalImage,
};
