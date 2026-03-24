/**
 * GET /api/payment/widget-order?orderId=
 * 결제위젯용 주문 정보 (로그인·권한·상태 검증 후 금액·표시용 필드만 반환)
 */

const { requireAuth, apiResponse } = require('../_utils');
const { getOrderById } = require('../_redis');
const { getTossSecretKeyForOrder } = require('./_helpers');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return require('../_utils').apiResponse(res, 200, {});

  if (req.method !== 'GET') {
    return apiResponse(res, 405, { error: 'Method not allowed' });
  }

  try {
    const user = requireAuth(req, res);
    if (!user) return;

    const rawId = req.query.orderId;
    const orderId = typeof rawId === 'string' ? rawId.trim() : '';
    if (!orderId) {
      return apiResponse(res, 400, { error: '주문 번호가 필요합니다.' });
    }

    const order = await getOrderById(orderId);
    if (!order) return apiResponse(res, 404, { error: '주문을 찾을 수 없습니다.' });
    if (order.user_email !== user.email) {
      return apiResponse(res, 403, { error: '해당 주문에 대한 권한이 없습니다.' });
    }

    const status = order.status || 'submitted';
    if (status !== 'payment_link_issued') {
      return apiResponse(res, 400, {
        error: '매장 승인 및 결제 링크 발급 후에만 결제할 수 있습니다.',
      });
    }

    const amount = Number(order.total_amount);
    if (!Number.isInteger(amount) || amount < 100) {
      return apiResponse(res, 400, { error: '유효한 결제 금액이 아닙니다.' });
    }

    const secret = await getTossSecretKeyForOrder(order);
    if (!secret) {
      return apiResponse(res, 503, { error: '결제 설정이 되어 있지 않습니다.' });
    }

    const orderName = `BzCat 주문 #${orderId}`;
    const customerEmail = (order.user_email || user.email || '').trim() || undefined;
    const customerName = (order.depositor || '').trim() || undefined;
    const digits = String(order.contact || '').replace(/\D/g, '');
    const customerMobilePhone =
      digits.length >= 8 ? digits.slice(0, 15) : undefined;

    return apiResponse(res, 200, {
      orderId: String(orderId),
      amount,
      orderName,
      customerEmail,
      customerName,
      customerMobilePhone,
    });
  } catch (err) {
    console.error('widget-order error:', err);
    return apiResponse(res, 500, { error: '서버 오류가 발생했습니다.' });
  }
};
