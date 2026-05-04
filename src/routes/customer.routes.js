const router = require('express').Router();
const { body } = require('express-validator');
const { auth } = require('../middleware/auth.middleware');
const { requireRoles } = require('../middleware/role.middleware');
const validate = require('../middleware/validate.middleware');
const asyncHandler = require('../utils/asyncHandler');
const user = require('../controllers/user.controller');
const profile = require('../controllers/profile.controller');
const booking = require('../controllers/booking.controller');
const report = require('../controllers/report.controller');
const payment = require('../controllers/payment.controller');
const supportTicket = require('../controllers/supportTicket.controller');
const { uploadCustomerAvatarPhoto } = require('../middleware/upload.middleware');

/** Profile for any authenticated role (admin / inspector / customer). */
router.get('/me', auth, asyncHandler(user.me));
router.patch('/me', auth, asyncHandler(user.updateMe));

router.use(auth, requireRoles('customer'));

const profileFields = [
  body('address').optional().trim(),
  body('city').optional().trim(),
  body('state').optional().trim(),
  body('pincode').optional().trim(),
  body('avatarUrl').optional().trim()
];

router.get('/profile', asyncHandler(profile.getCustomerProfile));
router.post('/profile', profileFields, validate, asyncHandler(profile.createCustomerProfile));
router.put('/profile', profileFields, validate, asyncHandler(profile.replaceCustomerProfile));
router.patch(
  '/profile',
  [
    body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
    body('email').optional({ checkFalsy: true }).trim().isEmail().withMessage('Valid email required'),
    body('phone').optional().trim(),
    body('address').optional().trim(),
    body('city').optional().trim(),
    body('state').optional().trim(),
    body('pincode').optional().trim(),
    body('avatarUrl').optional().trim()
  ],
  validate,
  asyncHandler(profile.patchCustomerProfile)
);
router.delete('/profile', asyncHandler(profile.deleteCustomerProfile));
router.post('/profile/avatar', uploadCustomerAvatarPhoto, asyncHandler(profile.uploadCustomerAvatar));

router.post(
  '/bookings',
  [
    body('serviceSlug').notEmpty(),
    body('vehicleDescription').notEmpty(),
    body('city').notEmpty(),
    body('scheduledDate').notEmpty(),
    body('contactName').notEmpty(),
    body('contactPhone').notEmpty()
  ],
  validate,
  asyncHandler(booking.createCustomerBooking)
);
router.get('/bookings', asyncHandler(booking.myBookings));
router.patch('/bookings/:bookingNumber', asyncHandler(booking.patchMine));
router.get('/bookings/:bookingNumber', asyncHandler(booking.getMine));
router.get('/reports', asyncHandler(report.myReports));
router.post('/payments/orders', asyncHandler(payment.createOrder));
router.post('/payments/verify', asyncHandler(payment.verifyOrder));

router.post(
  '/support/tickets',
  [
    body('subject').trim().notEmpty().withMessage('Subject is required').isLength({ max: 200 }),
    body('message').trim().notEmpty().withMessage('Message is required').isLength({ min: 5, max: 8000 }),
    body('category').optional().trim().isIn(['booking', 'billing', 'report', 'technical', 'other'])
  ],
  validate,
  asyncHandler(supportTicket.create)
);
router.get('/support/tickets', asyncHandler(supportTicket.listMine));
router.get('/support/tickets/:ticketNumber', asyncHandler(supportTicket.getMine));
router.post(
  '/support/tickets/:ticketNumber/messages',
  [body('message').trim().notEmpty().withMessage('Message is required').isLength({ max: 8000 })],
  validate,
  asyncHandler(supportTicket.addCustomerMessage)
);

module.exports = router;
