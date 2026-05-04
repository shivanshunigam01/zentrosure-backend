const router = require('express').Router();
router.get('/health', (req, res) => res.json({ success: true, data: { status: 'ok', service: 'zentrosure-backend' } }));
router.use('/', require('./public.routes'));
router.use('/auth', require('./auth.routes'));
// Role-specific mounts MUST come before `customer.routes` (mounted at `/`). Otherwise
// `router.use(auth, requireRoles('customer'))` in customer.routes runs for /admin/* and /inspector/* → 403.
router.use('/admin', require('./admin.routes'));
router.use('/inspector', require('./inspector.routes'));
router.use('/', require('./customer.routes'));
module.exports = router;
