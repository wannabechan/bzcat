/**
 * GET/POST /api/cron/anonymize-order-pii
 * KST 매일 15:00 (Vercel: 0 6 * * * UTC) — 배송 희망일 익일 0시 또는 취소 익일 0시 기준 +180일 경과 주문의
 * PII를 일별 로그 CSV와 동일 규칙으로 마스킹, PDF 재생성·Blob 덮어쓰기, 삭제 스냅샷 동일 처리.
 * CRON_SECRET Bearer 필요.
 */

const { put } = require('@vercel/blob');
const {
  getAllOrders,
  getStores,
  saveOrderDocument,
  listOrderDeletionRecordsRaw,
  setOrderDeletionRecordAtIndex,
} = require('../_redis');
const { generateOrderPdf } = require('../_pdf');
const { getKSTTodayString } = require('../_kst');
const {
  isOrderDueForPiiAnonymization,
  isPlausibleLiveOrder,
  buildPiiMaskedOrderPatch,
} = require('../_pii-anonymize-helpers');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function uploadMaskedPdfWithRetries(orderMasked, stores, orderId, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const pdfBuffer = await generateOrderPdf(orderMasked, stores || [], {
        isCancelled: orderMasked.status === 'cancelled',
      });
      const pathname = `orders/order-${orderId}.pdf`;
      const blob = await put(pathname, pdfBuffer, {
        access: 'public',
        contentType: 'application/pdf',
        allowOverwrite: true,
      });
      return blob.url;
    } catch (e) {
      lastErr = e;
      await sleep(200 * 2 ** i);
    }
  }
  throw lastErr || new Error('PDF upload failed');
}

module.exports = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).setHeader('Allow', 'GET, POST').end();
  }

  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = authHeader.slice(7);
  if (!secret || token !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const todayYmd = getKSTTodayString();
  const stores = await getStores();

  let ordersChecked = 0;
  let ordersAnonymized = 0;
  let ordersSkipped = 0;
  let ordersFailed = 0;
  const errors = [];

  try {
    const all = await getAllOrders();
    for (const order of all) {
      if (!isPlausibleLiveOrder(order)) continue;
      ordersChecked += 1;
      if (!isOrderDueForPiiAnonymization(order, todayYmd)) {
        ordersSkipped += 1;
        continue;
      }
      try {
        const patch = buildPiiMaskedOrderPatch(order);
        const next = { ...order, ...patch };
        const pdfUrl = await uploadMaskedPdfWithRetries(next, stores, order.id, 3);
        next.pdf_url = pdfUrl;
        next.pii_anonymized_at = new Date().toISOString();
        await saveOrderDocument(next);
        ordersAnonymized += 1;
      } catch (e) {
        ordersFailed += 1;
        errors.push({ orderId: order.id, message: e.message || String(e) });
        console.error('anonymize-order-pii live order failed', order.id, e);
      }
    }

    let deletionsUpdated = 0;
    let deletionsFailed = 0;
    const rawList = await listOrderDeletionRecordsRaw();
    for (let i = 0; i < rawList.length; i += 1) {
      let rec;
      try {
        rec = typeof rawList[i] === 'string' ? JSON.parse(rawList[i]) : rawList[i];
      } catch (_) {
        continue;
      }
      const snap = rec.order_snapshot;
      if (!snap || snap.pii_anonymized_at) continue;
      if (!isOrderDueForPiiAnonymization(snap, todayYmd)) continue;
      try {
        const patch = buildPiiMaskedOrderPatch(snap);
        const nextSnap = { ...snap, ...patch, pii_anonymized_at: new Date().toISOString() };
        const nextRec = { ...rec, order_snapshot: nextSnap };
        await setOrderDeletionRecordAtIndex(i, nextRec);
        deletionsUpdated += 1;
      } catch (e) {
        deletionsFailed += 1;
        errors.push({ deletionIndex: i, message: e.message || String(e) });
        console.error('anonymize-order-pii deletion record failed', i, e);
      }
    }

    return res.status(200).json({
      ok: true,
      todayKst: todayYmd,
      ordersChecked,
      ordersAnonymized,
      ordersSkipped,
      ordersFailed,
      deletionsUpdated,
      deletionsFailed,
      errors: errors.slice(0, 50),
    });
  } catch (err) {
    console.error('anonymize-order-pii cron error:', err);
    return res.status(500).json({ error: 'Cron failed', message: err.message || String(err) });
  }
};
