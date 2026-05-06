/**
 * Seeds MongoDB with users, catalog + CMS data for the public site and booking dropdowns.
 * Run: npm run seed   (requires MONGO_URI in .env)
 */
const bcrypt = require('bcryptjs');
const connectDB = require('../config/db');
const User = require('../models/User');
const Inspector = require('../models/Inspector');
const Service = require('../models/Service');
const { BlogPost, Faq, CityPage, Testimonial } = require('../models/Content');
const EnterpriseCustomer = require('../models/EnterpriseCustomer');

/** Dev logins — same password for all (stored as bcrypt in DB). Log in with email + password. */
const SEED_PASSWORD = 'Password@123';
const SEED_USERS = [
  { email: 'admin@zentrosure.com', name: 'ZentroSure Admin', phone: '919771495587', role: 'admin' },
  { email: 'customer@zentrosure.com', name: 'Demo Customer', phone: '917777777777', role: 'customer' },
  { email: 'inspector@zentrosure.com', name: 'Demo Inspector', phone: '918888888888', role: 'inspector' },
];

function citySlug(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\s+/g, '-');
}

const SERVICES = [
  { slug: 'pdi', title: 'Pre-Delivery Inspection (PDI)', description: 'Brand-new car inspection before delivery from the dealer.', price: 1499, eta: '60–90 min', icon: 'shield', active: true },
  { slug: 'used-car', title: 'Used Car Inspection', description: '200+ checkpoint inspection for pre-owned cars with digital report.', price: 1799, eta: '90 min', icon: 'car', active: true },
  { slug: 'used-bike', title: 'Used Bike Inspection', description: 'Comprehensive two-wheeler inspection.', price: 999, eta: '45 min', icon: 'bike', active: true },
  { slug: 'commercial', title: 'Commercial Vehicle Inspection', description: 'Trucks, buses and on-road commercial vehicle inspection.', price: 2999, eta: '2 hrs', icon: 'truck', active: true },
  { slug: 'commercial-vehicle', title: 'Heavy Commercial & Equipment', description: 'HCV, tippers, construction and yard equipment inspection programs.', price: 3499, eta: 'Half day', icon: 'truck', active: true },
  { slug: 'fleet', title: 'Fleet Inspection', description: 'Bulk inspection for fleet operators.', price: 0, eta: 'Custom', icon: 'layers', active: true },
  { slug: 'insurance', title: 'Insurance Inspection', description: 'Pre-policy and claim verification inspection.', price: 1299, eta: '60 min', icon: 'file', active: true },
  { slug: 'finance', title: 'Finance / Loan Verification', description: 'Vehicle verification for banks and lenders.', price: 1199, eta: '60 min', icon: 'bank', active: true },
  { slug: 'government', title: 'Government Vehicle Inspection', description: 'PSU and government tender inspections.', price: 0, eta: 'Custom', icon: 'landmark', active: true },
  { slug: 'dealer-stock', title: 'Dealer Stock Inspection', description: 'Dealer yard stock audits.', price: 0, eta: 'Custom', icon: 'warehouse', active: true },
  { slug: 'accident', title: 'Accident Vehicle Inspection & Certification', description: 'Damage assessment, repair estimate support, and certification guidance.', price: 1999, eta: '90 min', icon: 'alert', active: true },
  { slug: 'road-test', title: 'Road Test Inspection', description: 'On-road performance and drivetrain evaluation.', price: 1499, eta: '60 min', icon: 'gauge', active: true },
  { slug: 'documents', title: 'Document Verification', description: 'RC, insurance, PUC and hypothecation verification.', price: 599, eta: '30 min', icon: 'filetext', active: true },
  { slug: 'valuation', title: 'Valuation Report', description: 'Independent fair market valuation report.', price: 999, eta: '45 min', icon: 'rupee', active: true },
  { slug: 'certification', title: 'Certification Report', description: 'ZentroSure Certified seal for qualifying vehicles.', price: 1499, eta: '60 min', icon: 'award', active: true },
  { slug: 'qr-verify', title: 'QR Report Verification', description: 'Verify authenticity of any published ZentroSure report.', price: 0, eta: 'Instant', icon: 'qr', active: true },
];

