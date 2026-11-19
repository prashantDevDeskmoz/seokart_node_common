'use strict';

const axios = require('axios');
const sharp = require('sharp');
const { EXT_BY_FORMAT, MIME_BY_EXT } = require('./constants');

const DOWNLOAD_TIMEOUT_MS = 30000;

/**
 * Bytes → "12.34 KB" (same format as PHP imagesize_byurl).
 *
 * @param {number} bytes
 */
const formatSizeKb = (bytes) => `${(bytes / 1024).toFixed(2)} KB`;

/**
 * Download an image and check that it is a supported image (jpeg / png / webp / gif).
 *
 * @param {string} url
 * @returns {Promise<{ buffer: Buffer, ext: string, mime: string, sizeKb: string } | null>}
 *          null when the download fails or the file is not a supported image
 */
const downloadImage = async (url) => {
  try {
    const resp = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: DOWNLOAD_TIMEOUT_MS,
      maxRedirects: 5,
      validateStatus: () => true,
    });
    if (resp.status < 200 || resp.status >= 300) return null;

    const buffer = Buffer.from(resp.data);
    if (!buffer.length) return null;

    const { format } = await sharp(buffer).metadata();
    const ext = EXT_BY_FORMAT[format];
    if (!ext) return null;

    return { buffer, ext, mime: MIME_BY_EXT[ext], sizeKb: formatSizeKb(buffer.length) };
  } catch (_err) {
    return null;
  }
};

module.exports = {
  downloadImage,
  formatSizeKb,
};
