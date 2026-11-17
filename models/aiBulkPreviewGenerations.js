'use strict';

// Mirrors backend/src/models/aiBulkPreviewGenerations.js (no associations needed by common).
module.exports = (sequelize, DataTypes) => {
  const { Model } = sequelize.constructor;

  class AiBulkPreviewGenerations extends Model {}

  AiBulkPreviewGenerations.init(
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true, allowNull: false },
      store_url: { type: DataTypes.STRING(255), allowNull: false },
      platform: { type: DataTypes.STRING(32), allowNull: false },
      store_id: { type: DataTypes.STRING(64), allowNull: true, defaultValue: null },
      channel_id: { type: DataTypes.STRING(64), allowNull: true, defaultValue: null },
      item_type: { type: DataTypes.STRING(32), allowNull: false },
      item_id: { type: DataTypes.STRING(64), allowNull: false },
      item_name: { type: DataTypes.STRING(512), allowNull: true, defaultValue: null },
      keyword: { type: DataTypes.STRING(512), allowNull: true, defaultValue: null },
      lang: { type: DataTypes.STRING(64), allowNull: true, defaultValue: null },
      model: { type: DataTypes.STRING(128), allowNull: true, defaultValue: null },
      task: { type: DataTypes.STRING(64), allowNull: false },
      custom_instructions: { type: DataTypes.TEXT, allowNull: true },
      result_text: { type: DataTypes.TEXT, allowNull: true },
      prompt_tokens: { type: DataTypes.INTEGER, allowNull: true, defaultValue: null },
      completion_tokens: { type: DataTypes.INTEGER, allowNull: true, defaultValue: null },
      total_prompts: { type: DataTypes.INTEGER, allowNull: true, defaultValue: null },
      prompt_cost: { type: DataTypes.DECIMAL(12, 6), allowNull: true, defaultValue: null },
      completion_cost: { type: DataTypes.DECIMAL(12, 6), allowNull: true, defaultValue: null },
      total_cost: { type: DataTypes.DECIMAL(12, 6), allowNull: true, defaultValue: null },
      system_prompt: { type: DataTypes.TEXT('long'), allowNull: true },
      user_prompt: { type: DataTypes.TEXT('long'), allowNull: true },
      status: { type: DataTypes.STRING(32), allowNull: true, defaultValue: null },
      error_message: { type: DataTypes.TEXT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
      updated_at: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
    },
    {
      sequelize,
      modelName: 'AiBulkPreviewGenerations',
      tableName: 'ai_bulk_preview_generations',
      timestamps: false,
      underscored: false,
    }
  );

  return AiBulkPreviewGenerations;
};

module.exports.modelName = 'AiBulkPreviewGenerations';
