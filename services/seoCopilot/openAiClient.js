'use strict';

const axios = require('axios');
const { logError } = require('../../utils/logger');

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const NEW_MODEL_PREFIXES = ['o1', 'o2', 'o3', 'o4', 'gpt-4.1', 'gpt-5'];

/** Accepts "sk-..." or "Bearer sk-..."; env OPEN_AI_LIVE_KEY (same as PHP) or OPENAI_API_KEY. */
const resolveAuthHeader = () => {
  const raw = String(process.env.OPEN_AI_LIVE_KEY || process.env.OPENAI_API_KEY || '').trim();
  if (raw === '') return '';
  return raw.toLowerCase().startsWith('bearer ') ? raw : `Bearer ${raw}`;
};

/** Newer models take max_completion_tokens instead of max_tokens. */
const normalizePayload = (payload) => {
  const next = { ...payload };
  const model = String(next.model || '').toLowerCase();
  const usesNewParam = NEW_MODEL_PREFIXES.some((prefix) => model.startsWith(prefix));

  if (usesNewParam && next.max_tokens !== undefined) {
    next.max_completion_tokens = next.max_tokens;
    delete next.max_tokens;
  }
  return next;
};

/**
 * Port of App\Services\Ai\OpenAiClient::chatCompletions.
 * Returns {} on any failure (missing key, HTTP error, network error), same as the PHP returning [].
 */
const chatCompletions = async (payload) => {
  const authorization = resolveAuthHeader();
  if (authorization === '') {
    logError({ message: 'OpenAiClient: missing OPEN_AI_LIVE_KEY / OPENAI_API_KEY' });
    return {};
  }

  try {
    const resp = await axios.post(OPENAI_URL, normalizePayload(payload), {
      headers: { 'Content-Type': 'application/json', Authorization: authorization },
      timeout: 60000,
    });

    const data = resp.data;
    if (!data || typeof data !== 'object') {
      logError({ message: 'OpenAiClient: non-JSON response' });
      return {};
    }
    return data;
  } catch (error) {
    logError({
      message: 'OpenAiClient: request failed',
      error: error.response?.data?.error?.message || error.message,
    });
    return {};
  }
};

module.exports = { chatCompletions };
