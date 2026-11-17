'use strict';

/**
 * Job names on the `seo-audit` queue (PHP Seoaudit job queue names without `audit_` / `_bigc`).
 * PHP spread one type over 4 queues (audit_product_bigc1..3); one BullMQ queue + worker
 * concurrency does that job now.
 */
const AUDIT_JOB = {
  HOME: 'home',
  PRODUCT: 'product',
  CATEGORY: 'category',
  BRAND: 'brand',
  BLOG: 'blog',
  PAGE: 'page',
  BANNER: 'banner',
  SCRAPE: 'scrape',
  DELETE_EXTRA: 'delete_extra',
  REAUDIT: 'reaudit',
};

/** Catalog item jobs, in the order PHP queues them. */
const ITEM_JOBS = [
  AUDIT_JOB.CATEGORY,
  AUDIT_JOB.BRAND,
  AUDIT_JOB.BLOG,
  AUDIT_JOB.PAGE,
  AUDIT_JOB.PRODUCT,
];

/**
 * BullMQ job id: one job per store + type (+ channel / item type / batch). While a job with
 * the same id waits or runs, adding it again does nothing, so a refresh every 10 s cannot
 * queue duplicates (PHP checked `jobs.payload LIKE '%domain%'` instead).
 * BullMQ ids cannot contain ':'.
 *
 * @param {string} type - AUDIT_JOB value
 * @param {{ storeHash: string, channelId?: number, itemType?: string, auditIds?: number[] }} data
 */
const auditJobId = (type, data) => {
  const suffix = data.channelId ?? data.itemType ?? data.auditIds?.[0];
  return [type, data.storeHash, suffix].filter((part) => part !== undefined).join('_');
};

/**
 * Options for every seo-audit job (PHP Seoaudit: $tries = 1). Finished jobs are removed so the
 * same id can be queued again (a kept failed job would block its id; the worker logs failures).
 */
const auditJobOptions = (type, data) => ({
  jobId: auditJobId(type, data),
  attempts: 1,
  removeOnComplete: true,
  removeOnFail: true,
});

module.exports = { AUDIT_JOB, ITEM_JOBS, auditJobId, auditJobOptions };
