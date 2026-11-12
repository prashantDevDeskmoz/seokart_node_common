'use strict';

const logInfo = (message, meta = {}) => {
  console.log(`[INFO] ${message}`, Object.keys(meta).length ? meta : '');
};

const logError = (payload = {}) => {
  console.error('[ERROR]', payload.message || payload, payload.error || '');
};

const logSuccess = (message, meta = {}) => {
  console.log(`[SUCCESS] ${message}`, Object.keys(meta).length ? meta : '');
};

module.exports = {
  logInfo,
  logError,
  logSuccess,
};
