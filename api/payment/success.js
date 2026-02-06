/**
 * GET /api/payment/success
 * Toss 결제 성공 리다이렉트: 확인 후 주문 상태를 결제 완료로 변경
 */

const { getOrderById, updateOrderStatus } = require('../_redis');

const TOSS_SECRET_KEY = process.env.TOSS_SECRET_KEY;
const TOSS_CONFIRM = 'https://api.tosspayments.com/v1/payments/confirm';

function getAppOrigin(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  const proto = req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  return `${proto}://${host}`;
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }

  const orderId = req.query.orderId;
  const paymentKey = req.query.paymentKey;
  const amount = req.query.amount;

  const origin = getAppOrigin(req);
  const redirectBase = `${origin}/`;

  if (!orderId || !paymentKey || amount === undefined) {
    return res.redirect(302, `${redirectBase}?payment=error`);
  }

  if (!TOSS_SECRET_KEY) {
    return res.redirect(302, `${redirectBase}?payment=error`);
  }

  try {
    const order = await getOrderById(orderId);
    if (!order) {
      return res.redirect(302, `${redirectBase}?payment=error`);
    }

    const amountNum = Number(amount);
    const auth = Buffer.from(`${TOSS_SECRET_KEY}:`, 'utf8').toString('base64');
    const confirmRes = await fetch(TOSS_CONFIRM, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({
        paymentKey,
        orderId: String(orderId),
        amount: amountNum,
      }),
    });

    if (!confirmRes.ok) {
      return res.redirect(302, `${redirectBase}?payment=error`);
    }

    await updateOrderStatus(orderId, 'payment_completed');
    return res.redirect(302, `${redirectBase}?payment=success`);
  } catch (err) {
    console.error('Payment success handler error:', err);
    return res.redirect(302, `${redirectBase}?payment=error`);
  }
};
