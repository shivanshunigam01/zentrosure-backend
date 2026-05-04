const Booking = require('../models/Booking');
const ApiError = require('../utils/apiError');
const { ok } = require('../utils/response');

exports.myReports = async (req, res) => {
  const reports = await Booking.find({ customerId: req.user.id, status: 'Report Published', 'report.reportId': { $exists: true } })
    .select('bookingNumber vehicleDescription city report createdAt');
  ok(res, reports);
};
exports.verifyPublic = async (req, res) => {
  const booking = await Booking.findOne({ 'report.reportId': req.params.reportId, status: 'Report Published' }).select('bookingNumber customerName vehicleDescription city report');
  if (!booking) throw new ApiError(404, 'Report not found or not published', 'NOT_FOUND');
  ok(res, { valid: true, report: booking.report, bookingNumber: booking.bookingNumber, vehicleDescription: booking.vehicleDescription, city: booking.city });
};
