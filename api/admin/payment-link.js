/**
 * POST /api/admin/payment-link
 * 주문의 결제 링크 설정 (admin 전용)
 */

const { verifyToken, apiResponse } = require('../_utils');
const { getOrderById, updateOrderPaymentLink } = require('../_redis');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    return apiResponse(res, 200, {});
  }

  if (req.method !== 'POST') {
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

    const email = (user.email || '').toLowerCase();
    const isAdmin = user.level === 'admin' || email === 'bzcatmanager@gmail.com';
    if (!isAdmin) {
      return apiResponse(res, 403, { error: '관리자만 접근할 수 있습니다.' });
    }

    const { orderId, paymentLink } = req.body;
    if (!orderId) {
      return apiResponse(res, 400, { error: '주문 번호가 필요합니다.' });
    }

    const order = await getOrderById(orderId);
    if (!order) {
      return apiResponse(res, 404, { error: '주문을 찾을 수 없습니다.' });
    }

    await updateOrderPaymentLink(orderId, paymentLink || '');

    // 결제 링크가 입력되면 상태를 payment_link_issued로 변경
    if (paymentLink && paymentLink.trim()) {
      const { updateOrderStatus } = require('../_redis');
      if (order.status === 'submitted') {
        await updateOrderStatus(orderId, 'payment_link_issued');
      }
    }

    return apiResponse(res, 200, { success: true });
  } catch (error) {
    console.error('Admin set payment link error:', error);
    return apiResponse(res, 500, { error: '서버 오류가 발생했습니다.' });
  }
};