const CITY_NAMES = [
  'Delhi', 'Mumbai', 'Bangalore', 'Pune', 'Ahmedabad', 'Patna', 'Hyderabad', 'Chennai', 'Kolkata', 'Jaipur',
  'Lucknow', 'Chandigarh', 'Surat', 'Indore', 'Bhopal', 'Nagpur', 'Coimbatore', 'Kochi', 'Vadodara', 'Ludhiana',
  'Agra', 'Nashik', 'Visakhapatnam', 'Kanpur', 'Gurugram', 'Noida', 'Faridabad', 'Thane', 'Navi Mumbai', 'Mysuru',
  'Mangaluru', 'Vijayawada', 'Bhubaneswar', 'Guwahati', 'Ranchi', 'Raipur',
];

const FAQS = [
  { question: 'What is ZentroSure vehicle inspection?', answer: 'ZentroSure is an independent third-party inspection service. Certified inspectors evaluate 200+ checkpoints and deliver a tamper-proof digital report you can verify by QR.' },
  { question: 'How long does an inspection take?', answer: 'Most doorstep inspections take 60–90 minutes. A detailed report is usually shared within 2 hours after completion.' },
  { question: 'Where do you provide inspection services?', answer: 'We operate across major cities in India. Pick your city on the website or app; availability is shown when you book.' },
  { question: 'How do I verify a ZentroSure report?', answer: 'Every published report has a unique ID and QR. Use the Verify page on this site or scan the QR on the PDF to confirm authenticity.' },
  { question: 'Do you inspect commercial vehicles and fleets?', answer: 'Yes. We offer commercial vehicle inspection, fleet programs, dealer stock audits and insurance or finance verification workflows.' },
  { question: 'What is ZentroSure Certification?', answer: 'Vehicles that pass all critical checks can earn the ZentroSure Certified mark — a trust signal for buyers, dealers and lenders.' },
  { question: 'How do I book an inspection?', answer: 'Create a customer account, choose a service and city, fill vehicle details, complete WhatsApp OTP verification, and confirm your booking.' },
  { question: 'Is the inspection at my location?', answer: 'Yes. Our engineers visit the address you provide — home, office or dealer yard — for the inspection slot you select.' },
  { question: 'Where is ZentroSure headquartered?', answer: 'ZentroSure is headquartered in Patna, India. We coordinate a pan-India inspector network — HQ location does not limit where we can book inspections.' },
  { question: 'Can I get a GST invoice for my booking?', answer: 'Yes. After payment is confirmed, a GST-compliant invoice is available in your customer portal and can be included in email receipts where configured.' },
  { question: 'What if the seller refuses access during inspection?', answer: 'Our inspector documents what they can access. We recommend agreeing inspection access with the seller before the slot. If critical areas cannot be opened, the report will note limitations clearly.' },
];

const BLOG_POSTS = [
  {
    slug: 'used-car-checklist-2026',
    title: 'The Ultimate 2026 Used Car Buying Checklist',
    excerpt: 'Everything to verify before you pay — from documents to hidden accident signs.',
    content: 'Buying a used car is a major decision. Start with RC, insurance and service history, then move to body lines, paint thickness, underbody rust, engine cold start, transmission shifts, and a full OBD scan. Always get an independent inspection and a written, QR-verifiable report before closing the deal.',
    published: true,
  },
  {
    slug: 'pdi-matters',
    title: 'Why PDI Matters Even on Brand-New Cars',
    excerpt: 'Transport and yard damage happens more often than buyers expect.',
    content: 'A pre-delivery inspection catches panel gaps, paint defects, accessory fitment and battery health before you accept delivery. It strengthens your hand with the dealer if something needs fixing under warranty.',
    published: true,
  },
  {
    slug: 'ev-inspection-guide',
    title: 'Inspecting an EV: Battery Health and Beyond',
    excerpt: 'What changes when there is no ICE to listen to — and what still matters.',
    content: 'Focus on battery state of health, charging curve, cooling circuits, high-voltage cabling integrity, tyre wear patterns from regen, and software versions. A structured EV inspection complements traditional suspension and brake checks.',
    published: true,
  },
  {
    slug: 'fleet-maintenance-preview',
    title: 'Fleet Inspection Programs (Draft)',
    excerpt: 'Coming soon: how fleets use ZentroSure for yard audits.',
    content: 'Draft content for fleet operators.',
    published: false,
  },
];

