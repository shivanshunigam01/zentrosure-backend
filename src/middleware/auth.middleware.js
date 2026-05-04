const jwt = require('jsonwebtoken');
const env = require('../config/env');
const User = require('../models/User');
const ApiError = require('../utils/apiError');
const asyncHandler = require('../utils/asyncHandler');

exports.auth = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new ApiError(401, 'Authentication token missing', 'UNAUTHENTICATED');
  try {
    const payload = jwt.verify(token, env.jwtSecret);
    const user = await User.findById(payload.id).select('-passwordHash');
    if (!user) throw new ApiError(401, 'User not found', 'UNAUTHENTICATED');
    req.user = {
      id: user._id.toString(),
      role: user.role,
      email: user.email,
      phone: user.phone,
      name: user.name,
      inspectorProfileId: user.inspectorProfileId,
      moduleAccess: user.moduleAccess || {}
    };
    next();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(401, 'Invalid or expired token', 'UNAUTHENTICATED');
  }
});
