'use strict';

const axios = require('axios');

/**
 * ┌──────────────────────────────────────────────┐
 * │ Parent: getProductImages                     │
 * └──────────────────────────────────────────────┘
 * BigCommerce storefront CDN/base URL.
 * Port of CommonTrait@getStoreURL / getStoreUrl
 */
exports.getStoreURL = (shop) => {
  return `https://store-${shop}.mybigcommerce.com`;
};

/**
 * ┌──────────────────────────────────────────────┐
 * │ Parent: getProductImages                     │
 * └──────────────────────────────────────────────┘
 * Alias (PHP method name is case-insensitive)
 */
exports.getStoreUrl = exports.getStoreURL;

/**
 * ┌──────────────────────────────────────────────┐
 * │ Parent: BIGCAPI                              │
 * └──────────────────────────────────────────────┘
 * Respect BigCommerce rate-limit headers.
 * Port of BigcTrait@api_limit
 * @param {import('axios').AxiosResponse} resp
 */
exports.api_limit = async (resp) => {
  const headers = resp?.headers || {};
  const resetMsRaw =
    headers['x-rate-limit-time-reset-ms'] ??
    headers['X-Rate-Limit-Time-Reset-Ms'];
  const reqLeftRaw =
    headers['x-rate-limit-requests-left'] ??
    headers['X-Rate-Limit-Requests-Left'];

  const resetMs = Number(Array.isArray(resetMsRaw) ? resetMsRaw[0] : resetMsRaw);
  const reqLeft = Number(Array.isArray(reqLeftRaw) ? reqLeftRaw[0] : reqLeftRaw);

  if (!Number.isNaN(reqLeft) && reqLeft < 20 && !Number.isNaN(resetMs) && resetMs > 0) {
    // PHP: usleep($milliseconds[0] * 1000) → sleep resetMs milliseconds
    await new Promise((resolve) => setTimeout(resolve, resetMs));
  }
};

/**
 * ┌──────────────────────────────────────────────┐
 * │ Parent: getProductImages                     │
 * └──────────────────────────────────────────────┘
 * BigCommerce REST helper.
 * Port of PHP BIGCAPI (Guzzle → axios).
 *
 * @param {'GET'|'PUT'|'POST'|'DELETE'|string} type
 * @param {string} url - API path after /stores/{shop}/
 * @param {object|string} [payload='']
 * @param {string} [shopUrl='']
 * @param {string} [accessToken='']
 * @returns {Promise<{ link: string, data: any } | 'error' | Error>}
 */
exports.BIGCAPI = async (
  type,
  url,
  payload = '',
  shopUrl = '',
  accessToken = ''
) => {
  try {
    const method = String(type || 'GET').toUpperCase();
    const fullUrl = `https://api.bigcommerce.com/stores/${shopUrl}${url}`;

    const options = {
      method,
      url: fullUrl,
      headers: {
        'X-Auth-Token': accessToken,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      validateStatus: () => true,
    };

    switch (method) {
      case 'GET':
      case 'DELETE':
        if (payload && typeof payload === 'object') {
          options.params = payload;
        }
        break;
      case 'PUT':
      case 'POST':
        if (payload !== '' && payload !== undefined && payload !== null) {
          options.data = payload;
        }
        break;
      default:
        break;
    }

    const resp = await axios(options);
    const status = resp.status;

    if (status === 200 || status === 201 || status === 204) {
      await exports.api_limit(resp);

      const linkHeader = resp.headers?.link || resp.headers?.Link || '';
      const link = Array.isArray(linkHeader) ? linkHeader[0] || '' : linkHeader;

      return {
        link,
        data: resp.data ?? null,
      };
    }

    return 'error';
  } catch (err) {
    return err;
  }
};

/**
 * Catalog-scoped BigCommerce helper (v3/catalog/...).
 * Shared by seo_optimizer_ai (seocopilot) and image_optimizer.
 * Port of SeoCopilotAiService / ImageOptimizerAiService @bigCApiCall
 *
 * @param {string} uri - path after /v3/catalog/
 * @param {string} token
 * @param {string} shopUrl
 * @param {string} [method='GET']
 * @param {object} [body={}]
 */
exports.bigCApiCall = async (
  uri,
  token,
  shopUrl,
  method = 'GET',
  body = {}
) => {
  const url = `https://api.bigcommerce.com/stores/${shopUrl}/v3/catalog/${uri}`;

  try {
    const options = {
      method: String(method || 'GET').toUpperCase(),
      url,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Auth-Token': token,
      },
      timeout: 20000,
      validateStatus: () => true,
    };

    if (['POST', 'PUT'].includes(options.method)) {
      options.data = body;
    }

    const resp = await axios(options);
    const status = resp.status;

    if (![200, 201, 204].includes(status)) {
      console.warn('BigC API non-success response', {
        url,
        status,
      });
      return {};
    }

    if (status === 204) {
      return { success: true, message: 'Deleted' };
    }

    return resp.data && typeof resp.data === 'object' ? resp.data : {};
  } catch (e) {
    console.error(`BigC API ${method} call failed`, {
      url,
      error: e.message,
    });
    return {};
  }
};
