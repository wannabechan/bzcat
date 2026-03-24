/**
 * 결제 API 공통 헬퍼 (getAppOrigin, getStoreSlugFromOrder, getTossSecretKeyForOrder)
 */

const { getStores } = require('../_redis');

function getAppOrigin(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  const proto = req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  return `${proto}://${host}`;
}

/** itemId 형식: {slug}-{menuId}. slug에 하이픈 포함 가능(예: store-mma43xv8-1 → store-mma43xv8) */
function getStoreSlugFromOrder(order) {
  const items = order.order_items;
  if (!Array.isArray(items) || items.length === 0) return null;
  const firstId = items[0]?.id;
  if (!firstId || typeof firstId !== 'string') return null;
  const parts = firstId.split('-');
  const slug = parts.length > 1 ? parts.slice(0, -1).join('-') : (parts[0] || '');
  return slug || null;
}

const FIXED_TOSS_ENV_NAMES = ['TOSS_SECRET_KEY', 'TOSS_SECRET_KEY_TEST'];
/** 결제키 환경변수 명칭 규칙: PAYKEY_ 로 시작 + 영문/숫자/밑줄 */
const PAYKEY_PATTERN = /^PAYKEY_[A-Za-z0-9_]+$/;

function isAllowedTossEnvName(name) {
  if (!name || typeof name !== 'string') return false;
  const trimmed = name.trim();
  return FIXED_TOSS_ENV_NAMES.includes(trimmed) || PAYKEY_PATTERN.test(trimmed);
}

async function getTossSecretKeyForOrder(order) {
  const stores = await getStores();
  const slug = getStoreSlugFromOrder(order);
  const store = slug
    ? stores.find((s) => (s.id === slug || s.slug === slug))
    : null;
  let envVarName = (store?.payment?.apiKeyEnvVar || stores[0]?.payment?.apiKeyEnvVar || '').trim() || 'TOSS_SECRET_KEY';
  if (!isAllowedTossEnvName(envVarName)) envVarName = 'TOSS_SECRET_KEY';
  return process.env[envVarName] || '';
}

/** 결제위젯(브라우저 SDK)용 클라이언트 키 — live_gck_… (개발자센터 API 키) */
const FIXED_WIDGET_CLIENT_ENV_NAMES = ['TOSS_WIDGET_CLIENT_KEY', 'TOSS_WIDGET_CLIENT_KEY_TEST'];
/** 결제위젯 클라이언트 키 전용 env 이름: WIDGETKEY_ + 영문/숫자/밑줄 */
const WIDGETKEY_PATTERN = /^WIDGETKEY_[A-Za-z0-9_]+$/;

function isAllowedWidgetClientEnvName(name) {
  if (!name || typeof name !== 'string') return false;
  const trimmed = name.trim();
  return FIXED_WIDGET_CLIENT_ENV_NAMES.includes(trimmed) || WIDGETKEY_PATTERN.test(trimmed);
}

async function getTossWidgetClientKeyForOrder(order) {
  const stores = await getStores();
  const slug = getStoreSlugFromOrder(order);
  const store = slug
    ? stores.find((s) => (s.id === slug || s.slug === slug))
    : null;
  let envVarName = (store?.payment?.widgetClientKeyEnvVar || stores[0]?.payment?.widgetClientKeyEnvVar || '').trim() || 'TOSS_WIDGET_CLIENT_KEY';
  if (!isAllowedWidgetClientEnvName(envVarName)) envVarName = 'TOSS_WIDGET_CLIENT_KEY';
  return process.env[envVarName] || '';
}

module.exports = {
  getAppOrigin,
  getTossSecretKeyForOrder,
  getTossWidgetClientKeyForOrder,
};
