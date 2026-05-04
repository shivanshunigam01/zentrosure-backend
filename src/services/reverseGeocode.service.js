const axios = require('axios');
const env = require('../config/env');

const GEOAPIFY_URL = 'https://api.geoapify.com/v1/geocode/reverse';
const TIMEOUT_MS = Number(process.env.GEOAPIFY_TIMEOUT_MS || 4500);
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** In-memory lat/lon → place cache (24h TTL). */
const cache = new Map();

/**
 * @param {number} lat
 * @param {number} lon
 */
function cacheKey(lat, lon) {
  return `${Number(lat).toFixed(6)},${Number(lon).toFixed(6)}`;
}

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function setCached(key, value) {
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

/**
 * @param {string} url
 * @param {import('axios').AxiosRequestConfig} config
 */
async function axiosGetWithRetry(url, config) {
  const run = () => axios.get(url, config);
  try {
    return await run();
  } catch (err) {
    const retryable =
      axios.isAxiosError(err) &&
      (err.code === 'ECONNABORTED' ||
        err.code === 'ETIMEDOUT' ||
        err.code === 'ECONNRESET' ||
        !err.response ||
        (err.response.status >= 500 && err.response.status < 600));
    if (!retryable) throw err;
    await new Promise((r) => setTimeout(r, 200));
    return run();
  }
}

/**
 * @param {Record<string, unknown>} props
 */
function buildPlaceFromProperties(props) {
  const formatted = String(props.formatted || '').trim();
  const city = String(props.city || props.municipality || props.county || '').trim();
  const state = String(props.state || props.region || '').trim();
  const postcode = String(props.postcode || '').trim();
  const country = String(props.country || '').trim();
  const line = [
    [props.housenumber != null ? String(props.housenumber) : '', props.street != null ? String(props.street) : '']
      .filter((x) => x.trim() !== '')
      .join(' ')
      .trim(),
    city,
    state,
    postcode,
    country
  ]
    .filter((x) => x && String(x).trim() !== '')
    .join(', ');
  const address = formatted || line;
  return { address: address.trim(), city, state, postcode, country };
}

/**
 * @param {number} lat
 * @param {number} lon
 */
async function fetchFromGeoapify(lat, lon) {
  const apiKey = env.geoapify.apiKey;
  if (!apiKey) return null;

  const response = await axiosGetWithRetry(GEOAPIFY_URL, {
    params: { lat, lon, apiKey },
    timeout: TIMEOUT_MS
  });

  const data = response.data;
  if (!data || !Array.isArray(data.features) || data.features.length === 0) return null;

  const props = /** @type {Record<string, unknown>} */ (data.features[0].properties || {});
  const { address, city, state, postcode, country } = buildPlaceFromProperties(props);
  if (!address) return null;

  return {
    address,
    city,
    state,
    postcode,
    country,
    raw: data
  };
}

/**
 * Cached reverse geocode (lat/lon → structured place + raw Geoapify payload).
 * @param {number} lat
 * @param {number} lon
 */
async function reverseGeocode(lat, lon) {
  const key = cacheKey(lat, lon);
  const hit = getCached(key);
  if (hit) return hit;

  try {
    const result = await fetchFromGeoapify(lat, lon);
    if (result) setCached(key, result);
    return result;
  } catch (err) {
    const msg = axios.isAxiosError(err) ? err.message : String(err);
    console.error('[reverseGeocode] Geoapify request failed:', msg);
    return null;
  }
}

/**
 * @param {number} lat
 * @param {number} lon
 * @returns {Promise<string | null>}
 */
async function getAddressFromCoordinates(lat, lon) {
  const r = await reverseGeocode(lat, lon);
  return r?.address ?? null;
}

module.exports = {
  getAddressFromCoordinates,
  reverseGeocode
};