const TESTIMONIALS = [
  { name: 'Aarav Mehta', city: 'Mumbai', quote: 'ZentroSure caught hidden frame damage on the used SUV I almost bought. Saved me ₹3 lakh.', rating: 5, active: true },
  { name: 'Priya Sharma', city: 'Delhi', quote: 'Inspector arrived on time, full report on WhatsApp in 2 hours. Premium experience.', rating: 5, active: true },
  { name: 'Rahul Singh', city: 'Bangalore', quote: 'Used the QR verification — every claim in the report checked out. Bought with confidence.', rating: 5, active: true },
  { name: 'Nisha Patel', city: 'Ahmedabad', quote: 'We use ZentroSure for all our fleet PDIs. Best ops dashboard in the market.', rating: 5, active: true },
];

async function seed() {
  await connectDB();
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);

  for (const u of SEED_USERS) {
    const update = {
      $set: { name: u.name, email: u.email, phone: u.phone, role: u.role, passwordHash },
    };
    if (u.role !== 'inspector') {
      update.$unset = { inspectorProfileId: '' };
    }
    await User.findOneAndUpdate({ email: u.email }, update, { upsert: true, new: true });
  }

  const inspectorUser = await User.findOne({ email: 'inspector@zentrosure.com' });
  if (!inspectorUser) throw new Error('Inspector user missing after seed');
  const inspector = await Inspector.findOneAndUpdate(
    { userId: inspectorUser._id },
    {
      userId: inspectorUser._id,
      inspectorCode: 'INS-001',
      city: 'Patna',
      rating: 4.8,
      jobsCompleted: 0,
      status: 'Active',
      specialisations: ['Car', 'Truck', 'Bus'],
    },
    { upsert: true, new: true },
  );
  inspectorUser.inspectorProfileId = inspector._id;
  await inspectorUser.save();

  await Service.deleteMany({});
  await Service.insertMany(SERVICES);
  console.log(`Seeded ${SERVICES.length} services`);

  await Faq.deleteMany({});
  await Faq.insertMany(FAQS);
  console.log(`Seeded ${FAQS.length} FAQs`);

  await CityPage.deleteMany({});
  const cityDocs = CITY_NAMES.map((city) => ({
    city,
    slug: citySlug(city),
    content: `Independent vehicle inspection, valuation and certification in ${city}. Doorstep service, 200+ checkpoints, QR-verified digital reports trusted by buyers, dealers and lenders across ${city} and nearby areas.`,
    active: true,
  }));
  await CityPage.insertMany(cityDocs);
  console.log(`Seeded ${cityDocs.length} city pages`);

  await BlogPost.deleteMany({});
  for (const post of BLOG_POSTS) {
    await BlogPost.create(post);
  }
  console.log(`Seeded ${BLOG_POSTS.length} blog posts`);

  await Testimonial.deleteMany({});
  await Testimonial.insertMany(TESTIMONIALS);
  console.log(`Seeded ${TESTIMONIALS.length} testimonials`);

  const ENTERPRISE_SAMPLES = [
    {
      companyName: 'FleetWorks Logistics Pvt Ltd',
      contactName: 'Priya Menon',
      email: 'fleet.ops@fleetworks.example.com',
      phone: '919876543210',
      city: 'Mumbai',
      state: 'Maharashtra',
      segment: 'Fleet',
      status: 'Active',
      gstin: '27AAAAA0000A1Z5',
      pan: 'AAAAA0000A',
    },
    {
      companyName: 'Northern General Insurance Co.',
      contactName: 'Rahul Verma',
      email: 'vendor.inspections@ngic.example.com',
      phone: '919811223344',
      city: 'Delhi',
      state: 'Delhi',
      segment: 'Insurer',
      status: 'Active',
    },
    {
      companyName: 'Capital Wheels NBFC',
      contactName: 'Neha Sharma',
      email: 'credit.ops@capitalwheels.example.com',
      phone: '919922334455',
      city: 'Bangalore',
      state: 'Karnataka',
      segment: 'NBFC',
      status: 'Lead',
    },
  ];
  for (const row of ENTERPRISE_SAMPLES) {
    await EnterpriseCustomer.findOneAndUpdate({ companyName: row.companyName }, { $set: row }, { upsert: true, new: true });
  }
  console.log(`Upserted ${ENTERPRISE_SAMPLES.length} sample enterprise (B2B) accounts`);

  console.log('\n--- Seeded users (login: email + password; MongoDB also has _id as user id) ---');
  console.log(`Password for all: ${SEED_PASSWORD}\n`);
  for (const u of SEED_USERS) {
    const row = await User.findOne({ email: u.email }).select('_id email phone role name');
    console.log(`  ${u.role.padEnd(10)}  email=${row.email}  phone=${row.phone}  _id=${row._id}`);
  }
  console.log('\nSeed completed.');
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
