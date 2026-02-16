/**
 * POST /api/orders/cancel
 * 주문 취소 (결제 완료 이전 단계만 가능)
 * 취소 시 주문서 PDF 재생성 (주문 취소건 표시)
 */

const { verifyToken, apiResponse } = require('../_utils');
const { getOrderById } = require('../_redis');
const { cancelOrderAndRegeneratePdf } = require('../_orderCancel');

const CANCELABLE_STATUSES = ['submitted', 'pending', 'order_accepted', 'payment_link_issued'];

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

    const { orderId } = req.body;
    const id = orderId != null ? (typeof orderId === 'number' ? orderId : String(orderId).trim()) : '';
    if (!id) {
      return apiResponse(res, 400, { error: '주문 번호가 올바르지 않습니다.' });
    }

    const order = await getOrderById(id);
    if (!order) {
      return apiResponse(res, 404, { error: '주문을 찾을 수 없습니다.' });
    }

    if (order.user_email !== user.email) {
      return apiResponse(res, 403, { error: '본인의 주문만 취소할 수 있습니다.' });
    }

    const status = order.status === 'pending' ? 'submitted' : (order.status || 'submitted');
    if (!CANCELABLE_STATUSES.includes(status)) {
      return apiResponse(res, 400, { error: '결제 완료 이후에는 주문을 취소할 수 없습니다.' });
    }

    if (status === 'cancelled') {
      return apiResponse(res, 400, { error: '이미 취소된 주문입니다.' });
    }

    await cancelOrderAndRegeneratePdf(id, '고객취소');

    return apiResponse(res, 200, {
      success: true,
      message: '주문이 취소되었습니다.',
    });
  } catch (error) {
    console.error('Cancel order error:', error);
    return apiResponse(res, 500, { error: '서버 오류가 발생했습니다.' });
  }
};
