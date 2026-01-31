/**
 * Redis (Upstash) 데이터 레이어
 * Key 구조:
 * - user:{email} = JSON 사용자 정보
 * - auth:code:{email} = 6자리 코드 (TTL 10분)
 * - orders:next_id = 숫자 (자동 증가)
 * - order:{id} = JSON 주문 정보
 * - orders:by_user:{email} = Sorted Set (score=timestamp, member=orderId)
 */

const { Redis } = require('@upstash/redis');

function getRedis() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error('KV_REST_API_URL and KV_REST_API_TOKEN (or UPSTASH_* equivalents) are required');
  }
  return new Redis({ url, token });
}

const CODE_TTL_SECONDS = 120; // 2분

function normalizeCode(input) {
  return String(input || '').replace(/\D/g, '').slice(0, 6);
}

async function saveAuthCode(email, code) {
  const redis = getRedis();
  const key = `auth:code:${email}`;
  await redis.set(key, String(code), { ex: CODE_TTL_SECONDS });
}

async function getAndDeleteAuthCode(email, code) {
  const redis = getRedis();
  const key = `auth:code:${email}`;
  const stored = await redis.get(key);
  const normalizedInput = normalizeCode(code);
  const normalizedStored = String(stored || '').replace(/\D/g, '');
  if (normalizedInput.length !== 6 || normalizedInput !== normalizedStored) {
    return false;
  }
  await redis.del(key);
  return true;
}

