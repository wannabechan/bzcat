/**
 * GET /api/manager/orders
 * 매장 담당자 이메일로 등록된 매장의 주문만 조회 (담당자 전용)
 */

const { verifyToken, apiResponse } = require('../_utils');
const { getAllOrders, getStores } = require('../_redis');
const { getStoreEmailForOrder } = require('../orders/_order-email');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    return apiResponse(res, 200, {});
  }

  if (req.method !== 'GET') {
    return apiResponse(res, 405, { error: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return apiResponse(res, 401, { error: '로그인이 필요합니다.' });
    }

    const token = authHeader.substring(7);
    const user = verifyToken(token);
    if (!user) {
      return apiResponse(res, 401, { error: '로그인이 필요합니다.' });
    }

    const stores = await getStores();
    const managerEmail = (user.email || '').trim().toLowerCase();
    if (!managerEmail) {
      return apiResponse(res, 403, { error: '담당자로 등록된 매장이 없습니다.' });
    }

    const startDate = (req.query.startDate || '').toString().trim();
    const endDate = (req.query.endDate || '').toString().trim();
    const limit = Math.min(Math.max(1, parseInt(req.query.limit, 10) || 25), 5000);
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);

    let allOrders = await getAllOrders();
    let filtered = (allOrders || []).filter((order) => {
      const storeEmail = getStoreEmailForOrder(order, stores);
      return storeEmail && storeEmail.trim().toLowerCase() === managerEmail;
    });

    if (startDate && endDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate) && /^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      const startMs = new Date(startDate + 'T00:00:00+09:00').getTime();
      const endMs = new Date(endDate + 'T23:59:59.999+09:00').getTime();
      filtered = filtered.filter((o) => {
        const t = new Date(o.created_at || 0).getTime();
        return t >= startMs && t <= endMs;
      });
    }

    const sorted = filtered.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const total = sorted.length;
    const usePeriod = startDate && endDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate) && /^\d{4}-\d{2}-\d{2}$/.test(endDate);
    const orders = usePeriod ? sorted : sorted.slice(offset, offset + limit);

    return apiResponse(res, 200, { orders, total, stores: stores || [] });
  } catch (error) {
    console.error('Manager orders error:', error);
    return apiResponse(res, 500, { error: '서버 오류가 발생했습니다.' });
  }
};
