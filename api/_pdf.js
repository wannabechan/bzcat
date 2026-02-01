/**
 * 주문서 PDF 생성 (정식 주문서 형식)
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

const MARGIN = 50;
const PAGE_WIDTH = 595;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

function formatPrice(price) {
  return Number(price).toLocaleString() + '원';
}

function formatDate(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}.${m}.${day} ${h}:${min}`;
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
    const doc = new PDFDocument({ size: 'A4', margin: MARGIN });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const fontPath = path.join(__dirname, 'fonts', 'NotoSansKR-VariableFont_wght.ttf');
    const useKorean = fs.existsSync(fontPath);
    if (useKorean) {
      doc.registerFont('NotoSansKR', fontPath);
      doc.font('NotoSansKR');
    }

    let y = MARGIN;

    // ===== 헤더 =====
    doc.fontSize(24).fillColor('#1a1a1a');
    doc.text('BzCat', MARGIN, y, { align: 'center', width: CONTENT_WIDTH });
    doc.fontSize(14).fillColor('#555');
    y = doc.y + 4;
    doc.text('비즈니스 케이터링 주문서', MARGIN, y, { align: 'center', width: CONTENT_WIDTH });
    y = doc.y + 20;
    doc.fillColor('#000');

    // 구분선
    doc.moveTo(MARGIN, y).lineTo(PAGE_WIDTH - MARGIN, y).stroke('#ddd');
    y += 16;

    // ===== 1. 주문자 정보 =====
    doc.fontSize(12).fillColor('#333');
    if (!useKorean) doc.font('Helvetica-Bold');
    doc.text('1. 주문자 정보', MARGIN, y);
    if (useKorean) doc.font('NotoSansKR');
    y += 20;

    const infoBoxY = y;
    doc.rect(MARGIN, y, CONTENT_WIDTH, 52).stroke('#ccc').fill('#fafafa');
    doc.fillColor('#000').fontSize(10);
    y += 14;
    doc.text(`주문자명: ${order.depositor || '—'}`, MARGIN + 12, y);
    doc.text(`연락처: ${order.contact || '—'}`, MARGIN + 12, y + 18);
    y = infoBoxY + 52 + 20;

    // ===== 2. 주문 정보 =====
    doc.fontSize(12).fillColor('#333');
    if (!useKorean) doc.font('Helvetica-Bold');
    doc.text('2. 주문 정보', MARGIN, y);
    if (useKorean) doc.font('NotoSansKR');
    y += 20;

    const orderBoxY = y;
    doc.rect(MARGIN, y, CONTENT_WIDTH, 90).stroke('#ccc').fill('#fafafa');
    doc.fillColor('#000').fontSize(10);
    y += 14;
    doc.text(`주문번호: #${order.id}`, MARGIN + 12, y);
    doc.text(`주문일시: ${formatDate(order.created_at)}`, MARGIN + 12, y + 18);
    doc.text(`배송희망일: ${order.delivery_date || '—'} ${order.delivery_time || ''}`, MARGIN + 12, y + 36);
    doc.text(`배송주소: ${order.delivery_address || '—'} ${order.detail_address || ''}`, MARGIN + 12, y + 54);
    y = orderBoxY + 90 + 20;

    // ===== 3. 주문 내역 =====
    doc.fontSize(12).fillColor('#333');
    if (!useKorean) doc.font('Helvetica-Bold');
    doc.text('3. 주문 내역', MARGIN, y);
    if (useKorean) doc.font('NotoSansKR');
    y += 20;

    const col1 = MARGIN + 12;
    const col2 = MARGIN + 280;
    const col3 = MARGIN + 360;
    const col4 = MARGIN + 440;

    // 테이블 헤더
    doc.rect(MARGIN, y, CONTENT_WIDTH, 24).fill('#e8e8e8').stroke('#ccc');
    doc.fillColor('#333').fontSize(9);
    if (!useKorean) doc.font('Helvetica-Bold');
    doc.text('메뉴명', col1, y + 8);
    doc.text('수량', col2, y + 8);
    doc.text('단가', col3, y + 8);
    doc.text('금액', col4, y + 8);
    if (useKorean) doc.font('NotoSansKR');
    doc.fillColor('#000');
    y += 24;

    let rowNum = 0;
    for (const slug of orderedSlugs) {
      const title = getCategoryTitle(slug);
      doc.rect(MARGIN, y, CONTENT_WIDTH, 20).fill('#f5f5f5').stroke('#ddd');
      doc.fontSize(10).fillColor('#333');
      if (!useKorean) doc.font('Helvetica-Bold');
      doc.text(`[${title}]`, col1, y + 6);
      if (useKorean) doc.font('NotoSansKR');
      doc.fillColor('#000');
      y += 20;
      rowNum++;

      for (const item of byCategory[slug]) {
        const lineTotal = item.price * item.qty;
        const rowH = 18;
        if (rowNum % 2 === 0) doc.rect(MARGIN, y, CONTENT_WIDTH, rowH).fill('#fafafa');
        doc.rect(MARGIN, y, CONTENT_WIDTH, rowH).stroke('#eee');
        doc.fontSize(9);
        doc.text(item.name, col1, y + 5);
        doc.text(String(item.qty), col2, y + 5);
        doc.text(formatPrice(item.price), col3, y + 5);
        doc.text(formatPrice(lineTotal), col4, y + 5);
        y += rowH;
        rowNum++;
      }
    }

    // 총 금액 행
    y += 8;
    doc.rect(MARGIN, y, CONTENT_WIDTH, 28).fill('#f0f0f0').stroke('#ccc');
    doc.fontSize(11).fillColor('#000');
    if (!useKorean) doc.font('Helvetica-Bold');
    doc.text('총 주문 금액', col1, y + 9);
    doc.text(formatPrice(order.total_amount || 0), col4, y + 9);
    if (useKorean) doc.font('NotoSansKR');
    y += 36;

    // ===== 4. 기타 안내 사항 =====
    doc.fontSize(12).fillColor('#333');
    if (!useKorean) doc.font('Helvetica-Bold');
    doc.text('4. 기타 안내 사항', MARGIN, y);
    if (useKorean) doc.font('NotoSansKR');
    y += 20;

    const noticeBoxY = y;
    const notices = [
      '· 결제 완료 후 주문이 확정됩니다.',
      '· 배송 희망일 6일 전까지 주문 및 결제를 완료해 주세요.',
      '· 주문 변경·취소는 배송 3일 전까지 가능합니다.',
      '· 문의사항은 주문 시 입력한 연락처로 안내드립니다.',
    ];
    doc.rect(MARGIN, y, CONTENT_WIDTH, notices.length * 20 + 16).stroke('#ccc').fill('#fcfcfc');
    doc.fillColor('#444').fontSize(9);
    y += 12;
    for (const n of notices) {
      doc.text(n, MARGIN + 12, y);
      y += 20;
    }
    y += 16;

    // ===== 5. 면책 조항 =====
    doc.fontSize(12).fillColor('#333');
    if (!useKorean) doc.font('Helvetica-Bold');
    doc.text('5. 면책 조항', MARGIN, y);
    if (useKorean) doc.font('NotoSansKR');
    y += 20;

    const disclaimer = [
      '본 주문서는 주문자의 신청에 따른 주문 내용 확인용 문서입니다.',
      '재고·생산 사정 등으로 인해 일부 메뉴 변경 또는 배송일 조정이 있을 수 있으며,',
      '해당 시 사전에 연락드립니다. 예고 없이 제공되는 서비스 내용이 변경될 수 있습니다.',
    ];
    doc.rect(MARGIN, y, CONTENT_WIDTH, disclaimer.length * 18 + 16).stroke('#ddd').fill('#fafafa');
    doc.fillColor('#555').fontSize(8);
    y += 12;
    for (const d of disclaimer) {
      doc.text(d, MARGIN + 12, y);
      y += 18;
    }

    // 푸터
    y += 24;
    doc.fontSize(8).fillColor('#999');
    doc.text(`작성일시: ${formatDate(order.created_at)}  |  BzCat 비즈니스 케이터링`, MARGIN, y, {
      align: 'center',
      width: CONTENT_WIDTH,
    });

    doc.end();
  });
}

module.exports = { generateOrderPdf };
