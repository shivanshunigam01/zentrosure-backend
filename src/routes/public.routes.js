const router = require('express').Router();
const { body, query } = require('express-validator');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middleware/validate.middleware');
const service = require('../controllers/service.controller');
const content = require('../controllers/content.controller');
const lead = require('../controllers/lead.controller');
const report = require('../controllers/report.controller');
const booking = require('../controllers/booking.controller');
const geocode = require('../controllers/geocode.controller');
router.get('/services', asyncHandler(service.listPublic));
router.get(
  '/geocode/reverse',
  [
    query('lat')
      .exists()
      .withMessage('lat is required')
      .isFloat({ min: -90, max: 90 })
      .withMessage('lat must be a number between -90 and 90'),
    query('lon')
      .exists()
      .withMessage('lon is required')
      .isFloat({ min: -180, max: 180 })
      .withMessage('lon must be a number between -180 and 180')
  ],
  validate,
  asyncHandler(geocode.reverse)
);
router.get('/services/:slug', asyncHandler(service.getPublic));
router.get('/cities', asyncHandler(content.cities));
router.get('/cities/:slug', asyncHandler(content.cityBySlug));
router.get('/blog', asyncHandler(content.blogList));
router.get('/blog/:slug', asyncHandler(content.blogDetail));
router.get('/faqs', asyncHandler(content.faqs));
router.post('/leads/contact', asyncHandler(lead.contact));
router.post('/leads/quick-callback', asyncHandler(lead.quickCallback));
router.post(
  '/bookings/quick',
  [
    body('name').trim().notEmpty(),
    body('phone').notEmpty(),
    body('email').trim().isEmail().withMessage('Valid email is required'),
    body('city').trim().notEmpty(),
    body('serviceSlug').trim().notEmpty(),
    body('otpSessionToken').trim().notEmpty(),
    body('source').optional().trim()
  ],
  validate,
  asyncHandler(booking.quickPublicBooking)
);
router.get('/inspections/:bookingNumber', asyncHandler(booking.publicInspectionDetail));
router.get('/reports/verify/:reportId', asyncHandler(report.verifyPublic));
module.exports = router;
