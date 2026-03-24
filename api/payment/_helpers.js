/**
 * 결제 API 공통 헬퍼 (getAppOrigin, getTossSecretKeyForOrder)
 *
 * 결제위젯 시크릿(live_gsk_…): Vercel `PAYKEY_BZCAT_WIDGET_SECRET`
 * 구 이름 `PAYKEY_BZCAT`은 fallback
 */

/** 결제위젯 연동 시크릿 전용 env (구 PAYKEY_BZCAT → 이 이름 권장) */
const WIDGET_SECRET_ENV = 'PAYKEY_BZCAT_WIDGET_SECRET';
const WIDGET_SECRET_ENV_LEGACY = 'PAYKEY_BZCAT';

function getAppOrigin(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  const proto = req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  return `${proto}://${host}`;
}

/** 매장 구분 없이 동일한 결제위젯 시크릿 사용 */
async function getTossSecretKeyForOrder() {
  return (
    process.env[WIDGET_SECRET_ENV] ||
    process.env[WIDGET_SECRET_ENV_LEGACY] ||
    ''
  ).trim();
}

module.exports = {
  getAppOrigin,
  getTossSecretKeyForOrder,
};
