'use strict';

const axios = require('axios');
const sharp = require('sharp');

/**
 * ┌──────────────────────────────────────────────┐
 * │ Parent: handleImageData                      │
 * └──────────────────────────────────────────────┘
 * Download image and get file size via sharp (validates image).
 * Returns "12.34 KB" or "> 1 MB" (same shape as PHP imageSizeByUrl).
 */
exports.imageSizeByUrl = async (url) => {
  try {
    const resp = await axios.get(url, {
      timeout: 15000,
      responseType: 'arraybuffer',
      validateStatus: () => true,
      maxRedirects: 5,
    });

    if (resp.status < 200 || resp.status >= 300) {
      return '> 1 MB';
    }

    const buffer = Buffer.from(resp.data);

    // sharp validates it is a real image; fails if corrupt / not an image
    await sharp(buffer).metadata();

    if (!buffer.length) {
      return '> 1 MB';
    }

    const inKb = (buffer.length / 1024).toFixed(2);
    return `${inKb} KB`;
  } catch (_err) {
    return '> 1 MB';
  }
};
