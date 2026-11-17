'use strict';

const { BIGCAPI, isBigcError } = require('./bigCapi');

const CHANNEL_STATUSES = 'active,inactive,prelaunch,connected,disconnected,archived';

/**
 * Storefront channels of a store (any status), like PHP
 * BIGCAPI('GET', '/v3/channels', ['type:in' => 'storefront', 'status:in' => ...]).
 *
 * @param {string} shop - store hash
 * @param {string} accessToken
 * @returns {Promise<object[]>} BigCommerce channel objects ([] on failure)
 */
const getStorefrontChannels = async (shop, accessToken) => {
  const result = await BIGCAPI(
    'GET',
    '/v3/channels',
    { 'type:in': 'storefront', 'status:in': CHANNEL_STATUSES },
    shop,
    accessToken
  );
  return isBigcError(result) ? [] : result.data?.data || [];
};

module.exports = { getStorefrontChannels };
