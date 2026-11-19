'use strict';

// Single source of truth for BullMQ queue names.
// backend (producer) and seokart-worker (consumer) must both require this
// instead of hardcoding the strings, so they can't drift apart.
const QUEUES = {
  SEO_AUDIT: 'seo-audit',
  IMAGE_OPTIMIZATION: 'image-optimization',
  RANK_TRACKING: 'rank-tracking',
  ANALYTICS: 'analytics',
  BULK_OPT: 'bulk-opt',
};

module.exports = { QUEUES };
