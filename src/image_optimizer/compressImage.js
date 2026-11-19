'use strict';

const sharp = require('sharp');
const { QUALITY_BY_LEVEL, DEFAULT_QUALITY, MIN_VISUALLY_LOSSLESS_PSNR } = require('./constants');

const WHITE = { r: 255, g: 255, b: 255 };

/**
 * Decode an image to raw RGBA pixels, upright (EXIF orientation applied).
 */
const decodePixels = (buffer) =>
  sharp(buffer).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });

/**
 * Peak signal-to-noise ratio between two images, in dB. Higher = closer;
 * ~40 dB and above is visually indistinguishable. Different dimensions → 0.
 */
const measurePsnr = async (originalBuffer, candidateBuffer) => {
  const [original, candidate] = await Promise.all([
    decodePixels(originalBuffer),
    decodePixels(candidateBuffer),
  ]);
  if (
    original.info.width !== candidate.info.width ||
    original.info.height !== candidate.info.height
  ) {
    return 0;
  }

  let squaredErrorSum = 0;
  for (let i = 0; i < original.data.length; i++) {
    const diff = original.data[i] - candidate.data[i];
    squaredErrorSum += diff * diff;
  }
  const meanSquaredError = squaredErrorSum / original.data.length;
  return meanSquaredError === 0 ? Infinity : 10 * Math.log10((255 * 255) / meanSquaredError);
};

/**
 * PNG: best of a lossless re-encode and a 256-colour palette version.
 * The palette version is kept only if it passes the visual quality check,
 * so photos and smooth gradients stay lossless.
 */
const compressPng = async (buffer) => {
  const lossless = await sharp(buffer)
    .rotate()
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();

  const palette = await sharp(buffer)
    .rotate()
    .png({ palette: true, quality: 95, effort: 10, dither: 1.0, compressionLevel: 9 })
    .toBuffer();

  if (palette.length >= lossless.length) return lossless;

  const psnr = await measurePsnr(buffer, palette);
  return psnr >= MIN_VISUALLY_LOSSLESS_PSNR ? palette : lossless;
};

/**
 * Setting quality level ('low' | 'medium' | 'high') → encoder quality.
 *
 * @param {string} level
 */
const getQualityForLevel = (level) => QUALITY_BY_LEVEL[level] ?? DEFAULT_QUALITY;

/**
 * Re-encode an image into the format of `outputExt`.
 * Port of ImgoptController@compressImage (GD / cwebp → sharp):
 *  - jpg/jpeg: transparent areas become white, mozjpeg at `quality`
 *              (progressive, trellis quantisation — smaller at the same visual quality)
 *  - png:      smallest of lossless / quality-checked palette, alpha kept
 *  - webp:     encoded at `quality`, max effort
 *  - gif:      re-encoded as gif
 * EXIF orientation is applied first, since metadata is stripped from the output.
 *
 * @param {Buffer} buffer - source image
 * @param {object} options
 * @param {string} options.outputExt - 'jpg' | 'jpeg' | 'png' | 'webp' | 'gif'
 * @param {number} options.quality - 0-100
 * @returns {Promise<Buffer|null>} null when the format is not supported or encoding fails
 */
const compressImage = async (buffer, { outputExt, quality }) => {
  const safeQuality = Math.max(1, Math.min(100, Number(quality) || DEFAULT_QUALITY));
  const ext = String(outputExt || '').toLowerCase();

  try {
    switch (ext) {
      case 'jpg':
      case 'jpeg':
        return await sharp(buffer)
          .rotate()
          .flatten({ background: WHITE })
          .jpeg({ quality: safeQuality, mozjpeg: true })
          .toBuffer();
      case 'png':
        return await compressPng(buffer);
      case 'webp':
        return await sharp(buffer)
          .rotate()
          .webp({ quality: safeQuality, effort: 6, smartSubsample: true })
          .toBuffer();
      case 'gif':
        return await sharp(buffer, { animated: true }).gif().toBuffer();
      default:
        return null;
    }
  } catch (_err) {
    return null;
  }
};

module.exports = {
  compressImage,
  getQualityForLevel,
};
