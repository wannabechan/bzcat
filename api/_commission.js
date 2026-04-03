/**
 * 정산 수수료율 (환경변수 BZCAT_COMMISSION: 퍼센트 값, 예: 10 → 10%, 7.7 → 7.7%)
 */

function getCommissionPercent() {
  const raw = Number(process.env.BZCAT_COMMISSION);
  if (Number.isFinite(raw) && raw >= 0 && raw <= 100) return raw;
  return 18;
}

function commissionFeeFromSales(sales) {
  const s = Number(sales);
  if (!Number.isFinite(s) || s < 0) return 0;
  return Math.round(s * (getCommissionPercent() / 100));
}

module.exports = {
  getCommissionPercent,
  commissionFeeFromSales,
};
