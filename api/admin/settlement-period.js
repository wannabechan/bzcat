/**
 * GET /api/admin/settlement-period?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 * 기간별 브랜드 집계 (admin 전용)
 * - executed: 배송완료 주문
 * - notExecuted: 기간 내 배송희망이나 아직 배송완료 아님(취소 제외)
 */

const { verifyToken, apiResponse, isAdminOrOperator, withResolvedLevel, getTokenFromRequest } = require('../_utils');
const { commissionFeeFromSales } = require('../_commission');
const { getAllOrders, getStores } = require('../_redis');
const { getStoreForOrder } = require('../orders/_order-email');
const { getAdminSampleOrders } = require('./_sample-orders');

function normalizeDeliveryDate(str) {
  if (!str || typeof str !== 'string') return '';
  const s = String(str).trim().replace(/\D/g, '');
  if (s.length === 8) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  if (s.length >= 10) return String(str).slice(0, 10);
  return '';
}

function menuQuantitySumFromOrder(o) {
  const items = o.order_items || o.orderItems || [];
  let sum = 0;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (String(it.id || '') === 'etc-fee') continue;
    const q = Number(it.quantity);
    if (Number.isFinite(q) && q >= 1) sum += Math.floor(q);
  }
  return sum;
}

function getStoreBySlug(stores, slug) {
  const s = (slug || '').toString().toLowerCase();
  return (stores || []).find((x) => (x.slug || x.id || '').toString().toLowerCase() === s);
}

function enrichBrandRow(row, stores) {
  const slug = (row.slug || '').toString().toLowerCase();
  const store = getStoreBySlug(stores, slug);
  const packagingFeePerOrder = Number.isFinite(Number(store?.packagingFee)) && Number(store.packagingFee) >= 0
    ? Math.floor(Number(store.packagingFee))
    : 0;
  const deliveryFeePerOrder = Number.isFinite(Number(store?.deliveryFee)) && Number(store.deliveryFee) >= 0
    ? Math.floor(Number(store.deliveryFee))
    : 50000;
  const menuQtySum = Number(row.menuQtySum) || 0;
  const orderCount = Number(row.orderCount) || 0;
  const totalAmount = Number(row.totalAmount) || 0;
  const packaging = menuQtySum * packagingFeePerOrder;
  const deliveryFee = orderCount * deliveryFeePerOrder;
  const fee = commissionFeeFromSales(totalAmount);
  const settlement = totalAmount - fee - packaging - deliveryFee;
  return {
    ...row,
    packaging,
    deliveryFee,
    fee,
    settlement,
  };
}

function aggregateOrdersBySlug(orders, stores) {
  const bySlug = {};
  orders.forEach((o) => {
    const store = getStoreForOrder(o, stores);
    const slug = (store?.slug || store?.id || 'unknown').toString().toLowerCase();
    if (!bySlug[slug]) {
      bySlug[slug] = {
        slug,
        brandTitle: (store?.brand || store?.title || store?.id || slug).toString().trim() || slug,
        orderCount: 0,
        totalAmount: 0,
        menuQtySum: 0,
      };
    }
    bySlug[slug].orderCount += 1;
    bySlug[slug].totalAmount += Number(o.total_amount) || 0;
    bySlug[slug].menuQtySum += menuQuantitySumFromOrder(o);
  });
  return Object.values(bySlug)
    .map((row) => enrichBrandRow(row, stores))
    .sort((a, b) => (a.brandTitle || '').localeCompare(b.brandTitle || '', 'ko'));
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return apiResponse(res, 200, {});
  if (req.method !== 'GET') return apiResponse(res, 405, { error: 'Method not allowed' });

  try {
    const sessionToken = getTokenFromRequest(req);
    if (!sessionToken) {
      return apiResponse(res, 401, { error: '로그인이 필요합니다.' });
    }
    const user = withResolvedLevel(verifyToken(sessionToken));
    if (!user) return apiResponse(res, 401, { error: '로그인이 필요합니다.' });
    if (!isAdminOrOperator(user)) return apiResponse(res, 403, { error: '관리자만 접근할 수 있습니다.' });

    const startStr = (req.query.startDate || '').trim();
    const endStr = (req.query.endDate || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startStr) || !/^\d{4}-\d{2}-\d{2}$/.test(endStr)) {
      return apiResponse(res, 400, { error: 'startDate, endDate (YYYY-MM-DD)가 필요합니다.' });
    }
    if (startStr > endStr) {
      return apiResponse(res, 400, { error: 'startDate는 endDate 이전이어야 합니다.' });
    }

    let orders = await getAllOrders() || [];
    if (process.env.ADMIN_USE_SAMPLE_ORDERS === 'true') {
      const sample = await getAdminSampleOrders();
      orders = [...sample, ...orders];
    }
    const stores = await getStores() || [];

    const executedOrders = orders.filter((o) => {
      if ((o.status || '') !== 'delivery_completed') return false;
      const d = normalizeDeliveryDate(o.delivery_date);
      return d >= startStr && d <= endStr;
    });

    const notExecutedOrders = orders.filter((o) => {
      if ((o.status || '') === 'cancelled') return false;
      if ((o.status || '') === 'delivery_completed') return false;
      const d = normalizeDeliveryDate(o.delivery_date);
      return d >= startStr && d <= endStr;
    });

    const executed = aggregateOrdersBySlug(executedOrders, stores);
    const notExecuted = aggregateOrdersBySlug(notExecutedOrders, stores);

    return apiResponse(res, 200, {
      startDate: startStr,
      endDate: endStr,
      executed,
      notExecuted,
      /** 하위 호환: 예전 클라이언트 */
      byBrand: executed,
    });
  } catch (error) {
    console.error('Admin settlement-period error:', error);
    return apiResponse(res, 500, { error: '서버 오류가 발생했습니다.' });
  }
};
