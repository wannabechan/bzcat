/**
 * POST /api/payment/create
 * 결제위젯(결제창형) UI용 사전 검증 — 브라우저에서 TossPayments SDK로 결제 요청
 * - 서버: 주문·권한·금액 검증 후 클라이언트 키·리다이렉트 URL 반환
 * - 시크릿 키(live_gsk_…)는 승인 API(/api/payment/success)만 사용
 *
 * 결제 가능: payment_link_issued 만 (매장 승인 후 어드민이 결제 링크/코드 반영된 뒤)
 */

const { verifyToken, apiResponse } = require('../_utils');
const { getOrderById } = require('../_redis');
const { getAppOrigin, getTossSecretKeyForOrder, getTossWidgetClientKeyForOrder } = require('./_helpers');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return require('../_utils').apiResponse(res, 200, {});

  if (req.method !== 'POST') {
    return apiResponse(res, 405, { error: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return apiResponse(res, 401, { error: '로그인이 필요합니다.' });
    }

    const user = verifyToken(authHeader.substring(7));
    if (!user) return apiResponse(res, 401, { error: '로그인이 필요합니다.' });

    const { orderId } = req.body && typeof req.body === 'object' ? req.body : {};
    if (!orderId || typeof orderId !== 'string') {
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

    const TOSS_SECRET_KEY = await getTossSecretKeyForOrder(order);
    if (!TOSS_SECRET_KEY) {
      return apiResponse(res, 503, { error: '결제 설정이 되어 있지 않습니다. (시크릿 키)' });
    }

    const tossWidgetClientKey = await getTossWidgetClientKeyForOrder(order);
    if (!tossWidgetClientKey) {
      return apiResponse(res, 503, {
        error: '결제위젯 클라이언트 키가 설정되지 않았습니다. (TOSS_WIDGET_CLIENT_KEY 또는 WIDGETKEY_*)',
      });
    }

    const origin = getAppOrigin(req);
    const orderIdStr = String(orderId);
    const successUrl = `${origin}/api/payment/success?orderId=${encodeURIComponent(orderIdStr)}`;
    const failUrl = `${origin}/api/payment/fail?orderId=${encodeURIComponent(orderIdStr)}`;

    const orderName = `BzCat 주문 #${orderIdStr}`;
    const paymentMethodsVariantKey = (process.env.TOSS_WIDGET_PAYMENT_METHODS_VARIANT || 'DEFAULT').trim() || 'DEFAULT';
    const agreementVariantKey = (process.env.TOSS_WIDGET_AGREEMENT_VARIANT || 'AGREEMENT').trim() || 'AGREEMENT';

    const phoneDigits = (order.contact || '').replace(/\D/g, '');
    const customerMobilePhone =
      phoneDigits.length >= 8 && phoneDigits.length <= 15 ? phoneDigits : undefined;

    return apiResponse(res, 200, {
      tossWidgetClientKey,
      amount,
      orderId: orderIdStr,
      orderName,
      successUrl,
      failUrl,
      paymentMethodsVariantKey,
      agreementVariantKey,
      customerEmail: (order.user_email || '').trim() || undefined,
      customerName: (order.depositor || '').trim() || undefined,
      ...(customerMobilePhone ? { customerMobilePhone } : {}),
    });
  } catch (err) {
    console.error('Payment create error:', err);
    return apiResponse(res, 500, { error: '서버 오류가 발생했습니다.' });
  }
};
