'use strict';

const path = require('path');
const TRANSLITERATION_MAP = require('./transliterationMap');
const { MAX_FILE_NAME_LENGTH } = require('./constants');

/**
 * Turn any text into a URL-safe file name: accents → ASCII, spaces → '-',
 * everything except letters, digits and '-' removed.
 * Port of ImgoptController@make_file_name
 *
 * @param {string} text
 */
const makeFileName = (text) => {
  const ascii = Array.from(String(text || ''))
    .map((char) => TRANSLITERATION_MAP[char] ?? char)
    .join('');

  return ascii
    .replaceAll(' ', '-')
    .replaceAll('---', '-')
    .replaceAll('--', '-')
    .replace(/[^A-Za-z0-9-]/g, '')
    .replaceAll('---', '-')
    .replaceAll('--', '-');
};

/**
 * Last segment of a BigCommerce `image_file` path, e.g. 'a/123/shoe__01.jpg' → 'shoe__01.jpg'.
 *
 * @param {string} imageFile
 */
const getImageFileName = (imageFile) => String(imageFile || '').split('/').pop();

/**
 * Name for the optimized image: `<base>_<imageId>.<ext>`.
 *  - base: the file name template result (when file name setting is on), else the original name
 *  - ext:  'jpg' when PNG→JPG conversion is on, else the original extension
 * Port of the file name part of ImgoptController@queue_image_optimization_api
 *
 * @param {object} params
 * @param {string} params.originalFileName - e.g. 'shoe__01.png'
 * @param {number|string} params.imageId
 * @param {object} params.settingValue - result of resolveImageSetting
 * @param {string} params.fallbackExt - used when the original name has no extension
 */
const buildOptimizedFileName = ({ originalFileName, imageId, settingValue, fallbackExt }) => {
  const parsed = path.parse(originalFileName);
  const convertToJpg = settingValue.fileSizeStatus === 1 && settingValue.convertPngToJpg === 1;
  const ext = convertToJpg ? 'jpg' : parsed.ext.slice(1).toLowerCase() || fallbackExt;

  const baseName =
    settingValue.fileNameStatus === 1 ? makeFileName(settingValue.fileName) : parsed.name;

  return `${baseName.slice(0, MAX_FILE_NAME_LENGTH)}_${imageId}.${ext}`;
};

module.exports = {
  makeFileName,
  getImageFileName,
  buildOptimizedFileName,
};
