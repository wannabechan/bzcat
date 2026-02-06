/**
 * GET /api/payment/fail
 * Toss 결제 실패/취소 리다이렉트 → 기한 경과 시 자동 취소 후 앱으로
 */

const { getOrderById } = require('../_redis');
const { isPastPaymentDeadline, cancelOrderAndRegeneratePdf } = require('../_orderCancel');

function getAppOrigin(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  const proto = req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  return `${proto}://${host}`;
}

const STATUSES_APPLY_DEADLINE = ['submitted', 'payment_link_issued'];

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }

  const origin = getAppOrigin(req);
  const orderId = typeof req.query.orderId === 'string' ? req.query.orderId.trim() : '';

  if (orderId) {
    const order = await getOrderById(orderId);
    if (
      order &&
      STATUSES_APPLY_DEADLINE.includes(order.status || '') &&
      isPastPaymentDeadline(order)
    ) {
      await cancelOrderAndRegeneratePdf(orderId);
    }
  }

  res.redirect(302, `${origin}/?payment=cancel`);
};
