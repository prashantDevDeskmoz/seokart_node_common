'use strict';

const { initModels } = require('../../models');
const { createPreviewService } = require('./previewService');
const { createAiService } = require('./aiService');
const { calculateCost } = require('./pricing');

/**
 * Build the SEO Copilot preview service on the CALLER's sequelize connection.
 *
 *   const { createSeoCopilot } = require('seokart-common');
 *   const seoCopilot = createSeoCopilot(db.sequelize);
 *   await seoCopilot.generateMetaTitle({ shop, store_id, channel_id, type, item_id, item_name, ... });
 *
 * Models the host app already defined (e.g. backend's own copies) are reused, the rest are
 * registered from seokart-common/models.
 */
const createSeoCopilot = (sequelize) => {
  const models = initModels(sequelize);
  // StoreInfo is optional: only used to look up an access token when the caller sends none.
  models.StoreInfo = sequelize.models.StoreInfo;
  return createPreviewService(models);
};

/**
 * Raw AI generators (meta title / meta description / image alt) without the preview-table logging.
 * Used by the worker's bulk optimizer. Each result carries `pricing` for calculateCost().
 */
const createSeoCopilotAi = (sequelize) => createAiService(initModels(sequelize));

module.exports = { createSeoCopilot, createSeoCopilotAi, calculateCost };
