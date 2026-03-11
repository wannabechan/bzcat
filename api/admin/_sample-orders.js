/**
 * 어드민 결제/통계/정산 테스트용 샘플 주문 (DB 미저장, API 응답에만 병합).
 * 사용: 환경변수 ADMIN_USE_SAMPLE_ORDERS=true 설정 시 어드민 주문/통계/정산 API에 샘플이 병합됨.
 * 테스트 후 실제 데이터만 쓰려면 해당 env 제거 또는 false 로 두면 됨.
 *
 * 주문·진행 가정:
 * - 사용자-1: 2026-01-15부터 매주 월요일 주문, 8일 후 19:00 배송 희망, 첫 매장 첫 메뉴 5개
 * - 사용자-2: 2026-01-15부터 매주 수요일 주문, 8일 후 17:00 배송 희망, 첫 매장 두번째 메뉴 5개
 * - 주문 즉시 매장 담당자 주문 승인 → 어드민 주문 30분 뒤 결제 생성 코드 입력 → 주문자 결제 활성화 30분 뒤 결제 완료
 *   → 배송 희망일 당일 9:00 배송 번호 입력 → 희망 일시에 배송 완료 → 희망일시 1시간 뒤 어드민 배송 완료 코드 입력
 */

const { getStores, getMenus } = require('../_redis');

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00+09:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function nextWeekdayAfter(fromYmd, weekday) {
  // weekday: 0=Sun, 1=Mon, ..., 6=Sat
  const d = new Date(fromYmd + 'T12:00:00+09:00');
  let count = 0;
  while (count < 60) {
    if (d.getDay() === weekday) return d.toISOString().slice(0, 10);
    d.setDate(d.getDate() + 1);
    count++;
  }
  return fromYmd;
}

/** 배송 희망일·시각 기준으로 현재 시각이 지났는지에 따라 진행 단계 결정 (배송완료는 희망일시+1시간 이후만) */
function sampleOrderStatusAndFields(deliveryDate, deliveryTime, nowMs, idPrefix, index) {
  const timeStr = (deliveryTime || '00:00').toString().trim();
  const shippingNumberAt = new Date(deliveryDate + 'T09:00:00+09:00').getTime();
  const deliveryCompletedAt = new Date(deliveryDate + 'T' + timeStr.replace(/^(\d{1,2}):(\d{2})$/, (_, h, m) => `${h.padStart(2, '0')}:${m}:00`) + '+09:00').getTime() + 60 * 60 * 1000;
  const idx = String(index).padStart(4, '0');
  if (nowMs >= deliveryCompletedAt) {
    return { status: 'delivery_completed', payment_link: 'https://payment.tosspayments.com/sample/' + idPrefix + '-' + (index), tracking_number: 'SAMPLE-' + idPrefix.toUpperCase() + '-' + idx };
  }
  if (nowMs >= shippingNumberAt) {
    return { status: 'shipping', payment_link: 'https://payment.tosspayments.com/sample/' + idPrefix + '-' + (index), tracking_number: 'SAMPLE-' + idPrefix.toUpperCase() + '-' + idx };
  }
  return { status: 'payment_completed', payment_link: 'https://payment.tosspayments.com/sample/' + idPrefix + '-' + (index), tracking_number: '' };
}

/**
 * @returns {Promise<Array<object>>} 샘플 주문 배열 (실제 DB 없음). 배송 희망일이 아직 지나지 않은 주문은 배송완료가 아님.
 */
async function getAdminSampleOrders() {
  const stores = await getStores();
  if (!stores || stores.length === 0) return [];
  const firstStore = stores[0];
  const menus = await getMenus(firstStore.id);
  if (!menus || menus.length === 0) return [];
  const menu1 = menus[0];
  const menu2 = menus[1] || menus[0];

  const nowMs = Date.now();
  const orders = [];
  const startYmd = '2026-01-15';

  // 사용자-1: 매주 월요일 (1), 8일 후 19:00
  const firstMonday = nextWeekdayAfter(startYmd, 1);
  for (let i = 0; i < 8; i++) {
    const orderDate = addDays(firstMonday, i * 7);
    const deliveryDate = addDays(orderDate, 8);
    const totalAmount = (menu1.price || 0) * 5;
    const { status, payment_link, tracking_number } = sampleOrderStatusAndFields(deliveryDate, '19:00', nowMs, 'u1', i + 1);
    const order = {
      id: `sample-u1-${i + 1}`,
      user_email: 'sample@test.local',
      depositor: '사용자-1',
      contact: '010-0000-0001',
      delivery_address: '(샘플) 테스트 주소',
      detail_address: '',
      delivery_date: deliveryDate,
      delivery_time: '19:00',
      order_items: [
        { id: menu1.id, name: menu1.name, price: menu1.price, quantity: 5 },
      ],
      total_amount: totalAmount,
      status,
      created_at: `${orderDate}T10:00:00+09:00`,
      payment_link,
    };
    if (tracking_number) order.tracking_number = tracking_number;
    orders.push(order);
  }

  // 사용자-2: 매주 수요일 (3), 8일 후 17:00
  const firstWednesday = nextWeekdayAfter(startYmd, 3);
  for (let i = 0; i < 8; i++) {
    const orderDate = addDays(firstWednesday, i * 7);
    const deliveryDate = addDays(orderDate, 8);
    const totalAmount = (menu2.price || 0) * 5;
    const { status, payment_link, tracking_number } = sampleOrderStatusAndFields(deliveryDate, '17:00', nowMs, 'u2', i + 1);
    const order = {
      id: `sample-u2-${i + 1}`,
      user_email: 'sample@test.local',
      depositor: '사용자-2',
      contact: '010-0000-0002',
      delivery_address: '(샘플) 테스트 주소',
      detail_address: '',
      delivery_date: deliveryDate,
      delivery_time: '17:00',
      order_items: [
        { id: menu2.id, name: menu2.name, price: menu2.price, quantity: 5 },
      ],
      total_amount: totalAmount,
      status,
      created_at: `${orderDate}T10:00:00+09:00`,
      payment_link,
    };
    if (tracking_number) order.tracking_number = tracking_number;
    orders.push(order);
  }

  return orders;
}

module.exports = { getAdminSampleOrders };
