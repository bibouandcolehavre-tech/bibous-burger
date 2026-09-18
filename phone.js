const normalizeFrenchMobile = (value) => {
  const digits = String(value || "").replace(/\D/g, "");
  if (/^0[67]\d{8}$/.test(digits)) return digits;
  if (/^33[67]\d{8}$/.test(digits)) return `+${digits}`;
  if (/^0033[67]\d{8}$/.test(digits)) return `+${digits.slice(2)}`;
  return null;
};

module.exports = { normalizeFrenchMobile };
