/**
 * Redis (Upstash) 데이터 레이어
 * Key 구조:
 * - user:{email} = JSON 사용자 정보
 * - auth:code:{email} = 6자리 코드 (TTL 2분, CODE_TTL_SECONDS)
 * - orders:count:{yymmdd} = 해당일 주문 건수 (INCR)
 * - order:{id} = JSON 주문 정보 (id = yymmdd000 형식)
 * - orders:by_user:{email} = Sorted Set (score=timestamp, member=orderId)
 */

const { Redis } = require('@upstash/redis');
const { getYymmddKST: getYymmddKSTFromKst } = require('./_kst');
const { getSlugFromItemId } = require('./_order-display');

let _redisClient = null;

function getRedis() {
  if (_redisClient) return _redisClient;
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error('KV_REST_API_URL and KV_REST_API_TOKEN (or UPSTASH_* equivalents) are required');
  }
  _redisClient = new Redis({ url, token });
  return _redisClient;
}

const CODE_TTL_SECONDS = 120; // 2분
const BUSINESS_HOURS_SLOTS = ['09:00-10:00', '10:00-11:00', '11:00-12:00', '12:00-13:00', '13:00-14:00', '14:00-15:00', '15:00-16:00', '16:00-17:00', '17:00-18:00', '18:00-19:00', '19:00-20:00', '20:00-21:00'];

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

async function getAllUsers() {
  const redis = getRedis();
  const keys = await redis.keys('user:*');
  if (!Array.isArray(keys) || keys.length === 0) return [];
  const raws = await redis.mget(...keys);
  const users = [];
  for (const raw of raws || []) {
    if (!raw) continue;
    users.push(typeof raw === 'string' ? JSON.parse(raw) : raw);
  }
  return users;
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
  const yymmdd = getYymmddKSTFromKst();
  const count = await redis.incr(`orders:count:${yymmdd}`);
  return `${yymmdd}${String(count).padStart(3, '0')}`;
}

async function createOrder(orderData) {
  const redis = getRedis();
  const id = await getNextOrderId();
  const created_at = new Date().toISOString();
  const order = {
    id,
    ...orderData,
    status: 'submitted',
    created_at,
    status_history: [{ s: 'submitted', at: created_at, by: orderData.user_email || 'system' }],
  };
  const key = `order:${id}`;
  await redis.set(key, JSON.stringify(order));
  const score = Date.now();
  await redis.zadd(`orders:by_user:${order.user_email}`, { score, member: String(id) });
  return order;
}

async function getOrdersByUser(email) {
  const redis = getRedis();
  const ids = await redis.zrange(`orders:by_user:${email}`, 0, -1, { rev: true });
  if (!ids || ids.length === 0) return [];
  const keys = ids.map((id) => `order:${id}`);
  const raws = await redis.mget(...keys);
  const orders = [];
  for (let i = 0; i < raws.length; i++) {
    const raw = raws[i];
    if (raw) {
      const order = typeof raw === 'string' ? JSON.parse(raw) : raw;
      orders.push(order);
    }
  }
  return orders;
}

