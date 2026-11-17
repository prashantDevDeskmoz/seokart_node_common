'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Registers the shared models on the CALLER's sequelize instance (common never opens
 * its own DB connection). A model the host app already defined is reused as-is, so the
 * backend / worker keep their own copies and nothing is overwritten.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @returns {Record<string, import('sequelize').ModelStatic<any>>}
 */
const initModels = (sequelize) => {
  const { DataTypes } = sequelize.constructor;
  const db = {};

  fs.readdirSync(__dirname)
    .filter((file) => file !== 'index.js' && file.endsWith('.js') && !file.endsWith('.test.js'))
    .forEach((file) => {
      const factory = require(path.join(__dirname, file));
      const modelName = factory.modelName || null;
      // Define only when the host has not registered a model with this name.
      const probe = modelName && sequelize.models[modelName];
      const model = probe || factory(sequelize, DataTypes);
      db[model.name] = model;
    });

  return db;
};

module.exports = { initModels };
