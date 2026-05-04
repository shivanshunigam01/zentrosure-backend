const Booking = require('../models/Booking');
const SupportTicket = require('../models/SupportTicket');

async function generateBookingNumber() {
  const year = new Date().getFullYear();
  const count = await Booking.countDocuments({ createdAt: { $gte: new Date(`${year}-01-01`) } });
  return `AS-${year}-${String(count + 1).padStart(5, '0')}`;
}

async function generateTicketNumber() {
  const year = new Date().getFullYear();
  const count = await SupportTicket.countDocuments({ createdAt: { $gte: new Date(`${year}-01-01`) } });
  return `TKT-${year}-${String(count + 1).padStart(5, '0')}`;
}

function generateReportId(bookingNumber) {
  return `RPT-${bookingNumber}`;
}
module.exports = { generateBookingNumber, generateTicketNumber, generateReportId };
