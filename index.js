'use strict';
const add = (a, b) => a + b;

module.exports = {
  add,
  ...require('./models'),
  ...require('./services/seoCopilot'),
};
