const EnterpriseCustomer = require('../models/EnterpriseCustomer');
const { ok } = require('../utils/response');

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normaliseEnterprisePan(value) {
  const s = String(value ?? '')
    .trim()
    .replace(/\s/g, '')
    .toUpperCase();
  return s;
}

exports.list = async (req, res) => {
  const page = Math.max(Number(req.query.page || 1), 1);
  const limit = Math.min(Number(req.query.limit || 25), 100);
  const q = (req.query.q || '').trim();

  const filter = {};
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [
      { companyName: rx },
      { legalName: rx },
      { email: rx },
      { phone: rx },
      { contactName: rx },
      { city: rx },
      { gstin: rx },
      { pan: rx },
    ];
  }

  const [enterpriseCustomers, total] = await Promise.all([
    EnterpriseCustomer.find(filter).sort('-updatedAt').skip((page - 1) * limit).limit(limit).lean(),
    EnterpriseCustomer.countDocuments(filter),
  ]);

  const rows = enterpriseCustomers.map((doc) => ({
    id: doc._id,
    companyName: doc.companyName,
    legalName: doc.legalName || '',
    gstin: doc.gstin || '',
    pan: doc.pan || '',
    contactName: doc.contactName || '',
    email: doc.email || '',
    phone: doc.phone || '',
    city: doc.city || '',
    state: doc.state || '',
    segment: doc.segment,
    status: doc.status,
    notes: doc.notes || '',
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }));

  ok(res, { enterpriseCustomers: rows, total, page, limit });
};

exports.create = async (req, res) => {
  const panNorm = normaliseEnterprisePan(req.body.pan);
  const doc = await EnterpriseCustomer.create({
    companyName: req.body.companyName,
    legalName: req.body.legalName,
    gstin: req.body.gstin,
    pan: panNorm,
    contactName: req.body.contactName,
    email: req.body.email,
    phone: req.body.phone,
    city: req.body.city,
    state: req.body.state,
    segment: req.body.segment,
    status: req.body.status,
    notes: req.body.notes,
  });
  ok(
    res,
    {
      id: doc._id,
      companyName: doc.companyName,
      legalName: doc.legalName || '',
      gstin: doc.gstin || '',
      pan: doc.pan || '',
      contactName: doc.contactName || '',
      email: doc.email || '',
      phone: doc.phone || '',
      city: doc.city || '',
      state: doc.state || '',
      segment: doc.segment,
      status: doc.status,
      notes: doc.notes || '',
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    },
    201,
  );
};
