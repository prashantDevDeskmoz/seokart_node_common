'use strict';

const POINT_FIELDS = [
  'point1',
  'point2',
  'point3',
  'point4',
  'point5',
  'point6',
  'point7',
  'point8',
  'point9',
  'point10',
  'point11',
  'point12',
  'point13',
  'point14',
];

/**
 * In-memory score from point fields (same formula as BigcTrait@calculateItemScore).
 * Uses item_type from the points row (or caller-provided).
 */
function scoreFromPoints(item = {}) {
  const p1 = Number(item.point1 || 0);
  const p2 = Number(item.point2 || 0);
  const p3 = Number(item.point3 || 0);
  const p4 = Number(item.point4 || 0);
  const p5 = Number(item.point5 || 0);
  const p6 = Number(item.point6 || 0);
  const p7 = Number(item.point7 || 0);
  const p8 = Number(item.point8 || 0);
  const p9 = Number(item.point9 || 0);
  const p10 = Number(item.point10 || 0);
  const p11 = Number(item.point11 || 0);
  const p12 = Number(item.point12 || 0);

  if (item.item_type === 'product') {
    return Math.round(
      ((p1 + p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9 + p10 + p11 + p12) / 20) *
        100
    );
  }
  return Math.round(
    ((p1 + p2 + p3 + p4 + p5 + p6 + p7 + p9 + p10 + p11 + p12) / 19) * 100
  );
}

function touchesPointFields(attrs = {}) {
  return POINT_FIELDS.some((key) =>
    Object.prototype.hasOwnProperty.call(attrs, key)
  );
}

module.exports = {
  POINT_FIELDS,
  scoreFromPoints,
  touchesPointFields,
};
