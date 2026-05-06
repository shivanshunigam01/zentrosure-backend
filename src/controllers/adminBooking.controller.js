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
const xlsx = require('xlsx');

function optionalCreateDetailFields(body) {
  const out = {};
  for (const k of ['chassisNumber', 'engineNumber', 'vehicleModel', 'vehicleSubmodel', 'invoiceNumber', 'dealerContactPhone']) {
    if (body[k] != null && String(body[k]).trim()) out[k] = String(body[k]).trim();
  }
  if (body.invoiceDate) {
    const d = new Date(body.invoiceDate);
    if (!Number.isNaN(d.getTime())) out.invoiceDate = d;
  }
  return out;
}

function inspectorExportName(b) {
  const insp = b.inspectorId;
  if (insp && typeof insp === 'object' && insp.userId && typeof insp.userId === 'object' && insp.userId.name) {
    return String(insp.userId.name);
  }
  return '';
}

function formatExportDate(d) {
  if (!d) return '';
  const t = new Date(d);
  if (Number.isNaN(t.getTime())) return '';
  return t.toISOString().slice(0, 10);
}

function bookingToExportRow(b) {
  return {
    'Booking ID': b.bookingNumber ?? '',
    Service: b.serviceSlug ?? '',
    Status: b.status ?? '',
    Payment: b.paymentStatus ?? '',
    Scheduled: b.scheduledDate ? new Date(b.scheduledDate).toISOString() : '',
    Slot: b.slot ?? '',
    City: b.city ?? '',
    'Customer name': b.customerName ?? '',
    'Customer phone': b.phone ?? '',
    'Chassis no.': b.chassisNumber ?? '',
    'Engine no.': b.engineNumber ?? '',
    Model: b.vehicleModel ?? '',
    Submodel: b.vehicleSubmodel ?? '',
    'Invoice no.': b.invoiceNumber ?? '',
    'Invoice date': formatExportDate(b.invoiceDate),
    'Dealer name': b.dealerName ?? '',
    'Dealer contact no.': b.dealerContactPhone ?? '',
    'Dealer address': b.dealerAddress ?? '',
    'Inspection address': b.address ?? '',
    'Vehicle description': b.vehicleDescription ?? '',
    Amount: b.amount ?? '',
    Inspector: inspectorExportName(b),
    'Report ID': b.report && b.report.reportId ? b.report.reportId : ''
  };
}

async function findBooking(bookingNumber) {
  const booking = await Booking.findOne({ bookingNumber })
    .populate({ path: 'inspectorId', populate: { path: 'userId', select: 'name email phone' } })
    .populate('customerId', 'name email phone');
  if (!booking) throw new ApiError(404, 'Booking not found', 'NOT_FOUND');
  return booking;
}

async function computeInspectorBookingStats(inspectorObjectId) {
  if (!inspectorObjectId) return { inspectionsCompleted: 0, awaitingAdminReview: 0, reportsPublished: 0 };
  const [inspectionsCompleted, awaitingAdminReview, reportsPublished] = await Promise.all([
    Booking.countDocuments({
      inspectorId: inspectorObjectId,
      status: { $in: ['Submitted for Review', 'Verified', 'Report Published'] }
    }),
    Booking.countDocuments({ inspectorId: inspectorObjectId, status: 'Submitted for Review' }),
    Booking.countDocuments({ inspectorId: inspectorObjectId, status: 'Report Published' })
  ]);
  return { inspectionsCompleted, awaitingAdminReview, reportsPublished };
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
    ...optionalCreateDetailFields(req.body),
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
  booking.checklist = req.body.checklist || [];
  if (req.body.lockChecklist === true) {
    booking.checklistLocked = true;
    booking.checklistLockedAt = new Date();
    booking.checklistTemplateTitle = req.body.templateTitle ? String(req.body.templateTitle).trim() : booking.checklistTemplateTitle;
  } else if (req.body.lockChecklist === false) {
    booking.checklistLocked = false;
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
/** Download bookings as CSV or Excel (admin). Query: format=csv | xlsx */
exports.exportBookings = async (req, res) => {
  const format = String(req.query.format || 'csv').toLowerCase();
  if (!['csv', 'xlsx'].includes(format)) throw new ApiError(400, 'format must be csv or xlsx', 'VALIDATION_ERROR');

  const bookings = await Booking.find({})
    .sort('-createdAt')
    .limit(3000)
    .populate({ path: 'inspectorId', populate: { path: 'userId', select: 'name' } })
    .lean();

  const template = bookingToExportRow({});
  const colKeys = Object.keys(template);
  const rows = bookings.length ? bookings.map(bookingToExportRow) : [];
  const stamp = new Date().toISOString().slice(0, 10);

  if (format === 'csv') {
    const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = colKeys.map(escape).join(',');
    const lines = rows.map((r) => colKeys.map((k) => escape(r[k])).join(','));
    const csv = lines.length ? [header, ...lines].join('\n') : header;
    res
      .status(200)
      .setHeader('Content-Type', 'text/csv; charset=utf-8')
      .setHeader('Content-Disposition', `attachment; filename="zentrosure-bookings-${stamp}.csv"`)
      .send(`\uFEFF${csv}`);
    return;
  }

  const ws = xlsx.utils.json_to_sheet(rows.length ? rows : [template]);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, 'Bookings');
  const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res
    .status(200)
    .setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    .setHeader('Content-Disposition', `attachment; filename="zentrosure-bookings-${stamp}.xlsx"`)
    .send(buf);
};

exports.inspectors = async (req, res) => {
  const rows = await Inspector.find().populate('userId', 'name email phone').lean();
  const withStats = await Promise.all(
    rows.map(async (inspector) => {
      const stats = await computeInspectorBookingStats(inspector._id);
      return {
        ...inspector,
        jobsCompleted: stats.inspectionsCompleted,
        reviewsReceived: stats.reportsPublished,
        awaitingAdminReview: stats.awaitingAdminReview
      };
    })
  );
  ok(res, withStats);
};
