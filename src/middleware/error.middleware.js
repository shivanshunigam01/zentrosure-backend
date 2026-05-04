const ApiError = require('../utils/apiError');

function notFound(req, res, next) {
  next(new ApiError(404, `Route not found: ${req.originalUrl}`, 'NOT_FOUND'));
}

function errorHandler(err, req, res, next) {
  const status = err.statusCode || (err.name === 'ValidationError' ? 400 : 500);
  const code = err.code || (status === 400 ? 'VALIDATION_ERROR' : 'SERVER_ERROR');
  const details = err.details || (err.errors ? Object.values(err.errors).map((e) => ({ field: e.path, msg: e.message })) : []);
  if (status >= 500) console.error(err);
  res.status(status).json({ success: false, error: { code, message: err.message || 'Something went wrong', details } });
}
module.exports = { notFound, errorHandler };
