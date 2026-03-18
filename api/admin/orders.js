/**
 * GET /api/admin/orders
 * 전체 주문 목록 조회 (admin 전용)
 */

const { verifyToken, apiResponse } = require('../_utils');
const { getAllOrders } = require('../_redis');
const { getAdminSampleOrders } = require('./_sample-orders');

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

    const isAdmin = user.level === 'admin';
    if (!isAdmin) {
      return apiResponse(res, 403, { error: '관리자만 접근할 수 있습니다.' });
    }

    const startDate = (req.query.startDate || '').toString().trim();
    const endDate = (req.query.endDate || '').toString().trim();
    const limit = Math.min(Math.max(1, parseInt(req.query.limit, 10) || 25), 5000);
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);

    let allOrders = await getAllOrders() || [];
    if (process.env.ADMIN_USE_SAMPLE_ORDERS === 'true') {
      const sample = await getAdminSampleOrders();
      allOrders = [...sample, ...allOrders];
    }

    if (startDate && endDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate) && /^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      const startMs = new Date(startDate + 'T00:00:00+09:00').getTime();
      const endMs = new Date(endDate + 'T23:59:59.999+09:00').getTime();
      allOrders = allOrders.filter((o) => {
        const t = new Date(o.created_at || 0).getTime();
        return t >= startMs && t <= endMs;
      });
    }

    const sorted = allOrders.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const total = sorted.length;
    const usePeriod = startDate && endDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate) && /^\d{4}-\d{2}-\d{2}$/.test(endDate);
    const orders = usePeriod ? sorted : sorted.slice(offset, offset + limit);

    return apiResponse(res, 200, { orders, total });
  } catch (error) {
    console.error('Admin get orders error:', error);
    return apiResponse(res, 500, { error: '서버 오류가 발생했습니다.' });
  }
};
