const ApiError = require('../utils/apiError');
exports.requireRoles = (...roles) => (req, res, next) => {
  if (!req.user) return next(new ApiError(401, 'Authentication required', 'UNAUTHENTICATED'));
  if (!roles.includes(req.user.role)) return next(new ApiError(403, 'You do not have permission for this action', 'FORBIDDEN'));
  next();
};
