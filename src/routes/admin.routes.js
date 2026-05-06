const router = require('express').Router();
const { body } = require('express-validator');
const { auth } = require('../middleware/auth.middleware');
const { requireRoles } = require('../middleware/role.middleware');
const validate = require('../middleware/validate.middleware');
const asyncHandler = require('../utils/asyncHandler');
const adminBooking = require('../controllers/adminBooking.controller');
const adminInspector = require('../controllers/adminInspector.controller');
const adminAudit = require('../controllers/adminAudit.controller');
const adminNotification = require('../controllers/adminNotification.controller');
const adminRoleAccess = require('../controllers/adminRoleAccess.controller');
const service = require('../controllers/service.controller');
const contentAdmin = require('../controllers/contentAdmin.controller');
const { uploadCustomerAvatarPhoto, uploadChecklistExcel } = require('../middleware/upload.middleware');
const adminCustomer = require('../controllers/adminCustomer.controller');
const adminEnterprise = require('../controllers/adminEnterprise.controller');
const adminSupport = require('../controllers/adminSupport.controller');

router.use(auth, requireRoles('admin'));
router.get('/customers', asyncHandler(adminCustomer.list));
router.get('/audit-logs', asyncHandler(adminAudit.list));
router.get('/roles-access/catalog', asyncHandler(adminRoleAccess.catalog));
router.get('/roles-access/users', asyncHandler(adminRoleAccess.listUsers));
router.patch('/roles-access/users/:id', asyncHandler(adminRoleAccess.updateUser));
router.get('/enterprise-customers', asyncHandler(adminEnterprise.list));
router.post(
  '/enterprise-customers',
  [
    body('companyName').trim().notEmpty().withMessage('Company name is required'),
    body('legalName').optional({ checkFalsy: true }).trim(),
    body('gstin').optional({ checkFalsy: true }).trim(),
    body('contactName').optional({ checkFalsy: true }).trim(),
    body('email').optional({ checkFalsy: true }).trim().isEmail().withMessage('Valid email'),
    body('phone').optional({ checkFalsy: true }).trim(),
    body('city').optional({ checkFalsy: true }).trim(),
    body('state').optional({ checkFalsy: true }).trim(),
    body('segment').optional().isIn(['Fleet', 'Insurer', 'NBFC', 'Dealer', 'OEM', 'Other']),
    body('status').optional().isIn(['Lead', 'Active', 'Inactive']),
    body('notes').optional({ checkFalsy: true }).trim(),
  ],
  validate,
  asyncHandler(adminEnterprise.create),
);
router.get('/bookings', asyncHandler(adminBooking.list));
router.post('/bookings', asyncHandler(adminBooking.create));
router.get('/bookings/:bookingNumber', asyncHandler(adminBooking.get));
router.patch('/bookings/:bookingNumber', asyncHandler(adminBooking.patchBookingDetails));
router.patch('/bookings/:bookingNumber/checklist', asyncHandler(adminBooking.patchChecklist));
router.post('/bookings/:bookingNumber/assign', asyncHandler(adminBooking.assign));
router.post('/bookings/:bookingNumber/send-back', asyncHandler(adminBooking.sendBack));
router.post('/bookings/:bookingNumber/verify', asyncHandler(adminBooking.verify));
router.post('/bookings/:bookingNumber/publish-report', asyncHandler(adminBooking.publishReport));
router.get('/inspectors', asyncHandler(adminBooking.inspectors));
router.get('/inspectors/:id', asyncHandler(adminInspector.get));
router.get('/notifications/triggers', asyncHandler(adminNotification.triggers));
router.post(
  '/notifications/broadcast',
  [
    body('channel').trim().isIn(['whatsapp', 'sms', 'email']).withMessage('channel must be whatsapp/sms/email'),
    body('message').trim().isLength({ min: 1, max: 2000 }).withMessage('message is required'),
    body('limit').optional().isInt({ min: 1, max: 500 })
  ],
  validate,
  asyncHandler(adminNotification.broadcast)
);
router.post(
  '/inspectors',
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').trim().isEmail().withMessage('Valid email is required'),
    body('phone').trim().notEmpty().withMessage('Phone is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('inspectorCode').optional().trim(),
    body('city').optional().trim(),
    body('status').optional().isIn(['Active', 'On Job', 'Suspended']),
    body('specialisations').optional()
  ],
  validate,
  asyncHandler(adminInspector.create)
);
router.patch(
  '/inspectors/:id',
  [
    body('name').optional().trim().notEmpty(),
    body('email').optional({ checkFalsy: true }).trim().isEmail(),
    body('phone').optional().trim(),
    body('password').optional({ checkFalsy: true }).isLength({ min: 6 }),
    body('inspectorCode').optional().trim().notEmpty(),
    body('city').optional().trim(),
    body('status').optional().isIn(['Active', 'On Job', 'Suspended']),
    body('specialisations').optional()
  ],
  validate,
  asyncHandler(adminInspector.update)
);
router.delete('/inspectors/:id', asyncHandler(adminInspector.remove));
router.get('/services', asyncHandler(service.adminList));
router.post('/services', asyncHandler(service.create));
router.patch('/services/:id', asyncHandler(service.update));
router.delete('/services/:id', asyncHandler(service.remove));

