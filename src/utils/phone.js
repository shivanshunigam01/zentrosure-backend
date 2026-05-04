function normalizeIndianPhone(input = '') {
  const digits = String(input).replace(/\D/g, '');
  const last10 = digits.slice(-10);
  if (!/^[6-9]\d{9}$/.test(last10)) return null;
  return `91${last10}`;
}
module.exports = { normalizeIndianPhone };
