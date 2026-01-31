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
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error('UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required');
  }
  return new Redis({ url, token });
}

const CODE_TTL_SECONDS = 600; // 10분

async function saveAuthCode(email, code) {
  const redis = getRedis();
  const key = `auth:code:${email}`;
  await redis.set(key, code, { ex: CODE_TTL_SECONDS });
}

async function getAndDeleteAuthCode(email, code) {
  const redis = getRedis();
  const key = `auth:code:${email}`;
  const stored = await redis.get(key);
  if (stored !== code) return false;
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

module.exports = {
  saveAuthCode,
  getAndDeleteAuthCode,
  getUser,
  createUser,
  updateUserLogin,
  createOrder,
};
