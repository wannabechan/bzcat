/**
 * GET /api/admin/orders
 * 전체 주문 목록 조회 (admin 전용)
 */

const { verifyToken, apiResponse } = require('../_utils');
const { getAllOrders } = require('../_redis');

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
      return apiResponse(res, 401, { error: '유효하지 않은 토큰입니다.' });
    }

    const isAdmin = user.level === 'admin';
    if (!isAdmin) {
      return apiResponse(res, 403, { error: '관리자만 접근할 수 있습니다.' });
    }

    const orders = await getAllOrders();
    
    return apiResponse(res, 200, { orders });
  } catch (error) {
    console.error('Admin get orders error:', error);
    return apiResponse(res, 500, { error: '서버 오류가 발생했습니다.' });
  }
};
