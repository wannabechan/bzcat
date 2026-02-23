/**
 * GET /api/cron/alimtalk-delivery-reminder
 * 배송일 하루 전 오전 10시(KST)에 매장 담당자에게 배송 준비 알림톡 발송
 * Vercel Cron 01:00 UTC (= 10:00 KST) 또는 외부 스케줄러에서 호출 (CRON_SECRET 필요)
 */

const { getAllOrders, getStores } = require('../_redis');
const { getStoreForOrder } = require('../orders/_order-email');
const { sendAlimtalk } = require('../_alimtalk');

/** 날짜 문자열을 YYYY-MM-DD로 정규화 */
function normalizeDateKey(str) {
  if (!str || typeof str !== 'string') return '';
  const s = str.trim().replace(/\D/g, '');
  if (s.length === 8) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return '';
}

/** KST 기준 내일 날짜 문자열 (YYYY-MM-DD) */
function getTomorrowKstStr() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const tomorrow = new Date(kst.getTime() + 24 * 60 * 60 * 1000);
  const y = tomorrow.getUTCFullYear();
  const m = String(tomorrow.getUTCMonth() + 1).padStart(2, '0');
  const d = String(tomorrow.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const STATUSES_FOR_DELIVERY_REMINDER = ['payment_completed', 'shipping', 'delivery_completed'];

module.exports = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).setHeader('Allow', 'GET, POST').end();
  }

  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : req.query?.secret;
  if (!secret || token !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const templateCode = (process.env.NHN_ALIMTALK_TEMPLATE_CODE_STORE_PREPARE_ORDER || '').trim();
  if (!templateCode) {
    return res.status(200).json({ ok: true, sent: 0, message: 'NHN_ALIMTALK_TEMPLATE_CODE_STORE_PREPARE_ORDER not set' });
  }

  try {
    const tomorrowStr = getTomorrowKstStr();
    const orders = await getAllOrders();
    const stores = await getStores() || [];

    const toNotify = orders.filter((o) => {
      if (!STATUSES_FOR_DELIVERY_REMINDER.includes(o.status || '')) return false;
      const deliveryKey = normalizeDateKey(o.delivery_date || '');
      return deliveryKey === tomorrowStr;
    });

    let sent = 0;
    for (const order of toNotify) {
      try {
        const store = getStoreForOrder(order, stores);
        if (!store) continue;
        const storeContact = (store.storeContact || '').trim();
        if (!storeContact) continue;

        const storeName = (store.brand || store.title || store.id || store.slug || '').trim() || '주문';
        const totalAmountStr = Number(order.total_amount || 0).toLocaleString() + '원';
        const deliveryDateStr = (order.delivery_date || '').toString().trim() || '-';
        const deliveryTimeStr = (order.delivery_time || '').toString().trim() || '';

        const result = await sendAlimtalk({
          templateCode,
          recipientNo: storeContact,
          templateParameter: {
            orderId: order.id,
            storeName,
            deliveryDate: deliveryDateStr,
            deliveryTime: deliveryTimeStr || '-',
            depositor: (order.depositor || '').trim() || '-',
            totalAmount: totalAmountStr,
          },
        });
        if (result.success) sent += 1;
      } catch (err) {
        console.error('Alimtalk delivery reminder error for order', order.id, err);
      }
    }

    return res.status(200).json({ ok: true, sent, total: toNotify.length });
  } catch (err) {
    console.error('Alimtalk delivery reminder cron error:', err);
    return res.status(500).json({ error: 'Cron failed' });
  }
};
