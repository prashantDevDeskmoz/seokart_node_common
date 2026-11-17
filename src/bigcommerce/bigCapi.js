'use strict';

const axios = require('axios');

const BIGC_API_BASE = 'https://api.bigcommerce.com/stores';
const SUCCESS_STATUSES = [200, 201, 204];

/**
 * Rate limit: we never use the whole quota of a window. Part of it is kept free for the
 * merchant's own manual calls / other apps that hit the same store while a job runs.
 * Pause when requests left < max(MIN_REQUESTS_LEFT, quota * QUOTA_RESERVE_RATIO).
 */
const MIN_REQUESTS_LEFT = 20;
const QUOTA_RESERVE_RATIO = 0.25;
const MAX_RETRIES_ON_429 = 3;
const DEFAULT_RESET_MS = 30000;

// store hash → time (ms) until which no request is sent; shared by every call in this process
const pausedUntil = new Map();

/**
 * Public storefront URL of a store.
 * Port of CommonTrait@getStoreURL
 *
 * @param {string} shop - store hash
 */
const getStoreURL = (shop) => `https://store-${shop}.mybigcommerce.com`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const headerNumber = (headers, name) => {
  const value = headers?.[name];
  return Number(Array.isArray(value) ? value[0] : value);
};

/**
 * Wait while the store is paused. Parallel calls of the same store all wait here,
 * so no request is fired while another call is already waiting for the window reset.
 *
 * @param {string} shop - store hash
 */
const waitWhilePaused = async (shop) => {
  const waitMs = (pausedUntil.get(shop) || 0) - Date.now();
  if (waitMs > 0) await sleep(waitMs);
};

/**
 * Read the rate-limit headers of a response and pause the store when the requests left
 * drop below the reserve (or on 429), until the window resets.
 * Port of BigCommerceApiController@api_limit
 *
 * @param {import('axios').AxiosResponse} resp
 * @param {string} shop - store hash
 */
const apiLimit = async (resp, shop) => {
  const headers = resp?.headers || {};
  const resetMs = headerNumber(headers, 'x-rate-limit-time-reset-ms');
  const requestsLeft = headerNumber(headers, 'x-rate-limit-requests-left');
  const quota = headerNumber(headers, 'x-rate-limit-requests-quota');

  const reserve = Math.max(MIN_REQUESTS_LEFT, Math.ceil(quota * QUOTA_RESERVE_RATIO) || 0);
  const mustPause = resp?.status === 429 || requestsLeft < reserve;

  if (mustPause) {
    const until = Date.now() + (resetMs > 0 ? resetMs : DEFAULT_RESET_MS);
    if (until > (pausedUntil.get(shop) || 0)) pausedUntil.set(shop, until);
  }
  await waitWhilePaused(shop);
};

/**
 * Send one BigCommerce request with the store's rate limit respected:
 * wait while the store is paused, and on 429 wait for the window reset and retry.
 *
 * @param {string} shop - store hash
 * @param {() => Promise<import('axios').AxiosResponse>} sendRequest
 * @returns {Promise<import('axios').AxiosResponse>}
 */
const requestWithRateLimit = async (shop, sendRequest) => {
  for (let attempt = 0; ; attempt += 1) {
    await waitWhilePaused(shop);
    const resp = await sendRequest();
    await apiLimit(resp, shop);

    if (resp.status !== 429 || attempt >= MAX_RETRIES_ON_429) return resp;
  }
};

/**
 * BigCommerce REST call.
 * Port of BigCommerceApiController@BIGCAPI
 *
 * @param {'GET'|'POST'|'PUT'|'DELETE'} type
 * @param {string} url - path after /stores/{shop}, e.g. '/v3/catalog/products'
 * @param {object|string} [payload=''] - query params (GET/DELETE) or JSON body (POST/PUT)
 * @param {string} shop - store hash
 * @param {string} accessToken
 * @returns {Promise<{ link: string, data: any } | 'error' | Error>}
 *          `data` is the raw BigCommerce response body (so records are in `data.data`).
 */
const BIGCAPI = async (type, url, payload = '', shop = '', accessToken = '') => {
  try {
    const method = String(type || 'GET').toUpperCase();
    const options = {
      method,
      url: `${BIGC_API_BASE}/${shop}${url}`,
      headers: {
        'X-Auth-Token': accessToken,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      validateStatus: () => true,
    };

    const hasPayload = payload !== '' && payload !== undefined && payload !== null;
    if ((method === 'GET' || method === 'DELETE') && hasPayload && typeof payload === 'object') {
      options.params = payload;
    }
    if ((method === 'POST' || method === 'PUT') && hasPayload) {
      options.data = payload;
    }

    const resp = await requestWithRateLimit(shop, () => axios(options));
    if (!SUCCESS_STATUSES.includes(resp.status)) {
      return 'error';
    }

    const linkHeader = resp.headers?.link || '';
    return {
      link: Array.isArray(linkHeader) ? linkHeader[0] || '' : linkHeader,
      data: resp.data ?? null,
    };
  } catch (err) {
    return err;
  }
};

/**
 * Catalog-scoped BigCommerce call (path after /v3/catalog/).
 * Returns the response body, or {} on any failure.
 * Port of SeoCopilotAiService / ImageOptimizerAiService @bigCApiCall
 *
 * @param {string} uri - e.g. 'products/12/images'
 * @param {string} token
 * @param {string} shop - store hash
 * @param {string} [method='GET']
 * @param {object} [body={}]
 */
const bigCApiCall = async (uri, token, shop, method = 'GET', body = {}) => {
  const url = `${BIGC_API_BASE}/${shop}/v3/catalog/${uri}`;
  const upperMethod = String(method || 'GET').toUpperCase();

  try {
    const resp = await axios({
      method: upperMethod,
      url,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Auth-Token': token,
      },
      data: ['POST', 'PUT'].includes(upperMethod) ? body : undefined,
      timeout: 20000,
      validateStatus: () => true,
    });

    if (!SUCCESS_STATUSES.includes(resp.status)) {
      console.warn('BigC API non-success response', { url, status: resp.status });
      return {};
    }
    if (resp.status === 204) {
      return { success: true, message: 'Deleted' };
    }
    return resp.data && typeof resp.data === 'object' ? resp.data : {};
  } catch (err) {
    console.error(`BigC API ${upperMethod} call failed`, { url, error: err.message });
    return {};
  }
};

/**
 * True when a BIGCAPI result is a failure ('error' string or thrown Error).
 *
 * @param {any} result
 */
const isBigcError = (result) => !result || result === 'error' || result instanceof Error;

module.exports = {
  BIGC_API_BASE,
  getStoreURL,
  getStoreUrl: getStoreURL,
  apiLimit,
  api_limit: apiLimit,
  requestWithRateLimit,
  BIGCAPI,
  bigCApiCall,
  isBigcError,
};
