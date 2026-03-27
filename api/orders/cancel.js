/**
 * POST /api/orders/cancel
 * 주문 취소
 * - 결제 완료 전: 항상 취소 가능 → 취소 사유 '고객취소'
 * - 결제 완료 후: 배송 희망일 4일 전 23:59(KST)까지만 취소 가능 → 취소 사유 '결제취소'
 *   이 경우 토스페이먼츠 결제 취소 API 호출 후 주문 취소 처리
 * 취소 시 주문서 PDF 재생성 (주문 취소건 표시)
 */

const { requireAuth, apiResponse } = require('../_utils');
const { getOrderById } = require('../_redis');
const { cancelOrderAndRegeneratePdf, isPastPaymentDeadline } = require('../_orderCancel');
const { getTossSecretKeyForOrder } = require('../payment/_helpers');

const CANCELABLE_BEFORE_PAYMENT = ['submitted', 'pending', 'order_accepted', 'payment_link_issued'];
const TOSS_CANCEL_API = 'https://api.tosspayments.com/v1/payments';

async function cancelPaymentWithSecret(secretKey, paymentKey) {
  const auth = Buffer.from(`${secretKey}:`, 'utf8').toString('base64');
  const cancelRes = await fetch(`${TOSS_CANCEL_API}/${encodeURIComponent(paymentKey.trim())}/cancel`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify({
      cancelReason: '고객 요청에 의한 결제 취소',
    }),
  });
  const bodyText = await cancelRes.text();
  let bodyJson = null;
  try {
    bodyJson = bodyText ? JSON.parse(bodyText) : null;
  } catch (_) {}
  return { ok: cancelRes.ok, status: cancelRes.status, bodyText, bodyJson };
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    return apiResponse(res, 200, {});
  }

  if (req.method !== 'POST') {
    return apiResponse(res, 405, { error: 'Method not allowed' });
  }

  try {
    const user = requireAuth(req, res);
    if (!user) return;

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const { orderId } = body;
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

    if (status === 'cancelled') {
      return apiResponse(res, 400, { error: '이미 취소된 주문입니다.' });
    }

    if (CANCELABLE_BEFORE_PAYMENT.includes(status)) {
      await cancelOrderAndRegeneratePdf(id, '고객취소');
      return apiResponse(res, 200, {
        success: true,
        message: '주문이 취소되었습니다.',
      });
    }

    if (status === 'payment_completed') {
      if (isPastPaymentDeadline(order)) {
        return apiResponse(res, 400, {
          error: '배송 희망일 4일 전 23:59 이후에는 결제 취소가 불가합니다.',
        });
      }
      const paymentKey = order.toss_payment_key || order.payment_key || '';
      if (!paymentKey.trim()) {
        const adminEmail = process.env.EMAIL_ADMIN || '고객센터';
        return apiResponse(res, 400, {
          error: `결제 정보를 찾을 수 없어 취소할 수 없습니다.\n${adminEmail} 로 문의해 주세요.`,
        });
      }
      const TOSS_SECRET_KEY = await getTossSecretKeyForOrder(order);
      if (!TOSS_SECRET_KEY) {
        return apiResponse(res, 503, { error: '결제 설정을 찾을 수 없습니다.' });
      }
      const cancelResult = await cancelPaymentWithSecret(TOSS_SECRET_KEY, paymentKey);
      const cancelData = cancelResult.bodyJson || {};
      if (!cancelResult.ok) {
        const errMsg = cancelData.message || cancelData.error?.message || cancelData.msg || '결제 취소에 실패했습니다.';
        console.error('Toss payment cancel failed:', cancelResult.status, cancelData);
        return apiResponse(res, cancelResult.status >= 500 ? 502 : 400, {
          error: typeof errMsg === 'string' ? errMsg : '결제 취소에 실패했습니다.',
        });
      }
      await cancelOrderAndRegeneratePdf(id, '결제취소');
      return apiResponse(res, 200, {
        success: true,
        message: '주문이 취소되었습니다.',
      });
    }

    return apiResponse(res, 400, {
      error: '배송 준비 중이거나 완료된 주문은 취소할 수 없습니다.',
    });
  } catch (error) {
    console.error('Cancel order error:', error);
    return apiResponse(res, 500, { error: '서버 오류가 발생했습니다.' });
  }
};
