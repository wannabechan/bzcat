/**
 * GET /api/payment/success
 * Toss 결제 성공 리다이렉트: 확인 후 주문 상태를 결제 완료로 변경
 */

const { getOrderById, updateOrderStatus, getStores } = require('../_redis');

const TOSS_CONFIRM = 'https://api.tosspayments.com/v1/payments/confirm';

function getStoreSlugFromOrder(order) {
  const items = order.order_items;
  if (!Array.isArray(items) || items.length === 0) return null;
  const firstId = items[0]?.id;
  if (!firstId || typeof firstId !== 'string') return null;
  const slug = firstId.split('-')[0];
  return slug || null;
}

const ALLOWED_TOSS_ENV_NAMES = ['TOSS_SECRET_KEY', 'TOSS_SECRET_KEY_TEST'];

async function getTossSecretKeyForOrder(order) {
  const stores = await getStores();
  const slug = getStoreSlugFromOrder(order);
  const store = slug
    ? stores.find((s) => (s.id === slug || s.slug === slug))
    : null;
  let envVarName = (store?.payment?.apiKeyEnvVar || stores[0]?.payment?.apiKeyEnvVar || '').trim() || 'TOSS_SECRET_KEY';
  if (!ALLOWED_TOSS_ENV_NAMES.includes(envVarName)) envVarName = 'TOSS_SECRET_KEY';
  return process.env[envVarName] || '';
}

function getAppOrigin(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  const proto = req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  return `${proto}://${host}`;
}

function pickQuery(req, key) {
  const v = req.query[key] ?? req.query[key.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }

  const orderId = pickQuery(req, 'orderId');
  const paymentKey = pickQuery(req, 'paymentKey');
  const amount = pickQuery(req, 'amount');

  const origin = getAppOrigin(req);
  const redirectBase = `${origin}/`;

  if (!orderId || !paymentKey || amount === undefined) {
    console.error('Payment success: missing params', { orderId, paymentKey, amount });
    return res.redirect(302, `${redirectBase}?payment=error`);
  }

  const orderIdStr = String(orderId).trim();
  const order = await getOrderById(orderIdStr);
  if (!order) {
    console.error('Payment success: order not found', orderIdStr);
    return res.redirect(302, `${redirectBase}?payment=error`);
  }

  const TOSS_SECRET_KEY = await getTossSecretKeyForOrder(order);
  if (!TOSS_SECRET_KEY) {
    return res.redirect(302, `${redirectBase}?payment=error`);
  }

  try {
    const amountNum = Number(amount);
    const auth = Buffer.from(`${TOSS_SECRET_KEY}:`, 'utf8').toString('base64');
    const confirmRes = await fetch(TOSS_CONFIRM, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({
        paymentKey: String(paymentKey).trim(),
        orderId: orderIdStr,
        amount: amountNum,
      }),
    });

    if (!confirmRes.ok) {
      const errBody = await confirmRes.text();
      console.error('Payment success: confirm failed', confirmRes.status, errBody);
      return res.redirect(302, `${redirectBase}?payment=error`);
    }

    await updateOrderStatus(orderIdStr, 'payment_completed');
    return res.redirect(302, `${redirectBase}?payment=success`);
  } catch (err) {
    console.error('Payment success handler error:', err);
    return res.redirect(302, `${redirectBase}?payment=error`);
  }
};