router.get('/content/blog', asyncHandler(contentAdmin.blogListAll));
router.post('/content/blog', asyncHandler(contentAdmin.blogCreate));
router.patch('/content/blog/:id', asyncHandler(contentAdmin.blogUpdate));
router.delete('/content/blog/:id', asyncHandler(contentAdmin.blogDelete));

router.get('/content/faqs', asyncHandler(contentAdmin.faqListAll));
router.post('/content/faqs', asyncHandler(contentAdmin.faqCreate));
router.patch('/content/faqs/:id', asyncHandler(contentAdmin.faqUpdate));
router.delete('/content/faqs/:id', asyncHandler(contentAdmin.faqDelete));

router.get('/content/cities', asyncHandler(contentAdmin.cityListAll));
router.post('/content/cities', asyncHandler(contentAdmin.cityCreate));
router.patch('/content/cities/:id', asyncHandler(contentAdmin.cityUpdate));
router.delete('/content/cities/:id', asyncHandler(contentAdmin.cityDelete));

router.get('/content/model-images', asyncHandler(contentAdmin.modelImageListAll));
router.post('/content/model-images', asyncHandler(contentAdmin.modelImageCreate));
router.patch('/content/model-images/:id', asyncHandler(contentAdmin.modelImageUpdate));
router.delete('/content/model-images/:id', asyncHandler(contentAdmin.modelImageDelete));
router.post('/content/model-images/upload', uploadCustomerAvatarPhoto, asyncHandler(contentAdmin.modelImageUpload));
router.get('/content/checklist-templates', asyncHandler(contentAdmin.checklistTemplateListAll));
router.post('/content/checklist-templates', asyncHandler(contentAdmin.checklistTemplateCreate));
router.post('/content/checklist-templates/upload', uploadChecklistExcel, asyncHandler(contentAdmin.checklistTemplateUploadExcel));
router.delete('/content/checklist-templates/:id', asyncHandler(contentAdmin.checklistTemplateDelete));
router.get('/content/testimonials', asyncHandler(contentAdmin.testimonialListAll));
router.post('/content/testimonials', asyncHandler(contentAdmin.testimonialCreate));
router.patch('/content/testimonials/:id', asyncHandler(contentAdmin.testimonialUpdate));
router.delete('/content/testimonials/:id', asyncHandler(contentAdmin.testimonialDelete));

router.get('/support/tickets', asyncHandler(adminSupport.list));
router.get('/support/tickets/:ticketNumber', asyncHandler(adminSupport.get));
router.patch(
  '/support/tickets/:ticketNumber',
  [body('status').trim().isIn(['open', 'in_progress', 'resolved', 'closed']).withMessage('Invalid status')],
  validate,
  asyncHandler(adminSupport.patchStatus)
);
router.post(
  '/support/tickets/:ticketNumber/messages',
  [body('message').trim().notEmpty().withMessage('Message is required').isLength({ max: 8000 })],
  validate,
  asyncHandler(adminSupport.addReply)
);

module.exports = router;