async function getOrderById(orderId) {
  const redis = getRedis();
  const raw = await redis.get(`order:${orderId}`);
  if (!raw) return null;
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

const ORDER_DELETIONS_KEY = 'order:deletions';

async function saveDeletionRecord(orderSnapshot, deletedBy) {
  const redis = getRedis();
  const record = {
    order_id: orderSnapshot.id,
    deleted_at: new Date().toISOString(),
    deleted_by: deletedBy || 'system',
    order_snapshot: orderSnapshot,
  };
  await redis.rpush(ORDER_DELETIONS_KEY, JSON.stringify(record));
}

async function getDeletionRecordsForDate(dateStr) {
  const redis = getRedis();
  const raw = await redis.lrange(ORDER_DELETIONS_KEY, 0, -1);
  if (!raw || raw.length === 0) return [];
  const list = [];
  for (let i = 0; i < raw.length; i++) {
    try {
      const rec = typeof raw[i] === 'string' ? JSON.parse(raw[i]) : raw[i];
      const deletedAt = rec.deleted_at || '';
      const deletedDate = deletedAt.slice(0, 10);
      if (deletedDate === dateStr) list.push(rec);
    } catch (_) {}
  }
  return list;
}

async function deleteOrder(orderId, deletedBy) {
  const redis = getRedis();
  const order = await getOrderById(orderId);
  if (!order) return false;
  await saveDeletionRecord(order, deletedBy);
  await redis.del(`order:${orderId}`);
  await redis.zrem(`orders:by_user:${order.user_email}`, orderId);
  return true;
}

function appendStatusHistory(order, status, actor) {
  if (!order.status_history) order.status_history = [];
  order.status_history.push({
    s: status,
    at: new Date().toISOString(),
    by: actor || 'system',
  });
}

function uniqueOrderMenuItemIds(order) {
  const items = order.order_items || order.orderItems || [];
  const ids = new Set();
  for (const it of items) {
    const id = String(it.id || '').trim();
    if (id && id !== 'etc-fee') ids.add(id);
  }
  return [...ids];
}

function resolveStoreIdForMenuItem(itemId, stores) {
  const slug = getSlugFromItemId(itemId, stores);
  const s = (stores || []).find((st) => String(st.id || st.slug || '').toLowerCase() === slug);
  return s ? String(s.id || s.slug) : null;
}

/**
 * 주문에 포함된 메뉴 id별로 likePoints / orderPoints 조정 (매장별 메뉴 JSON 갱신)
 * @param {{ likeDelta?: number, orderDelta?: number }} deltas
 */
async function adjustMenuPointsForOrder(order, stores, deltas) {
  const likeDelta = Number(deltas.likeDelta) || 0;
  const orderDelta = Number(deltas.orderDelta) || 0;
  if (!likeDelta && !orderDelta) return;
  const itemIds = uniqueOrderMenuItemIds(order);
  if (itemIds.length === 0) return;

  const byStore = new Map();
  for (const itemId of itemIds) {
    const storeId = resolveStoreIdForMenuItem(itemId, stores);
    if (!storeId) continue;
    if (!byStore.has(storeId)) byStore.set(storeId, new Set());
    byStore.get(storeId).add(itemId);
  }

  const redis = getRedis();
  for (const [storeId, idSet] of byStore) {
    let menus = await getMenus(storeId);
    let changed = false;
    const next = menus.map((m) => {
      if (!idSet.has(m.id)) return m;
      changed = true;
      const likePoints = Math.max(0, (Number(m.likePoints) || 0) + likeDelta);
      const orderPoints = Math.max(0, (Number(m.orderPoints) || 0) + orderDelta);
      return { ...m, likePoints, orderPoints };
    });
    if (changed) await redis.set(`app:menus:${storeId}`, JSON.stringify(next));
  }
}

async function updateOrderStatus(orderId, status, actor) {
  const redis = getRedis();
  const order = await getOrderById(orderId);
  if (!order) return null;
  const by = actor === undefined || actor === null ? 'system' : String(actor);
  const prevStatus = order.status;
  appendStatusHistory(order, status, by);
  order.status = status;

  if (status === 'delivery_completed' && prevStatus !== 'delivery_completed') {
    if (!order.order_points_applied) {
      try {
        const stores = await getStores();
        await adjustMenuPointsForOrder(order, stores, { orderDelta: 1 });
        order.order_points_applied = true;
      } catch (e) {
        console.error('order_points apply on delivery_completed:', e);
      }
    }
  }

  await redis.set(`order:${orderId}`, JSON.stringify(order));
  return order;
}

async function updateOrderCancelReason(orderId, cancelReason) {
  const redis = getRedis();
  const order = await getOrderById(orderId);
  if (!order) return null;
  order.cancel_reason = cancelReason || null;
  await redis.set(`order:${orderId}`, JSON.stringify(order));
  return order;
}

async function updateOrderPdfUrl(orderId, pdfUrl) {
  const redis = getRedis();
  const order = await getOrderById(orderId);
  if (!order) return null;
  order.pdf_url = pdfUrl;
  await redis.set(`order:${orderId}`, JSON.stringify(order));
  return order;
}

async function updateOrderPaymentLink(orderId, paymentLink) {
  const redis = getRedis();
  const order = await getOrderById(orderId);
  if (!order) return null;
  order.payment_link = paymentLink || '';
  if (!(paymentLink || '').trim() && order.status === 'payment_link_issued') {
    order.status = 'order_accepted';
  }
  await redis.set(`order:${orderId}`, JSON.stringify(order));
  return order;
}

async function updateOrderShippingNumber(orderId, trackingNumber, actor, actualDeliveryFee) {
  const redis = getRedis();
  const order = await getOrderById(orderId);
  if (!order) return null;
  order.tracking_number = (trackingNumber || '').trim();
  const feeNum = Number(actualDeliveryFee);
  if (Number.isFinite(feeNum) && feeNum >= 0) {
    order.actual_delivery_fee = Math.floor(feeNum);
  }
  if (order.status === 'payment_completed') {
    appendStatusHistory(order, 'shipping', actor === undefined || actor === null ? 'system' : String(actor));
    order.status = 'shipping';
  }
  await redis.set(`order:${orderId}`, JSON.stringify(order));
  return order;
}

async function updateOrderAcceptToken(orderId, token) {
  const redis = getRedis();
  const order = await getOrderById(orderId);
  if (!order) return null;
  order.accept_token = token === undefined || token === null ? null : String(token);
  await redis.set(`order:${orderId}`, JSON.stringify(order));
  return order;
}

async function updateOrderTossPaymentKey(orderId, paymentKey) {
  const redis = getRedis();
  const order = await getOrderById(orderId);
  if (!order) return null;
  order.toss_payment_key = paymentKey == null || paymentKey === '' ? null : String(paymentKey).trim();
  await redis.set(`order:${orderId}`, JSON.stringify(order));
  return order;
}

async function updateOrderUserAsOrderSent(orderId) {
  const redis = getRedis();
  const order = await getOrderById(orderId);
  if (!order) return null;
  order.user_as_order_sent = true;
  await redis.set(`order:${orderId}`, JSON.stringify(order));
  return order;
}

/** 주문 JSON 전체 저장 (PII 익명화 등) */
async function saveOrderDocument(order) {
  const redis = getRedis();
  if (!order || !order.id) throw new Error('saveOrderDocument: order.id required');
  await redis.set(`order:${order.id}`, JSON.stringify(order));
  return order;
}

async function listOrderDeletionRecordsRaw() {
  const redis = getRedis();
  const raw = await redis.lrange(ORDER_DELETIONS_KEY, 0, -1);
  return raw || [];
}

async function setOrderDeletionRecordAtIndex(index, recordObj) {
  const redis = getRedis();
  await redis.lset(ORDER_DELETIONS_KEY, index, JSON.stringify(recordObj));
}

async function getAllOrders() {
  const redis = getRedis();
  const keys = await redis.keys('order:*');
  if (!keys || keys.length === 0) return [];
  const raws = await redis.mget(...keys);
  const orders = [];
  for (let i = 0; i < raws.length; i++) {
    const raw = raws[i];
    if (raw) {
      const order = typeof raw === 'string' ? JSON.parse(raw) : raw;
      orders.push(order);
    }
  }
  orders.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  return orders;
}

// ===== Stores & Menus (Admin) =====

const STORES_KEY = 'app:stores';

const DEFAULT_STORES = [
  { id: 'bento', slug: 'bento', title: '도시락' },
  { id: 'side', slug: 'side', title: '반찬' },
  { id: 'salad', slug: 'salad', title: '샐러드' },
  { id: 'beverage', slug: 'beverage', title: '음료' },
  { id: 'dessert', slug: 'dessert', title: '디저트' },
];

const DEFAULT_MENUS = {
  bento: [
    { id: 'bento-1', name: '삼겹살 덮밥', price: 100000, description: '구운 삼겹살과 야채가 듬뿍 들어간 든든한 덮밥입니다.', imageUrl: '', origin: '' },
    { id: 'bento-2', name: '불고기 덮밥', price: 8000, description: '달콤한 양념에 재운 불고기가 가득한 인기 메뉴입니다.', imageUrl: '', origin: '' },
    { id: 'bento-3', name: '치킨까스 도시락', price: 7500, description: '바삭한 치킨 커틀릿과 신선한 채소가 들어있습니다.', imageUrl: '', origin: '' },
    { id: 'bento-4', name: '제육덮밥', price: 7500, description: '매콤한 제육볶음이 올라간 밥입니다.', imageUrl: '', origin: '' },
    { id: 'bento-5', name: '김치찌개 정식', price: 7000, description: '얼큰한 김치찌개와 밥, 반찬이 포함된 정식입니다.', imageUrl: '', origin: '' },
    { id: 'bento-6', name: '연어덮밥', price: 9000, description: '신선한 연어와 아보카도가 올라간 프리미엄 덮밥입니다.', imageUrl: '', origin: '' },
  ],
  side: [
    { id: 'side-1', name: '김치 (소)', price: 2000, description: '직접 담근 맛있는 배추김치 소량입니다.', imageUrl: '', origin: '' },
    { id: 'side-2', name: '김치 (대)', price: 4000, description: '직접 담근 맛있는 배추김치 대량입니다.', imageUrl: '', origin: '' },
    { id: 'side-3', name: '계란말이', price: 3000, description: '부드럽고 폭신한 계란말이입니다.', imageUrl: '', origin: '' },
    { id: 'side-4', name: '감자조림', price: 2500, description: '달콤 짭조름한 간장 감자조림입니다.', imageUrl: '', origin: '' },
    { id: 'side-5', name: '멸치볶음', price: 2500, description: '고소한 멸치 볶음 반찬입니다.', imageUrl: '', origin: '' },
    { id: 'side-6', name: '잡채', price: 3500, description: '당면과 각종 야채가 들어간 잡채입니다.', imageUrl: '', origin: '' },
  ],
  salad: [
    { id: 'salad-1', name: '코울슬로', price: 3000, description: '상큼한 양배추 샐러드입니다.', imageUrl: '', origin: '' },
    { id: 'salad-2', name: '양념감자', price: 3500, description: '매콤달콤한 양념 감자 샐러드입니다.', imageUrl: '', origin: '' },
    { id: 'salad-3', name: '그린샐러드', price: 4000, description: '신선한 채소만으로 구성된 샐러드입니다.', imageUrl: '', origin: '' },
    { id: 'salad-4', name: '콥샐러드', price: 4500, description: '닭가슴살, 베이컨, 아보카도가 들어간 샐러드입니다.', imageUrl: '', origin: '' },
    { id: 'salad-5', name: '시저샐러드', price: 5000, description: '크루통과 파마산 치즈가 들어간 시저 샐러드입니다.', imageUrl: '', origin: '' },
  ],
  beverage: [
    { id: 'beverage-1', name: '생수 500ml', price: 500, description: '개인용 생수 한 병입니다.', imageUrl: '', origin: '' },
    { id: 'beverage-2', name: '생수 2L', price: 1500, description: '단체용 대용량 생수입니다.', imageUrl: '', origin: '' },
    { id: 'beverage-3', name: '콜라', price: 1000, description: '시원한 탄산음료 콜라입니다.', imageUrl: '', origin: '' },
    { id: 'beverage-4', name: '사이다', price: 1000, description: '시원한 탄산음료 사이다입니다.', imageUrl: '', origin: '' },
    { id: 'beverage-5', name: '아이스티', price: 1500, description: '복숭아 맛 아이스티입니다.', imageUrl: '', origin: '' },
    { id: 'beverage-6', name: '주스', price: 1500, description: '신선한 과일 주스입니다.', imageUrl: '', origin: '' },
  ],
  dessert: [
    { id: 'dessert-1', name: '과일', price: 2000, description: '신선한 제철 과일 모음입니다.', imageUrl: '', origin: '' },
    { id: 'dessert-2', name: '요거트', price: 1500, description: '부드러운 플레인 요거트입니다.', imageUrl: '', origin: '' },
    { id: 'dessert-3', name: '케이크', price: 3500, description: '달콤한 미니 케이크입니다.', imageUrl: '', origin: '' },
    { id: 'dessert-4', name: '쿠키', price: 1000, description: '바삭한 수제 쿠키입니다.', imageUrl: '', origin: '' },
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
  const previousStores = await getStores();
  const previousIds = new Set((previousStores || []).map((s) => s.id));
  const newIds = new Set((stores || []).map((s) => s.id));
  const removedIds = [...previousIds].filter((id) => !newIds.has(id));
  await redis.set(STORES_KEY, JSON.stringify(stores));
  for (const [storeId, nextMenus] of Object.entries(menusByStore)) {
    const prevMenus = await getMenus(storeId);
    const prevById = new Map((prevMenus || []).map((m) => [m.id, m]));
    const merged = (Array.isArray(nextMenus) ? nextMenus : []).map((m) => {
      const p = prevById.get(m.id);
      const likePoints =
        m && Object.prototype.hasOwnProperty.call(m, 'likePoints') && Number.isFinite(Number(m.likePoints))
          ? Math.floor(Number(m.likePoints))
          : Number(p?.likePoints) || 0;
      const orderPoints =
        m && Object.prototype.hasOwnProperty.call(m, 'orderPoints') && Number.isFinite(Number(m.orderPoints))
          ? Math.floor(Number(m.orderPoints))
          : Number(p?.orderPoints) || 0;
      return { ...m, likePoints, orderPoints };
    });
    await redis.set(`app:menus:${storeId}`, JSON.stringify(merged));
  }
  for (const storeId of removedIds) {
    await redis.del(`app:menus:${storeId}`);
  }
}

async function getMenuDataForApp() {
  const stores = await getStores();
  if (!stores || stores.length === 0) return {};
  const redis = getRedis();
  const menuKeys = stores.map((s) => `app:menus:${s.id}`);
  const menusRaw = await redis.mget(...menuKeys);
  const result = {};
  for (let i = 0; i < stores.length; i++) {
    const raw = menusRaw[i];
    const items = raw
      ? typeof raw === 'string'
        ? JSON.parse(raw)
        : raw
      : DEFAULT_MENUS[stores[i].id] || [];
    const businessDays = stores[i].businessDays && Array.isArray(stores[i].businessDays) ? stores[i].businessDays : [0, 1, 2, 3, 4, 5, 6];
    const businessHours = stores[i].businessHours && Array.isArray(stores[i].businessHours) && stores[i].businessHours.length > 0 ? stores[i].businessHours : BUSINESS_HOURS_SLOTS;
    result[stores[i].slug] = {
      title: stores[i].title,
      items,
      payment: stores[i].payment,
      suburl: (stores[i].suburl || ''),
      brand: (stores[i].brand || ''),
      mapLink: typeof stores[i].mapLink === 'string' ? stores[i].mapLink.trim() : '',
      bizNo: (stores[i].bizNo || ''),
      businessDays,
      businessHours,
      storeContactEmail: (stores[i].storeContactEmail || ''),
      deliveryFee: stores[i].deliveryFee,
      packagingFee: Number.isFinite(Number(stores[i].packagingFee)) && Number(stores[i].packagingFee) >= 0
        ? Math.floor(Number(stores[i].packagingFee))
        : 0,
      maxOrderQuantity: Number.isFinite(Number(stores[i].maxOrderQuantity)) && Number(stores[i].maxOrderQuantity) > 0
        ? Math.floor(Number(stores[i].maxOrderQuantity))
        : 0,
    };
  }
  return result;
}

module.exports = {
  saveAuthCode,
  getAndDeleteAuthCode,
  getUser,
  getAllUsers,
  createUser,
  updateUserLogin,
  createOrder,
  getOrdersByUser,
  getOrderById,
  deleteOrder,
  saveDeletionRecord,
  getDeletionRecordsForDate,
  updateOrderStatus,
  updateOrderCancelReason,
  updateOrderPdfUrl,
  updateOrderPaymentLink,
  updateOrderShippingNumber,
  updateOrderAcceptToken,
  updateOrderTossPaymentKey,
  updateOrderUserAsOrderSent,
  saveOrderDocument,
  listOrderDeletionRecordsRaw,
  setOrderDeletionRecordAtIndex,
  getAllOrders,
  getStores,
  getMenus,
  saveStoresAndMenus,
  getMenuDataForApp,
  getRedis,
  adjustMenuPointsForOrder,
};
