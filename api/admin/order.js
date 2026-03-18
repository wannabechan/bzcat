/**
 * GET /api/admin/order?orderId=xxx
 * 단일 주문 전체 조회 (admin/operator - 주문 상세 팝업용, getOrderById로 항상 완전한 order_items 포함)
 */

const { verifyToken, apiResponse, isAdminOrOperator, withResolvedLevel } = require('../_utils');
const { getOrderById } = require('../_redis');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return apiResponse(res, 200, {});

  if (req.method !== 'GET') {
    return apiResponse(res, 405, { error: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return apiResponse(res, 401, { error: '로그인이 필요합니다.' });
    }

    const user = withResolvedLevel(verifyToken(authHeader.substring(7)));
    if (!user) return apiResponse(res, 401, { error: '로그인이 필요합니다.' });
    if (!isAdminOrOperator(user)) return apiResponse(res, 403, { error: '관리자만 접근할 수 있습니다.' });

    const orderId = (req.query.orderId || '').toString().trim();
    if (!orderId) return apiResponse(res, 400, { error: 'orderId가 필요합니다.' });

    const order = await getOrderById(orderId);
    if (!order) return apiResponse(res, 404, { error: '주문을 찾을 수 없습니다.' });

    return apiResponse(res, 200, { order });
  } catch (error) {
    console.error('Admin get order error:', error);
    return apiResponse(res, 500, { error: '서버 오류가 발생했습니다.' });
  }
};
