'use strict';

const { logError } = require('../../utils/logger');

// Fallbacks from AiBulkModel.php / AiImageAltModel.php (used when no active DB row exists).
const BULK_DEFAULTS = { model_key: 'gpt-5.4-nano', input_per_1m: 0.2, output_per_1m: 1.25 };
const IMAGE_ALT_DEFAULTS = { model_key: 'gpt-5-nano', input_per_1m: 0.05, output_per_1m: 0.4 };

/**
 * Port of AiBulkModel::getActive / AiImageAltModel::getActive.
 * @param {import('sequelize').ModelStatic<any>} Model AiBulkModels or AiImageAltModels
 * @param {{model_key:string,input_per_1m:number,output_per_1m:number}} defaults
 */
const getActiveModel = async (Model, defaults) => {
  try {
    const row = await Model.findOne({
      where: { is_active: 1, is_deleted: 0 },
      order: [['sort_order', 'ASC']],
      raw: true,
    });

    if (row && String(row.model_key || '').trim() !== '') {
      return {
        model_key: String(row.model_key).trim(),
        input_per_1m: Number(row.input_per_1m),
        output_per_1m: Number(row.output_per_1m),
      };
    }
    logError({ message: `${Model.name}: no active model found in DB, using default` });
  } catch (error) {
    logError({ message: `${Model.name}: DB fetch failed`, error: error.message });
  }
  return { ...defaults };
};

/** Port of calculateCost(); amounts are 7-decimal strings like PHP number_format(). */
const calculateCost = (promptTokens, completionTokens, pricing) => {
  const promptCost = (Number(pricing?.input_per_1m || 0) / 1000000) * promptTokens;
  const completionCost = (Number(pricing?.output_per_1m || 0) / 1000000) * completionTokens;

  return {
    total_prompts: promptTokens + completionTokens,
    prompt_cost: promptCost.toFixed(7),
    completion_cost: completionCost.toFixed(7),
    total_cost: (promptCost + completionCost).toFixed(7),
  };
};

module.exports = { BULK_DEFAULTS, IMAGE_ALT_DEFAULTS, getActiveModel, calculateCost };
