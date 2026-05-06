const router = require('express').Router();
const { body } = require('express-validator');
const validate = require('../middleware/validate.middleware');
const { auth } = require('../middleware/auth.middleware');
const { authLimiter, otpLimiter } = require('../middleware/rateLimit.middleware');
const asyncHandler = require('../utils/asyncHandler');
const authController = require('../controllers/auth.controller');
const otpController = require('../controllers/otp.controller');

router.post('/register', [body('name').notEmpty(), body('password').optional().isLength({ min: 6 })], validate, asyncHandler(authController.register));
router.post('/login', authLimiter, [body('password').notEmpty()], validate, asyncHandler(authController.login));
router.post('/forgot-password', authLimiter, [body('emailOrPhone').notEmpty()], validate, asyncHandler(authController.forgotPassword));
router.post(
  '/change-password',
  auth,
  [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword').isLength({ min: 8, max: 72 }).withMessage('New password must be 8-72 characters')
  ],
  validate,
  asyncHandler(authController.changePassword)
);
router.post('/refresh', asyncHandler(authController.refresh));
router.post('/logout', auth, asyncHandler(authController.logout));
router.post('/otp/send', otpLimiter, [body('phone').notEmpty()], validate, asyncHandler(otpController.sendOtp));
router.post(
  '/otp/hydrate',
  otpLimiter,
  [body('phone').notEmpty(), body('code').matches(/^\d{6}$/), body('source').optional()],
  validate,
  asyncHandler(otpController.hydrateClientOtp)
);
router.post('/otp/verify', [body('phone').notEmpty(), body('code').isLength({ min: 4 })], validate, asyncHandler(otpController.verifyOtp));
module.exports = router;