async function getUser(email) {
  const redis = getRedis();
  const raw = await redis.get(`user:${email}`);
  if (!raw) return null;
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

async function createUser(email, level) {
  const redis = getRedis();
  const user = {
    email,
    level,
    created_at: new Date().toISOString(),
    last_login: null,
    is_first_login: true,
  };
  await redis.set(`user:${email}`, JSON.stringify(user));
  return user;
}

async function updateUserLogin(email) {
  const redis = getRedis();
  const raw = await redis.get(`user:${email}`);
  if (!raw) return null;
  const user = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const isFirstLogin = user.is_first_login === true;
  user.last_login = new Date().toISOString();
  user.is_first_login = false;
  await redis.set(`user:${email}`, JSON.stringify(user));
  return { ...user, is_first_login: isFirstLogin };
}

async function getNextOrderId() {
  const redis = getRedis();
  return await redis.incr('orders:next_id');
}

async function createOrder(orderData) {
  const redis = getRedis();
  const id = await getNextOrderId();
  const order = {
    id,
    ...orderData,
    status: 'pending',
    created_at: new Date().toISOString(),
  };
  const key = `order:${id}`;
  await redis.set(key, JSON.stringify(order));
  const score = Date.now();
  await redis.zadd(`orders:by_user:${order.user_email}`, { score, member: String(id) });
  return order;
}

// ===== Stores & Menus (Admin) =====

const STORES_KEY = 'app:stores';

const DEFAULT_STORES = [
  { id: 'bento', slug: 'bento', title: '도시락', payment: { accountHolder: '(주)케이터링서비스', bankName: '신한은행', accountNumber: '110-123-456789' } },
  { id: 'side', slug: 'side', title: '반찬', payment: { accountHolder: '(주)케이터링서비스', bankName: '신한은행', accountNumber: '110-123-456789' } },
  { id: 'salad', slug: 'salad', title: '샐러드', payment: { accountHolder: '(주)케이터링서비스', bankName: '신한은행', accountNumber: '110-123-456789' } },
  { id: 'beverage', slug: 'beverage', title: '음료', payment: { accountHolder: '(주)케이터링서비스', bankName: '신한은행', accountNumber: '110-123-456789' } },
  { id: 'dessert', slug: 'dessert', title: '디저트', payment: { accountHolder: '(주)케이터링서비스', bankName: '신한은행', accountNumber: '110-123-456789' } },
];

const DEFAULT_MENUS = {
  bento: [
    { id: 'bento-1', name: '삼겹살 덮밥', price: 100000, description: '구운 삼겹살과 야채가 듬뿍 들어간 든든한 덮밥입니다.', imageUrl: '' },
    { id: 'bento-2', name: '불고기 덮밥', price: 8000, description: '달콤한 양념에 재운 불고기가 가득한 인기 메뉴입니다.', imageUrl: '' },
    { id: 'bento-3', name: '치킨까스 도시락', price: 7500, description: '바삭한 치킨 커틀릿과 신선한 채소가 들어있습니다.', imageUrl: '' },
    { id: 'bento-4', name: '제육덮밥', price: 7500, description: '매콤한 제육볶음이 올라간 밥입니다.', imageUrl: '' },
    { id: 'bento-5', name: '김치찌개 정식', price: 7000, description: '얼큰한 김치찌개와 밥, 반찬이 포함된 정식입니다.', imageUrl: '' },
    { id: 'bento-6', name: '연어덮밥', price: 9000, description: '신선한 연어와 아보카도가 올라간 프리미엄 덮밥입니다.', imageUrl: '' },
  ],
  side: [
    { id: 'side-1', name: '김치 (소)', price: 2000, description: '직접 담근 맛있는 배추김치 소량입니다.', imageUrl: '' },
    { id: 'side-2', name: '김치 (대)', price: 4000, description: '직접 담근 맛있는 배추김치 대량입니다.', imageUrl: '' },
    { id: 'side-3', name: '계란말이', price: 3000, description: '부드럽고 폭신한 계란말이입니다.', imageUrl: '' },
    { id: 'side-4', name: '감자조림', price: 2500, description: '달콤 짭조름한 간장 감자조림입니다.', imageUrl: '' },
    { id: 'side-5', name: '멸치볶음', price: 2500, description: '고소한 멸치 볶음 반찬입니다.', imageUrl: '' },
    { id: 'side-6', name: '잡채', price: 3500, description: '당면과 각종 야채가 들어간 잡채입니다.', imageUrl: '' },
  ],
  salad: [
    { id: 'salad-1', name: '코울슬로', price: 3000, description: '상큼한 양배추 샐러드입니다.', imageUrl: '' },
    { id: 'salad-2', name: '양념감자', price: 3500, description: '매콤달콤한 양념 감자 샐러드입니다.', imageUrl: '' },
    { id: 'salad-3', name: '그린샐러드', price: 4000, description: '신선한 채소만으로 구성된 샐러드입니다.', imageUrl: '' },
    { id: 'salad-4', name: '콥샐러드', price: 4500, description: '닭가슴살, 베이컨, 아보카도가 들어간 샐러드입니다.', imageUrl: '' },
    { id: 'salad-5', name: '시저샐러드', price: 5000, description: '크루통과 파마산 치즈가 들어간 시저 샐러드입니다.', imageUrl: '' },
  ],
  beverage: [
    { id: 'beverage-1', name: '생수 500ml', price: 500, description: '개인용 생수 한 병입니다.', imageUrl: '' },
    { id: 'beverage-2', name: '생수 2L', price: 1500, description: '단체용 대용량 생수입니다.', imageUrl: '' },
    { id: 'beverage-3', name: '콜라', price: 1000, description: '시원한 탄산음료 콜라입니다.', imageUrl: '' },
    { id: 'beverage-4', name: '사이다', price: 1000, description: '시원한 탄산음료 사이다입니다.', imageUrl: '' },
    { id: 'beverage-5', name: '아이스티', price: 1500, description: '복숭아 맛 아이스티입니다.', imageUrl: '' },
    { id: 'beverage-6', name: '주스', price: 1500, description: '신선한 과일 주스입니다.', imageUrl: '' },
  ],
  dessert: [
    { id: 'dessert-1', name: '과일', price: 2000, description: '신선한 제철 과일 모음입니다.', imageUrl: '' },
    { id: 'dessert-2', name: '요거트', price: 1500, description: '부드러운 플레인 요거트입니다.', imageUrl: '' },
    { id: 'dessert-3', name: '케이크', price: 3500, description: '달콤한 미니 케이크입니다.', imageUrl: '' },
    { id: 'dessert-4', name: '쿠키', price: 1000, description: '바삭한 수제 쿠키입니다.', imageUrl: '' },
  ],
};

async function getStores() {
  const redis = getRedis();
  const raw = await redis.get(STORES_KEY);
  if (raw) {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  }
  await seedStoresAndMenus();
  return DEFAULT_STORES;
}

async function seedStoresAndMenus() {
  const redis = getRedis();
  await redis.set(STORES_KEY, JSON.stringify(DEFAULT_STORES));
  for (const [storeId, menus] of Object.entries(DEFAULT_MENUS)) {
    await redis.set(`app:menus:${storeId}`, JSON.stringify(menus));
  }
}

async function getMenus(storeId) {
  const redis = getRedis();
  const raw = await redis.get(`app:menus:${storeId}`);
  if (raw) {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  }
  return DEFAULT_MENUS[storeId] || [];
}

async function saveStoresAndMenus(stores, menusByStore) {
  const redis = getRedis();
  await redis.set(STORES_KEY, JSON.stringify(stores));
  for (const [storeId, menus] of Object.entries(menusByStore)) {
    await redis.set(`app:menus:${storeId}`, JSON.stringify(menus));
  }
}

async function getMenuDataForApp() {
  const stores = await getStores();
  const result = {};
  for (const store of stores) {
    const items = await getMenus(store.id);
    result[store.slug] = { title: store.title, items, payment: store.payment };
  }
  return result;
}

module.exports = {
  saveAuthCode,
  getAndDeleteAuthCode,
  getUser,
  createUser,
  updateUserLogin,
  createOrder,
  getStores,
  getMenus,
  saveStoresAndMenus,
  getMenuDataForApp,
  getRedis,
};
