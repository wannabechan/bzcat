/**
 * GET /api/orders/my
 * 현재 로그인 사용자의 주문 목록 조회
 */

const { verifyToken, apiResponse, getTokenFromRequest } = require('../_utils');
const { getOrdersByUser } = require('../_redis');

const STATUS_LABELS = {
  submitted: '신청완료',
  order_accepted: '결제준비중',
  payment_link_issued: '결제하기',
  payment_completed: '결제완료',
  shipping: '배송진행',
  delivery_completed: '배송완료',
  cancelled: '주문취소',
};

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    return apiResponse(res, 200, {});
  }

  if (req.method !== 'GET') {
    return apiResponse(res, 405, { error: 'Method not allowed' });
  }

  try {
    const sessionToken = getTokenFromRequest(req);
    if (!sessionToken) {
      return apiResponse(res, 401, { error: '로그인이 필요합니다.' });
    }

    const user = verifyToken(sessionToken);

    if (!user) {
      return apiResponse(res, 401, { error: '로그인이 필요합니다.' });
    }

    const orders = await getOrdersByUser(user.email);

    const items = orders.map((o) => {
      const status = o.status === 'pending' ? 'submitted' : (o.status || 'submitted');
      const baseLabel = STATUS_LABELS[status] || STATUS_LABELS.submitted;
      const statusLabel = status === 'cancelled' && o.cancel_reason
        ? `${baseLabel}(${o.cancel_reason})`
        : baseLabel;
      return {
        id: o.id,
        status,
        statusLabel,
        createdAt: o.created_at,
        deliveryDate: o.delivery_date,
        deliveryTime: o.delivery_time,
        deliveryAddress: o.delivery_address || null,
        detailAddress: o.detail_address || null,
        totalAmount: o.total_amount,
        orderItems: o.order_items || [],
        pdfUrl: o.pdf_url || null,
        paymentLink: o.payment_link || null,
        piiAnonymizedAt: o.pii_anonymized_at || null,
      };
    });

    return apiResponse(res, 200, { orders: items });
  } catch (error) {
    console.error('Get my orders error:', error);
    return apiResponse(res, 500, { error: '서버 오류가 발생했습니다.' });
  }
};
