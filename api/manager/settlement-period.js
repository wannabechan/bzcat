/**
 * GET /api/manager/settlement-period?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 * 기간 내 배송완료된 주문을 브랜드별로 집계 (매장 담당자 전용 - 담당 매장만)
 */

const { verifyToken, apiResponse } = require('../_utils');
const { getAllOrders, getStores } = require('../_redis');
const { getStoreForOrder, getStoreEmailForOrder } = require('../orders/_order-email');

function normalizeDeliveryDate(str) {
  if (!str || typeof str !== 'string') return '';
  const s = String(str).trim().replace(/\D/g, '');
  if (s.length === 8) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  if (s.length >= 10) return String(str).slice(0, 10);
  return '';
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return apiResponse(res, 200, {});
  if (req.method !== 'GET') return apiResponse(res, 405, { error: 'Method not allowed' });

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return apiResponse(res, 401, { error: '로그인이 필요합니다.' });
    }
    const token = authHeader.substring(7);
    const user = verifyToken(token);
    if (!user) return apiResponse(res, 401, { error: '로그인이 필요합니다.' });

    const managerEmail = (user.email || '').trim().toLowerCase();
    if (!managerEmail) {
      return apiResponse(res, 403, { error: '담당자로 등록된 매장이 없습니다.' });
    }

    const startStr = (req.query.startDate || '').trim();
    const endStr = (req.query.endDate || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startStr) || !/^\d{4}-\d{2}-\d{2}$/.test(endStr)) {
      return apiResponse(res, 400, { error: 'startDate, endDate (YYYY-MM-DD)가 필요합니다.' });
    }
    if (startStr > endStr) {
      return apiResponse(res, 400, { error: 'startDate는 endDate 이전이어야 합니다.' });
    }

    const orders = await getAllOrders() || [];
    const stores = await getStores() || [];

    // 정산 집행: 기간 내 배송완료(delivery_completed) 처리된 주문, 담당 매장만
    const executedOrders = orders.filter((o) => {
      if ((o.status || '') !== 'delivery_completed') return false;
      const d = normalizeDeliveryDate(o.delivery_date);
      if (d < startStr || d > endStr) return false;
      const storeEmail = getStoreEmailForOrder(o, stores);
      return storeEmail && storeEmail.trim().toLowerCase() === managerEmail;
    });

    const executedBySlug = {};
    executedOrders.forEach((o) => {
      const store = getStoreForOrder(o, stores);
      const slug = (store?.slug || store?.id || 'unknown').toString().toLowerCase();
      if (!executedBySlug[slug]) {
        executedBySlug[slug] = {
          slug,
          brandTitle: (store?.brand || store?.title || store?.id || slug).toString().trim() || slug,
          orderCount: 0,
          totalAmount: 0,
        };
      }
      executedBySlug[slug].orderCount += 1;
      executedBySlug[slug].totalAmount += Number(o.total_amount) || 0;
    });
    const executed = Object.values(executedBySlug).sort((a, b) =>
      (a.brandTitle || '').localeCompare(b.brandTitle || '', 'ko')
    );

    // 정산 미집행: 기간 내 배송희망일이지만 아직 배송 완료 미처리 주문, 담당 매장만 (취소 제외)
    const notExecutedOrders = orders.filter((o) => {
      if ((o.status || '') === 'cancelled') return false;
      if ((o.status || '') === 'delivery_completed') return false;
      const d = normalizeDeliveryDate(o.delivery_date);
      if (d < startStr || d > endStr) return false;
      const storeEmail = getStoreEmailForOrder(o, stores);
      return storeEmail && storeEmail.trim().toLowerCase() === managerEmail;
    });

    const notExecutedBySlug = {};
    notExecutedOrders.forEach((o) => {
      const store = getStoreForOrder(o, stores);
      const slug = (store?.slug || store?.id || 'unknown').toString().toLowerCase();
      if (!notExecutedBySlug[slug]) {
        notExecutedBySlug[slug] = {
          slug,
          brandTitle: (store?.brand || store?.title || store?.id || slug).toString().trim() || slug,
          orderCount: 0,
          totalAmount: 0,
        };
      }
      notExecutedBySlug[slug].orderCount += 1;
      notExecutedBySlug[slug].totalAmount += Number(o.total_amount) || 0;
    });
    const notExecuted = Object.values(notExecutedBySlug).sort((a, b) =>
      (a.brandTitle || '').localeCompare(b.brandTitle || '', 'ko')
    );

    return apiResponse(res, 200, {
      startDate: startStr,
      endDate: endStr,
      executed,
      notExecuted,
    });
  } catch (error) {
    console.error('Manager settlement-period error:', error);
    return apiResponse(res, 500, { error: '서버 오류가 발생했습니다.' });
  }
};
