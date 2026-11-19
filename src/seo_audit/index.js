'use strict';

/** SEO audit helpers shared by the backend API and the seo-audit worker. */
module.exports = {
  ...require('./score'),
  ...require('./jobs'),
  ...require('./pageAnalysis'),
};
