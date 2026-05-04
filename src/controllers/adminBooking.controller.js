const Booking = require('../models/Booking');
const Inspector = require('../models/Inspector');
const User = require('../models/User');
const ApiError = require('../utils/apiError');
const { ok } = require('../utils/response');
const { generateReportId } = require('../utils/ids');
const mail = require('../services/mail.service');
const bookingWhatsapp = require('../services/bookingWhatsapp.service');
const { applyBookingDetailPatch } = require('../utils/bookingPatch');

async function findBooking(bookingNumber) {
  const booking = await Booking.findOne({ bookingNumber }).populate('inspectorId').populate('customerId', 'name email phone');
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
    Booking.find(filter).sort('-createdAt').skip((page - 1) * limit).limit(limit).populate('inspectorId'),
    Booking.countDocuments(filter)
  ]);
  ok(res, data, 200, { page, limit, total });
};
exports.get = async (req, res) => ok(res, await findBooking(req.params.bookingNumber));
exports.patchBookingDetails = async (req, res) => {
  const booking = await findBooking(req.params.bookingNumber);
  if (booking.status === 'Cancelled') throw new ApiError(409, 'Cannot edit a cancelled booking', 'INVALID_TRANSITION');
  applyBookingDetailPatch(booking, req.body || {});
  booking.history.push({ event: 'Booking details updated', meta: { by: req.user.id } });
  await booking.save();
  ok(res, booking);
};
exports.patchChecklist = async (req, res) => {
  const booking = await findBooking(req.params.bookingNumber);
  booking.checklist = req.body.checklist || [];
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
