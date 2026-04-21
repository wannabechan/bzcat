/**
 * 주문 PII 180일 익명화 배치용: 기준일·적용 여부·필드 마스킹
 * - 취소: status_history 에서 cancelled 전환 시각 → 그날(KST) 익일 0시를 앵커 날짜로 간주한 뒤 +180일
 * - 그 외: 배송 희망일 → 익일 0시(KST) 앵커 날짜 +180일 (delivery_completed 여부 무관)
 */

const { getKSTDateString, parseKSTDate } = require('./_kst');
const { maskEmail, maskName, maskPhone, maskAddress } = require('./_pii-mask');

const PI_ANONYMIZE_RETENTION_DAYS = 180;

/** delivery_date 를 YYYY-MM-DD 로 */
function normalizeDeliveryYmd(raw) {
  if (raw == null) return '';
  const s = String(raw).trim().replace(/\D/g, '');
  if (s.length === 8) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  const m = String(raw).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return '';
}

/** YYYY-MM-DD KST 자정 기준으로 n일 후의 KST 날짜 (YYYY-MM-DD) */
function addKstCalendarDays(ymdStr, deltaDays) {
  const d = parseKSTDate(ymdStr);
  if (!d) return null;
  const t = d.getTime() + Number(deltaDays) * 86400000;
  return getKSTDateString(t);
}

function findCancelledAtMs(order) {
  const hist = order.status_history;
  if (Array.isArray(hist)) {
    for (let i = hist.length - 1; i >= 0; i -= 1) {
      const h = hist[i];
      if (h && h.s === 'cancelled' && h.at) {
        const t = new Date(h.at).getTime();
        if (!Number.isNaN(t)) return t;
      }
    }
  }
  if (order.status === 'cancelled' && order.created_at) {
    const t = new Date(order.created_at).getTime();
    if (!Number.isNaN(t)) return t;
  }
  return null;
}

/**
 * 앵커 KST 날짜 YYYY-MM-DD (전환/배송일의 익일 0시가 속한 '날짜'로 사용)
 */
function getPiiAnchorYmd(order) {
  if (order.status === 'cancelled') {
    const ms = findCancelledAtMs(order);
    if (ms == null) return null;
    const cancelKstYmd = getKSTDateString(ms);
    return addKstCalendarDays(cancelKstYmd, 1);
  }
  const delYmd = normalizeDeliveryYmd(order.delivery_date);
  if (!delYmd) return null;
  return addKstCalendarDays(delYmd, 1);
}

/** 앵커 + 180일 KST 날짜 (처리 가능한 첫 날) */
function getPiiDueYmd(anchorYmd) {
  if (!anchorYmd) return null;
  return addKstCalendarDays(anchorYmd, PI_ANONYMIZE_RETENTION_DAYS);
}

/** todayYmd(KST) 기준으로 익명화 대상 여부 */
function isOrderDueForPiiAnonymization(order, todayYmd) {
  if (order.pii_anonymized_at) return false;
  const anchor = getPiiAnchorYmd(order);
  if (!anchor) return false;
  const due = getPiiDueYmd(anchor);
  if (!due) return false;
  return due <= todayYmd;
}

function isPlausibleLiveOrder(o) {
  return Boolean(
    o
    && o.id
    && typeof o.id === 'string'
    && /^[0-9]+$/.test(o.id)
    && Array.isArray(o.order_items),
  );
}

/** Redis 주문 JSON에 덮어쓸 PII 필드 (일별 CSV와 동일 + detail_address 공란) */
function buildPiiMaskedOrderPatch(order) {
  return {
    user_email: maskEmail(order.user_email),
    depositor: maskName(order.depositor),
    contact: maskPhone(order.contact),
    delivery_address: maskAddress(order.delivery_address, order.detail_address),
    detail_address: '',
  };
}

module.exports = {
  PI_ANONYMIZE_RETENTION_DAYS,
  normalizeDeliveryYmd,
  addKstCalendarDays,
  getPiiAnchorYmd,
  getPiiDueYmd,
  isOrderDueForPiiAnonymization,
  isPlausibleLiveOrder,
  buildPiiMaskedOrderPatch,
};
