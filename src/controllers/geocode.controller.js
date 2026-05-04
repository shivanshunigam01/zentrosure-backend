const ApiError = require('../utils/apiError');
const env = require('../config/env');
const { ok } = require('../utils/response');
const { reverseGeocode } = require('../services/reverseGeocode.service');

exports.reverse = async (req, res) => {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);

  if (!env.geoapify.apiKey) {
    throw new ApiError(
      503,
      'Reverse geocoding is not configured (set GEOAPIFY_API_KEY)',
      'GEOCODE_NOT_CONFIGURED'
    );
  }

  const result = await reverseGeocode(lat, lon);
  if (!result) {
    throw new ApiError(502, 'Could not resolve address for these coordinates', 'GEOCODE_FAILED');
  }

  const stripRaw = req.query.includeRaw === '0' || req.query.includeRaw === 'false';
  const data = {
    address: result.address,
    city: result.city,
    state: result.state,
    postcode: result.postcode,
    country: result.country,
    ...(stripRaw ? {} : { raw: result.raw })
  };

  ok(res, data);
};
