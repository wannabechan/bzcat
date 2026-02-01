/**
 * 주문서 PDF 생성
 */

const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

const DEFAULT_CATEGORY_TITLES = {
  bento: '도시락',
  side: '반찬',
  salad: '샐러드',
  beverage: '음료',
  dessert: '디저트',
};

function formatPrice(price) {
  return Number(price).toLocaleString() + '원';
}

function formatDate(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}.${m}.${day}`;
}

async function generateOrderPdf(order, stores = []) {
  const slugToTitle = {};
  for (const s of stores) {
    slugToTitle[s.slug || s.id] = s.title || s.id;
  }
  const getCategoryTitle = (slug) => slugToTitle[slug] || DEFAULT_CATEGORY_TITLES[slug] || slug;

  const orderItems = order.order_items || [];
  const byCategory = {};
  for (const oi of orderItems) {
    const itemId = oi.id || '';
    const slug = (itemId.split('-')[0] || 'default').toLowerCase();
    const item = { name: oi.name || '', price: oi.price || 0, qty: oi.quantity || 0 };
    if (!byCategory[slug]) byCategory[slug] = [];
    byCategory[slug].push(item);
  }
  for (const slug of Object.keys(byCategory)) {
    byCategory[slug].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'));
  }

  const categoryOrder = ['bento', 'side', 'salad', 'beverage', 'dessert'];
  const orderedSlugs = categoryOrder.filter((s) => byCategory[s]?.length);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const fontPath = path.join(__dirname, 'fonts', 'NotoSansKR-Regular.ttf');
    if (fs.existsSync(fontPath)) {
      doc.registerFont('NotoSansKR', fontPath);
      doc.font('NotoSansKR');
    }

    doc.fontSize(20).text('BzCat 주문서', { align: 'center' });
    doc.moveDown();

    doc.fontSize(10);
    doc.text(`주문번호: #${order.id}`, 50, doc.y);
    doc.text(`주문일시: ${formatDate(order.created_at)}`, 50, doc.y + 15);
    doc.moveDown(2);

    doc.text(`주문자: ${order.depositor || '—'}`, 50, doc.y);
    doc.text(`연락처: ${order.contact || '—'}`, 50, doc.y + 15);
    doc.moveDown(2);

    doc.text(`배송희망일: ${order.delivery_date || '—'} ${order.delivery_time || ''}`, 50, doc.y);
    doc.text(`배송주소: ${order.delivery_address || '—'} ${order.detail_address || ''}`, 50, doc.y + 15);
    doc.moveDown(2);

    const useKorean = fs.existsSync(fontPath);
    let y = doc.y;
    for (const slug of orderedSlugs) {
      const title = getCategoryTitle(slug);
      doc.fontSize(11);
      if (useKorean) doc.font('NotoSansKR');
      else doc.font('Helvetica-Bold');
      doc.text(title, 50, y);
      if (useKorean) doc.font('NotoSansKR');
      else doc.font('Helvetica');
      doc.fontSize(10);
      y += 18;

      let catTotal = 0;
      for (const item of byCategory[slug]) {
        const lineTotal = item.price * item.qty;
        catTotal += lineTotal;
        doc.text(`  ${item.name} × ${item.qty}  ${formatPrice(lineTotal)}`, 50, y);
        y += 18;
      }
      doc.text(`  소계: ${formatPrice(catTotal)}`, 50, y);
      y += 28;
    }

    doc.fontSize(12);
    if (useKorean) doc.font('NotoSansKR');
    else doc.font('Helvetica-Bold');
    doc.text(`총 금액: ${formatPrice(order.total_amount || 0)}`, 50, y + 10);

    doc.end();
  });
}

module.exports = { generateOrderPdf };
