/**
 * GET /api/cron/daily-order-log
 * 매일 KST 09:30에 실행. 주문 스냅샷 + 삭제 이벤트를 일별 CSV로 bzcat-blob-log에 업로드.
 * 시점(타임스탬프)·행위자·삭제 명시 반영. 개인정보 마스킹 적용.
 * Vercel Cron 또는 외부 스케줄러에서 호출 (CRON_SECRET 필요)
 */

const { put } = require('@vercel/blob');
const { getAllOrders, getDeletionRecordsForDate } = require('../_redis');
const { getKSTDateString } = require('../_kst');
const { maskEmail, maskName, maskPhone, maskAddress } = require('../_pii-mask');

const BOM = '\uFEFF'; // UTF-8 BOM for Excel

function escapeCsvCell(value) {
  if (value == null) return '';
  const s = String(value);
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function lastStatusChange(order) {
  const hist = order.status_history;
  if (!Array.isArray(hist) || hist.length === 0) {
    return { at: order.created_at || '', by: 'system' };
  }
  const last = hist[hist.length - 1];
  return { at: last.at || '', by: last.by || 'system' };
}

function orderToRow(o, recordType) {
  const items = Array.isArray(o.order_items) ? o.order_items : [];
  const itemsSummary = items.map((it) => `${escapeCsvCell(it.name || it.id)} x${Number(it.quantity) || 0}`).join('; ');
  const { at: statusChangedAt, by: statusChangedBy } = lastStatusChange(o);
  return [
    escapeCsvCell(recordType || 'order'),
    escapeCsvCell(o.id),
    escapeCsvCell(o.created_at),
    escapeCsvCell(o.status),
    escapeCsvCell(statusChangedAt),
    escapeCsvCell(statusChangedBy),
    escapeCsvCell(maskEmail(o.user_email)),
    escapeCsvCell(maskName(o.depositor)),
    escapeCsvCell(maskPhone(o.contact)),
    escapeCsvCell(o.expense_type),
    escapeCsvCell(o.expense_doc),
    escapeCsvCell(o.delivery_date),
    escapeCsvCell(o.delivery_time),
    escapeCsvCell(maskAddress(o.delivery_address, o.detail_address)),
    escapeCsvCell(o.total_amount),
    escapeCsvCell(o.cancel_reason),
    escapeCsvCell(o.tracking_number),
    escapeCsvCell(o.pdf_url || ''),
    escapeCsvCell(itemsSummary),
    escapeCsvCell(''), // deleted_at (order row)
    escapeCsvCell(''), // deleted_by (order row)
  ].join(',');
}

function deletionToRow(rec) {
  const o = rec.order_snapshot || {};
  const base = [
    'deletion',
    escapeCsvCell(rec.order_id),
    escapeCsvCell(o.created_at || ''),
    escapeCsvCell(o.status || ''),
    escapeCsvCell(''),
    escapeCsvCell(''),
    escapeCsvCell(maskEmail(o.user_email)),
    escapeCsvCell(maskName(o.depositor)),
    escapeCsvCell(maskPhone(o.contact)),
    escapeCsvCell(o.expense_type),
    escapeCsvCell(o.expense_doc),
    escapeCsvCell(o.delivery_date),
    escapeCsvCell(o.delivery_time),
    escapeCsvCell(maskAddress(o.delivery_address, o.detail_address)),
    escapeCsvCell(o.total_amount),
    escapeCsvCell(o.cancel_reason),
    escapeCsvCell(o.tracking_number || ''),
    escapeCsvCell(o.pdf_url || ''),
    escapeCsvCell(Array.isArray(o.order_items) ? o.order_items.map((it) => `${it.name || it.id} x${Number(it.quantity) || 0}`).join('; ') : ''),
    escapeCsvCell(rec.deleted_at || ''),
    escapeCsvCell(rec.deleted_by || ''),
  ];
  return base.join(',');
}

function buildCsv(orders, deletionRecords) {
  const header = 'record_type,order_id,created_at,status,status_changed_at,status_changed_by,user_email,depositor,contact,expense_type,expense_doc,delivery_date,delivery_time,delivery_address,total_amount,cancel_reason,tracking_number,pdf_url,order_items_summary,deleted_at,deleted_by';
  const orderRows = orders.map((o) => orderToRow(o, 'order'));
  const deletionRows = (deletionRecords || []).map(deletionToRow);
  return BOM + header + '\n' + orderRows.join('\n') + (deletionRows.length ? '\n' + deletionRows.join('\n') : '');
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

  const blobToken = process.env.BLOB_LOG_READ_WRITE_TOKEN;
  if (!blobToken) {
    return res.status(503).json({ error: 'BLOB_LOG_READ_WRITE_TOKEN not configured' });
  }

  try {
    const orders = await getAllOrders();
    const dateStr = getKSTDateString();
    const deletionRecords = await getDeletionRecordsForDate(dateStr);
    const csv = buildCsv(orders, deletionRecords);
    const pathname = `logs/${dateStr}.csv`;

    const blob = await put(pathname, Buffer.from(csv, 'utf8'), {
      access: 'private',
      contentType: 'text/csv; charset=utf-8',
      token: blobToken,
    });

    return res.status(200).json({
      ok: true,
      pathname: blob.pathname,
      date: dateStr,
      orderCount: orders.length,
      deletionCount: deletionRecords.length,
    });
  } catch (err) {
    console.error('[cron/daily-order-log]', err);
    return res.status(500).json({ error: 'Daily order log failed' });
  }
};
