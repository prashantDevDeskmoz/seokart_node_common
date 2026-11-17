'use strict';

// Mirrors backend/src/models/aiBulkModels.js. Uses the host app's Sequelize Model class
// (sequelize.constructor) so common never mixes two copies of sequelize.
module.exports = (sequelize, DataTypes) => {
  const { Model } = sequelize.constructor;

  class AiBulkModels extends Model {}

  AiBulkModels.init(
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true, allowNull: false },
      model_key: { type: DataTypes.STRING(100), allowNull: false },
      input_per_1m: { type: DataTypes.DECIMAL(10, 4), allowNull: false, defaultValue: 0.0 },
      output_per_1m: { type: DataTypes.DECIMAL(10, 4), allowNull: false, defaultValue: 0.0 },
      is_active: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 0 },
      sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      is_deleted: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 0 },
      created_at: { type: DataTypes.DATE, allowNull: true, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
    },
    { sequelize, modelName: 'AiBulkModels', tableName: 'ai_bulk_models', timestamps: false, underscored: false }
  );

  return AiBulkModels;
};

module.exports.modelName = 'AiBulkModels';
