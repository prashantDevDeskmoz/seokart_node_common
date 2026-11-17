'use strict';

/**
 * Date → 'YYYY-MM-DD' in server local time (matches imgopt.created_at, a DATE column).
 *
 * @param {Date} date
 */
const toDateString = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * First day counted by a limit type.
 *  - daily:   today
 *  - weekly:  Monday of this week
 *  - monthly: 1st of this month
 *  - total:   null (count everything)
 *
 * @param {'daily'|'weekly'|'monthly'|'total'} limitType
 * @param {Date} [now=new Date()]
 * @returns {string|null|undefined} 'YYYY-MM-DD', null for total, undefined for an unknown type
 */
const getLimitPeriodStart = (limitType, now = new Date()) => {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (limitType) {
    case 'daily':
      return toDateString(start);
    case 'weekly': {
      const daysSinceMonday = (start.getDay() + 6) % 7;
      start.setDate(start.getDate() - daysSinceMonday);
      return toDateString(start);
    }
    case 'monthly':
      start.setDate(1);
      return toDateString(start);
    case 'total':
      return null;
    default:
      return undefined;
  }
};

/**
 * How many more images the store can optimize under its limit (store_info.imgopt_limit).
 * Port of ImgoptController@check_user_limit (DB count is done by the caller).
 *
 * Usage:
 *   const limitLeft = await getOptimizeLimitLeft(storeInfo.imgopt_limit, (fromDate) =>
 *     Imgopt.count({ where: { store_hash, ...(fromDate && { created_at: { [Op.gte]: fromDate } }) } })
 *   );
 *
 * @param {string|object} imgoptLimit - JSON like {"type":"monthly","value":50}
 * @param {(fromDate: string|null) => Promise<number>} countOptimizedSince
 * @returns {Promise<number>} images left in the current period (0 = limit reached)
 */
const getOptimizeLimitLeft = async (imgoptLimit, countOptimizedSince) => {
  let limit = imgoptLimit;
  if (typeof limit === 'string') {
    try {
      limit = JSON.parse(limit);
    } catch (_err) {
      limit = null;
    }
  }
  if (!limit) return 0;

  const fromDate = getLimitPeriodStart(limit.type);
  if (fromDate === undefined) return 0;

  const usedCount = await countOptimizedSince(fromDate);
  return Math.max(0, (Number(limit.value) || 0) - usedCount);
};

module.exports = {
  toDateString,
  getLimitPeriodStart,
  getOptimizeLimitLeft,
};
