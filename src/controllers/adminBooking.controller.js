const Booking = require('../models/Booking');
const Inspector = require('../models/Inspector');
const Service = require('../models/Service');
const User = require('../models/User');
const ApiError = require('../utils/apiError');
const { ok } = require('../utils/response');
const { generateReportId, generateBookingNumber } = require('../utils/ids');
const { normalizeIndianPhone } = require('../utils/phone');
const mail = require('../services/mail.service');
const bookingWhatsapp = require('../services/bookingWhatsapp.service');
const { applyBookingDetailPatch } = require('../utils/bookingPatch');

async function findBooking(bookingNumber) {
  const booking = await Booking.findOne({ bookingNumber })
    .populate({ path: 'inspectorId', populate: { path: 'userId', select: 'name email phone' } })
    .populate('customerId', 'name email phone');
  if (!booking) throw new ApiError(404, 'Booking not found', 'NOT_FOUND');
  return booking;
}

exports.list = async (req, res) => {
  const page = Math.max(Number(req.query.page || 1), 1);
  const limit = Math.min(Number(req.query.limit || 20), 100);
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.city) filter.city = new RegExp(req.query.city, 'i');
  const [data, total] = await Promise.all([
    Booking.find(filter)
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(limit)
      .populate({ path: 'inspectorId', populate: { path: 'userId', select: 'name email phone' } }),
    Booking.countDocuments(filter)
  ]);
  ok(res, data, 200, { page, limit, total });
};

/** Admin creates a booking for an existing retail customer account. */
exports.create = async (req, res) => {
  const customerIdRaw = req.body.customerId;
  if (!customerIdRaw) throw new ApiError(400, 'customerId is required', 'VALIDATION_ERROR');
  const user = await User.findById(customerIdRaw);
  if (!user || user.role !== 'customer') {
    throw new ApiError(400, 'Invalid customer account', 'VALIDATION_ERROR');
  }

  const serviceSlug = String(req.body.serviceSlug || '').trim().toLowerCase();
  if (!serviceSlug) throw new ApiError(400, 'serviceSlug is required', 'VALIDATION_ERROR');
  const service = await Service.findOne({ slug: serviceSlug, active: true });
  if (!service) throw new ApiError(404, 'Selected service not found', 'NOT_FOUND');

  const vehicleDescription = String(req.body.vehicleDescription || '').trim();
  const city = String(req.body.city || '').trim();
  if (!vehicleDescription) throw new ApiError(400, 'vehicleDescription is required', 'VALIDATION_ERROR');
  if (!city) throw new ApiError(400, 'city is required', 'VALIDATION_ERROR');

  let scheduledDate;
  if (req.body.scheduledDate) {
    scheduledDate = new Date(req.body.scheduledDate);
  }
  if (!scheduledDate || Number.isNaN(scheduledDate.getTime())) {
    throw new ApiError(400, 'scheduledDate is required (valid date)', 'VALIDATION_ERROR');
  }

  const contactName = String(req.body.contactName || user.name || '').trim();
  if (!contactName) throw new ApiError(400, 'Contact name is required', 'VALIDATION_ERROR');

  const phoneRaw = req.body.contactPhone || req.body.phone || user.phone || '';
  const phone = normalizeIndianPhone(String(phoneRaw || ''));
  if (!phone) throw new ApiError(400, 'Valid Indian mobile number is required', 'VALIDATION_ERROR');

  let paymentStatus = String(req.body.paymentStatus || 'pending').trim().toLowerCase();
  if (!['pending', 'paid', 'refunded'].includes(paymentStatus)) paymentStatus = 'pending';

  let amount = service.price ?? 0;
  if (req.body.amount != null && req.body.amount !== '') {
    const n = Number(req.body.amount);
    if (!Number.isNaN(n) && n >= 0) amount = n;
  }

  const bookingNumber = await generateBookingNumber();
  const booking = await Booking.create({
    bookingNumber,
    customerId: user._id,
    customerName: contactName,
    phone,
    serviceSlug,
    vehicleDescription,
    city,
    scheduledDate,
    slot: req.body.slot != null ? String(req.body.slot).trim() : undefined,
    address: req.body.address != null ? String(req.body.address).trim() : undefined,
    dealerName: req.body.dealerName != null ? String(req.body.dealerName).trim() : undefined,
    dealerLocation: req.body.dealerLocation != null ? String(req.body.dealerLocation).trim() : undefined,
    dealerAddress: req.body.dealerAddress != null ? String(req.body.dealerAddress).trim() : undefined,
    amount,
    paymentStatus,
    checklist: Array.isArray(req.body.checklist) ? req.body.checklist : [],
    history: [{ event: 'Booking created', meta: { by: req.user.id, source: 'admin' } }]
  });

  ok(res, booking, 201);
};

