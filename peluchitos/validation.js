function integer(value, min = 1) {
  if (!['number', 'string'].includes(typeof value) || !/^\d+$/.test(String(value))) return NaN;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= min && n <= 2147483647 ? n : NaN;
}
function price(value) {
  if (!['number', 'string'].includes(typeof value) || !/^\d+(\.\d{1,2})?$/.test(String(value))) return NaN;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && n <= 99999999.99 ? n : NaN;
}
module.exports = { integer, price };
