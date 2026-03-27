/**
 * 결제 API 공통 헬퍼 (getAppOrigin, getTossSecretKeyForOrder)
 *
 * API 개별 연동 키 시크릿(live_sk_... / test_sk_...):
 * - PAYKEY_BZCAT_API_SECRET 만 사용
 */

function getAppOrigin(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  const proto = req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  return `${proto}://${host}`;
}

/** 매장 구분 없이 동일한 API 시크릿 사용 */
async function getTossSecretKeyForOrder() {
  return (process.env.PAYKEY_BZCAT_API_SECRET || '').trim();
}

module.exports = {
  getAppOrigin,
  getTossSecretKeyForOrder,
};