exports.get = async (req, res) => ok(res, await findBooking(req.params.bookingNumber));
exports.patchBookingDetails = async (req, res) => {
  const booking = await findBooking(req.params.bookingNumber);
  if (booking.status === 'Cancelled') throw new ApiError(409, 'Cannot edit a cancelled booking', 'INVALID_TRANSITION');
  applyBookingDetailPatch(booking, req.body || {});
  if (Object.hasOwn(req.body || {}, 'paymentStatus')) {
    const nextPaymentStatus = String(req.body.paymentStatus || '').trim().toLowerCase();
    const allowed = ['pending', 'paid', 'refunded'];
    if (!allowed.includes(nextPaymentStatus)) {
      throw new ApiError(400, 'paymentStatus must be one of: pending, paid, refunded', 'VALIDATION_ERROR');
    }
    booking.paymentStatus = nextPaymentStatus;
    booking.history.push({
      event: 'Payment status updated',
      meta: { by: req.user.id, paymentStatus: nextPaymentStatus }
    });
  }
  booking.history.push({ event: 'Booking details updated', meta: { by: req.user.id } });
  await booking.save();
  ok(res, booking);
};
exports.patchChecklist = async (req, res) => {
  const booking = await findBooking(req.params.bookingNumber);
  if (booking.checklistLocked) {
    throw new ApiError(409, 'Checklist is locked from admin panel after template upload', 'CHECKLIST_LOCKED');
  }
  booking.checklist = req.body.checklist || [];
  if (req.body.lockChecklist === true) {
    booking.checklistLocked = true;
    booking.checklistLockedAt = new Date();
    booking.checklistTemplateTitle = req.body.templateTitle ? String(req.body.templateTitle).trim() : booking.checklistTemplateTitle;
  }
  booking.history.push({ event: 'Checklist updated', meta: { by: req.user.id } });
  await booking.save();
  ok(res, booking);
};
exports.assign = async (req, res) => {
  const booking = await findBooking(req.params.bookingNumber);
  if (booking.paymentStatus !== 'paid') {
    throw new ApiError(409, 'Payment must be completed before assigning an inspector', 'PAYMENT_PENDING');
  }
  const inspector = await Inspector.findById(req.body.inspectorId).populate('userId');
  if (!inspector) throw new ApiError(404, 'Inspector not found', 'NOT_FOUND');
  booking.inspectorId = inspector._id;
  booking.status = 'Awaiting Inspector';
  booking.assignmentStatus = 'pending';
  booking.assignmentRespondedAt = null;
  booking.assignmentRejectionNote = '';
  booking.history.push({ event: 'Inspector assigned', meta: { inspectorId: inspector._id, by: req.user.id } });
  inspector.status = 'On Job';
  await Promise.all([booking.save(), inspector.save()]);
  setImmediate(() => {
    mail.sendInspectorAssignedEmail(booking, inspector).catch((err) => {
      console.error('[mail] inspector-assigned notify failed:', err.message || err);
    });
    bookingWhatsapp.sendInspectorAssignedWhatsApp(booking).catch((err) => {
      console.error('[whatsapp] inspector-assigned notify failed:', err.message || err);
    });
  });
  ok(res, booking);
};
exports.sendBack = async (req, res) => {
  const booking = await findBooking(req.params.bookingNumber);
  if (booking.status !== 'Submitted for Review') throw new ApiError(409, 'Only submitted bookings can be sent back', 'INVALID_TRANSITION');
  booking.status = 'Sent Back';
  booking.history.push({ event: 'Sent back to inspector', meta: { reason: req.body.reason, by: req.user.id } });
  await booking.save();
  ok(res, booking);
};
exports.verify = async (req, res) => {
  const booking = await findBooking(req.params.bookingNumber);
  if (!['Submitted for Review', 'Sent Back'].includes(booking.status)) throw new ApiError(409, 'Booking is not ready for verification', 'INVALID_TRANSITION');
  booking.status = 'Verified';
  booking.history.push({ event: 'Inspection verified', meta: { by: req.user.id } });
  await booking.save();
  ok(res, booking);
};
exports.publishReport = async (req, res) => {
  const booking = await findBooking(req.params.bookingNumber);
  if (booking.status !== 'Verified') throw new ApiError(409, 'Verify booking before publishing report', 'INVALID_TRANSITION');
  booking.status = 'Report Published';
  booking.report = { reportId: req.body.reportId || generateReportId(booking.bookingNumber), publishedAt: new Date(), score: req.body.score, verdict: req.body.verdict, adminNotes: req.body.adminNotes, highlights: req.body.highlights || [] };
  booking.history.push({ event: 'Report published', meta: { reportId: booking.report.reportId, by: req.user.id } });
  await booking.save();

  const reportSnapshot = booking.report;
  const customerId = booking.customerId && booking.customerId._id ? booking.customerId._id : booking.customerId;
  setImmediate(async () => {
    try {
      const customer = customerId ? await User.findById(customerId).lean() : null;
      await mail.sendReportPublishedEmail({ booking, customer, report: reportSnapshot });
      await bookingWhatsapp.sendReportPublishedWhatsApp({ booking, customer, report: reportSnapshot });
    } catch (err) {
      console.error('[report-published notify] failed:', err.message || err);
    }
  });

  ok(res, booking);
};
exports.inspectors = async (req, res) => ok(res, await Inspector.find().populate('userId', 'name email phone'));
