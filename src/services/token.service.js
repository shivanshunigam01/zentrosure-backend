const jwt = require('jsonwebtoken');
const env = require('../config/env');
function signAccessToken(user) {
  return jwt.sign({ id: user._id.toString(), role: user.role }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
}
function signRefreshToken(user) {
  return jwt.sign({ id: user._id.toString(), role: user.role }, env.jwtRefreshSecret, { expiresIn: env.jwtRefreshExpiresIn });
}
module.exports = { signAccessToken, signRefreshToken };
