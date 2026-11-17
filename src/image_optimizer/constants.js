'use strict';

/** imgopt.status values */
const IMGOPT_STATUS = Object.freeze({
  RESTORED: 0,
  OPTIMIZED: 1,
  OPTIMIZE_IN_PROGRESS: 2,
  RESTORE_IN_PROGRESS: 3,
});

/**
 * Setting `file_size_data.img_quality` → JPEG/WebP encoder quality.
 * Encoded with mozjpeg, these stay visually lossless for product photos
 * while still cutting file size (the old PHP values 40/50/60 were visibly lossy).
 */
const QUALITY_BY_LEVEL = Object.freeze({
  low: 75,
  medium: 82,
  high: 88,
});
const DEFAULT_QUALITY = 82;
const LOSSLESS_QUALITY = 100;

/** PNG palette (lossy) result is used only when it is at least this close to the original (PSNR, dB). */
const MIN_VISUALLY_LOSSLESS_PSNR = 40;

/** Max length of the base file name before `_<imageId>.<ext>` */
const MAX_FILE_NAME_LENGTH = 160;

const MIME_BY_EXT = Object.freeze({
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
});

/** sharp metadata().format → file extension */
const EXT_BY_FORMAT = Object.freeze({
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
  gif: 'gif',
});

/** Values of `status` returned by optimizeProductImage */
const OPTIMIZE_RESULT = Object.freeze({
  OPTIMIZED: 'optimized',
  ALT_UPDATED: 'alt_updated',
  AI_CREDITS_EXHAUSTED: 'ai_credits_exhausted',
  FAILED: 'failed',
});

module.exports = {
  IMGOPT_STATUS,
  QUALITY_BY_LEVEL,
  DEFAULT_QUALITY,
  LOSSLESS_QUALITY,
  MIN_VISUALLY_LOSSLESS_PSNR,
  MAX_FILE_NAME_LENGTH,
  MIME_BY_EXT,
  EXT_BY_FORMAT,
  OPTIMIZE_RESULT,
};
