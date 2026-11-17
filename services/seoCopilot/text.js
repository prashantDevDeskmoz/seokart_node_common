'use strict';

/**
 * Text post-processing helpers ported from SeoCopilotAiService (private methods).
 * Pure functions - no I/O.
 */

const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

const lenOf = (s) => Array.from(s).length;

/** Case-insensitive literal substring check (special chars kept). */
const textContainsKeyword = (text, keyword) => {
  if (keyword === '') return true;
  return text.toLowerCase().includes(keyword.toLowerCase());
};

/** PHP similar_text(): number of matching chars (longest common substring, recursive). */
const similarChars = (a, b) => {
  if (!a.length || !b.length) return 0;

  let max = 0;
  let posA = 0;
  let posB = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      let k = 0;
      while (i + k < a.length && j + k < b.length && a[i + k] === b[j + k]) k++;
      if (k > max) {
        max = k;
        posA = i;
        posB = j;
      }
    }
  }
  if (max === 0) return 0;

  return (
    max +
    similarChars(a.slice(0, posA), b.slice(0, posB)) +
    similarChars(a.slice(posA + max), b.slice(posB + max))
  );
};

/** PHP similar_text() percent. */
const similarPercent = (a, b) => {
  const total = a.length + b.length;
  return total === 0 ? 0 : (similarChars(a, b) * 2 * 100) / total;
};

/** If the model rewrote the keyword slightly, swap the closest word window back to the exact keyword. */
const replaceWithTargetKeyword = (responseText, targetKeyword, threshold = 70) => {
  const keyword = String(targetKeyword || '').trim();
  if (keyword === '') return responseText;

  const targetLower = keyword.toLowerCase();
  const words = responseText.split(' ');
  const windowSize = keyword.split(' ').length;

  let maxSimilarity = 0;
  let closestMatch = '';
  for (let i = 0; i < words.length; i++) {
    const substring = words.slice(i, i + windowSize).join(' ');
    const similarity = similarPercent(substring.toLowerCase(), targetLower);
    if (similarity > maxSimilarity) {
      maxSimilarity = similarity;
      closestMatch = substring;
    }
  }

  if (maxSimilarity >= threshold && closestMatch !== '') {
    return responseText.split(closestMatch).join(keyword);
  }
  return responseText;
};

const enforceExactKeywordIfMissing = (text, keyword, threshold = 70) => {
  const value = typeof text === 'string' ? text.trim() : '';
  const kw = String(keyword || '').trim();

  if (value === '' || kw === '') return value !== '' ? value : null;
  if (textContainsKeyword(value, kw)) return value;
  return replaceWithTargetKeyword(value, kw, threshold);
};

/** A keyword longer than 60 chars cannot fit the title window: fall back to the keyword itself. */
const ensureKeywordInMetaTitle = (title, keyword) => {
  const kw = String(keyword || '').trim();
  if (kw === '') return title;

  const value = typeof title === 'string' ? title.trim() : '';
  if (value !== '' && textContainsKeyword(value, kw)) return value;
  if (lenOf(kw) > 60) return kw;
  return value !== '' ? value : null;
};

/** Recover a string field from valid or truncated JSON content. */
const extractJsonStringField = (content, field) => {
  const raw = String(content || '').trim();
  if (raw === '' || field === '') return null;

  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed[field] === 'string') {
      const v = parsed[field].trim();
      return v !== '' ? v : null;
    }
  } catch (_) {
    // fall through to the truncated-JSON recovery below
  }

  // Truncated mid-string: {"meta_title":"partial text without closing quote
  const pattern = new RegExp(`"${field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)(?:"|$)`, 's');
  const match = raw.match(pattern);
  if (!match) return null;

  let value;
  try {
    value = JSON.parse(`"${match[1]}"`);
  } catch (_) {
    value = match[1].replace(/\\(["\\/])/g, '$1').replace(/\\n/g, '\n').replace(/\\t/g, '\t');
  }
  value = value.trim();
  return value !== '' ? value : null;
};

/** Soft cleanup only - never strip special chars from keyword / item name. */
const softCleanGeneratedText = (content) => {
  let text = String(content || '').trim();
  if (text === '') return '';

  text = text.replace(/^\s*\{\s*"[^"]+"\s*:\s*"/, '');
  text = text.replace(/"\s*\}\s*$/, '');
  text = text.replace(CONTROL_CHARS, '');
  return text.trim();
};

/** Cap runaway/truncated titles while keeping the exact keyword. */
const clampMetaTitleLength = (title, keyword) => {
  const value = typeof title === 'string' ? title.trim() : '';
  if (value === '') return value;

  const kw = String(keyword || '').trim();
  const kwLen = kw !== '' ? lenOf(kw) : 0;
  const maxLen = kwLen > 60 ? kwLen + 10 : 60;

  const chars = Array.from(value);
  if (chars.length <= maxLen) return value;

  if (kw !== '' && textContainsKeyword(value, kw)) {
    const pos = value.toLowerCase().indexOf(kw.toLowerCase());
    if (pos !== -1) {
      const budget = maxLen - kwLen;
      if (budget <= 0) return kw;

      const before = Array.from(value.slice(0, pos));
      const after = Array.from(value.slice(pos + kw.length));
      const keepBefore = Math.min(before.length, Math.floor(budget / 2));
      const keepAfter = budget - keepBefore;

      const trimmedBefore = before.slice(Math.max(0, before.length - keepBefore)).join('');
      const trimmedAfter = after.slice(0, keepAfter).join('');
      return `${trimmedBefore}${kw}${trimmedAfter}`.trim();
    }
  }

  return chars.slice(0, maxLen).join('');
};

const DESC_FILLERS = [
  ' Secure and dependable.',
  ' Great everyday value.',
  ' Fast business performance.',
  ' Buy online today.',
];

/** Nudge short meta descriptions toward ~150 chars (validation stays 120-160). */
const expandMetaDescriptionTowardTarget = (desc, target = 148, max = 160) => {
  const value = typeof desc === 'string' ? desc.trim() : '';
  if (value === '') return value;

  const len = lenOf(value);
  if (len >= target || len > max) return value;

  for (const filler of DESC_FILLERS) {
    const candidate = value + filler;
    const cLen = lenOf(candidate);
    if (cLen >= target && cLen <= max) return candidate;
  }

  let best = value;
  let bestLen = len;
  for (const filler of DESC_FILLERS) {
    const candidate = value + filler;
    const cLen = lenOf(candidate);
    if (cLen <= max && cLen > bestLen) {
      best = candidate;
      bestLen = cLen;
    }
  }
  return best;
};

/** Parse the model's JSON reply and pull one string field out, with the PHP's 3-step fallback. */
const readJsonField = (content, field) => {
  const text = typeof content === 'string' ? content : '';

  let parsed = null;
  try {
    parsed = JSON.parse(text || '{}');
  } catch (_) {
    parsed = null;
  }

  let value = parsed && typeof parsed[field] === 'string' ? parsed[field] : null;
  if (!value || value.trim() === '') value = extractJsonStringField(text, field);
  if (!value || value.trim() === '') value = softCleanGeneratedText(text);

  return { value, jsonValid: parsed !== null && typeof parsed === 'object' };
};

module.exports = {
  CONTROL_CHARS,
  lenOf,
  textContainsKeyword,
  similarPercent,
  enforceExactKeywordIfMissing,
  ensureKeywordInMetaTitle,
  clampMetaTitleLength,
  expandMetaDescriptionTowardTarget,
  readJsonField,
};
