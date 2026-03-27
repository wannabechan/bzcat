/**
 * GET /api/payment/success
 * Toss 결제 성공 리다이렉트: 확인 후 주문 상태를 결제 완료로 변경
 */

const { getOrderById, updateOrderStatus, updateOrderTossPaymentKey, getStores } = require('../_redis');
const { getAppOrigin, getTossSecretKeyForOrder } = require('./_helpers');
const { getStoreForOrder, getStoreDisplayName } = require('../orders/_order-email');
const { sendAlimtalk } = require('../_alimtalk');

const TOSS_CONFIRM = 'https://api.tosspayments.com/v1/payments/confirm';

function pickQuery(req, key) {
  const v = req.query[key] ?? req.query[key.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
}

async function confirmPaymentWithSecret(secretKey, payload) {
  const auth = Buffer.from(`${secretKey}:`, 'utf8').toString('base64');
  const confirmRes = await fetch(TOSS_CONFIRM, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify(payload),
  });

  const bodyText = await confirmRes.text();
  let bodyJson = null;
  try {
    bodyJson = bodyText ? JSON.parse(bodyText) : null;
  } catch (_) {}
  return { ok: confirmRes.ok, status: confirmRes.status, bodyText, bodyJson };
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
    const missing = []; if (!orderId) missing.push('orderId'); if (!paymentKey) missing.push('paymentKey'); if (amount === undefined) missing.push('amount');
    console.error('Payment success: missing params', missing.join(', '));
    return res.redirect(302, `${redirectBase}?payment=error`);
  }

  const orderIdStr = String(orderId).trim();
  const paymentKeyStr = String(paymentKey).trim();
  if (orderIdStr.length > 64 || !/^[A-Za-z0-9_-]+$/.test(orderIdStr) || paymentKeyStr.length < 8 || paymentKeyStr.length > 256) {
    console.error('Payment success: invalid params format');
    return res.redirect(302, `${redirectBase}?payment=error`);
  }
  const order = await getOrderById(orderIdStr);
  if (!order) {
    console.error('Payment success: order not found', orderIdStr);
    return res.redirect(302, `${redirectBase}?payment=error`);
  }

  const tossSecretKey = await getTossSecretKeyForOrder(order);
  if (!tossSecretKey) {
    return res.redirect(302, `${redirectBase}?payment=error`);
  }

  try {
    const amountNum = Number(amount);
    const expectedAmount = Math.floor(Number(order.total_amount));
    if (!Number.isFinite(amountNum) || !Number.isInteger(amountNum) || amountNum < 100 || amountNum !== expectedAmount) {
      console.error('Payment success: amount mismatch', { requested: amountNum, expected: expectedAmount, orderId: orderIdStr });
      return res.redirect(302, `${redirectBase}?payment=error`);
    }
    const confirmPayload = {
      paymentKey: paymentKeyStr,
      orderId: orderIdStr,
      amount: amountNum,
    };
    const confirmResult = await confirmPaymentWithSecret(tossSecretKey, confirmPayload);

    if (!confirmResult.ok) {
      console.error('Payment success: confirm failed', confirmResult.status, confirmResult.bodyText);
      return res.redirect(302, `${redirectBase}?payment=error`);
    }

    await updateOrderTossPaymentKey(orderIdStr, paymentKeyStr);
    await updateOrderStatus(orderIdStr, 'payment_completed', 'payment_system');

    // 결제 완료 시 매장 담당자 알림톡: storeName, orderId, totalAmount, deliveryDate, deliveryTime
    const templateCode = (process.env.NHN_ALIMTALK_TEMPLATE_CODE_STORE_PAY_ORDER || '').trim();
    const stores = await getStores();
    const store = getStoreForOrder(order, stores || []);
    if (templateCode && store) {
      try {
        const storeContact = (store.storeContact || '').trim();
        if (storeContact) {
          const storeName = getStoreDisplayName(store);
          const totalAmountStr = Number(order.total_amount || 0).toLocaleString() + '원';
          const deliveryDateStr = (order.delivery_date || '').toString().trim() || '-';
          const deliveryTimeStr = (order.delivery_time || '').toString().trim() || '-';
          await sendAlimtalk({
            templateCode,
            recipientNo: storeContact,
            templateParameter: {
              storeName,
              orderId: order.id,
              totalAmount: totalAmountStr,
              deliveryDate: deliveryDateStr,
              deliveryTime: deliveryTimeStr || '-',
            },
          });
        }
      } catch (alimErr) {
        console.error('Alimtalk payment-completed notification error:', alimErr);
      }
    }

    // 결제 완료 시 주문자(고객) 알림톡: storeName, orderId, totalAmount, deliveryDate, deliveryAddress, detailAddress
    const userPaydoneCode = (process.env.NHN_ALIMTALK_TEMPLATE_CODE_USER_PAYDONE_ORDER || '').trim();
    const orderContact = (order.contact || '').trim();
    if (userPaydoneCode && orderContact) {
      try {
        const storeName = getStoreDisplayName(store);
        const totalAmountStr = Number(order.total_amount || 0).toLocaleString() + '원';
        const deliveryDateStr = (order.delivery_date || '').toString().trim() || '-';
        const deliveryAddressStr = (order.delivery_address || '').trim() || '-';
        const detailAddressStr = (order.detail_address || '').trim() || '-';
        await sendAlimtalk({
          templateCode: userPaydoneCode,
          recipientNo: orderContact,
          templateParameter: {
            storeName,
            orderId: order.id,
            totalAmount: totalAmountStr,
            deliveryDate: deliveryDateStr,
            deliveryAddress: deliveryAddressStr,
            detailAddress: detailAddressStr,
          },
        });
      } catch (alimErr) {
        console.error('Alimtalk paydone (user) notification error:', alimErr);
      }
    }

    return res.redirect(302, `${redirectBase}?payment=success`);
  } catch (err) {
    console.error('Payment success handler error:', err);
    return res.redirect(302, `${redirectBase}?payment=error`);
  }
};
