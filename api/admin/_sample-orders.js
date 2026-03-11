/**
 * 어드민 결제/통계/정산 테스트용 샘플 주문 (DB 미저장, API 응답에만 병합).
 * 사용: 환경변수 ADMIN_USE_SAMPLE_ORDERS=true 설정 시 어드민 주문/통계/정산 API에 샘플이 병합됨.
 * 테스트 후 실제 데이터만 쓰려면 해당 env 제거 또는 false 로 두면 됨.
 *
 * 규칙:
 * - 사용자-1: 2026-01-15부터 매주 월요일 주문, 8일 후 19:00 배송 희망, 첫 매장 첫 메뉴 5개, 배송완료
 * - 사용자-2: 2026-01-15부터 매주 수요일 주문, 8일 후 17:00 배송 희망, 첫 매장 두번째 메뉴 5개, 배송완료
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

/**
 * @returns {Promise<Array<object>>} 샘플 주문 배열 (실제 DB 없음)
 */
async function getAdminSampleOrders() {
  const stores = await getStores();
  if (!stores || stores.length === 0) return [];
  const firstStore = stores[0];
  const menus = await getMenus(firstStore.id);
  if (!menus || menus.length === 0) return [];
  const menu1 = menus[0];
  const menu2 = menus[1] || menus[0];

  const orders = [];
  const startYmd = '2026-01-15';

  // 사용자-1: 매주 월요일 (1), 8일 후 19:00
  const firstMonday = nextWeekdayAfter(startYmd, 1);
  for (let i = 0; i < 8; i++) {
    const orderDate = addDays(firstMonday, i * 7);
    const deliveryDate = addDays(orderDate, 8);
    const totalAmount = (menu1.price || 0) * 5;
    orders.push({
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
      status: 'delivery_completed',
      created_at: `${orderDate}T10:00:00+09:00`,
    });
  }

  // 사용자-2: 매주 수요일 (3), 8일 후 17:00
  const firstWednesday = nextWeekdayAfter(startYmd, 3);
  for (let i = 0; i < 8; i++) {
    const orderDate = addDays(firstWednesday, i * 7);
    const deliveryDate = addDays(orderDate, 8);
    const totalAmount = (menu2.price || 0) * 5;
    orders.push({
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
      status: 'delivery_completed',
      created_at: `${orderDate}T10:00:00+09:00`,
    });
  }

  return orders;
}

module.exports = { getAdminSampleOrders };
