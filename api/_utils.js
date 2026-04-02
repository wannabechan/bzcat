/**
 * API 유틸리티 함수
 */

const jwt = require('jsonwebtoken');

/** HttpOnly 세션 쿠키 (JWT). Bearer 헤더와 병행 지원(이전 클라이언트·외부 도구 호환). */
const SESSION_COOKIE_NAME = 'bzcat_session';
/** generateToken expiresIn: '3d' 와 동일 */
const JWT_MAX_AGE_SEC = 3 * 24 * 60 * 60;

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 16) {
  throw new Error('JWT_SECRET is required and must be at least 16 characters. Set it in Vercel Environment Variables (and .env.local for local dev).');
}

/**
 * JWT 토큰 생성
 */
function generateToken(email, level) {
  return jwt.sign(
    { email, level },
    JWT_SECRET,
    { expiresIn: '3d' }
  );
}

/**
 * JWT 토큰 검증
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

/**
 * 사용자 레벨 결정
 * - EMAIL_ADMIN: admin
 * - EMAIL_OPERATOR: operator (보조 관리자, 쉼표 구분 복수 가능)
 * - 그 외: user
 */
function getUserLevel(email) {
  const normalized = (email || '').toLowerCase().trim();
  const adminEmail = (process.env.EMAIL_ADMIN || '').toLowerCase().trim();
  if (adminEmail && normalized === adminEmail) return 'admin';
  const operatorList = (process.env.EMAIL_OPERATOR || '').toLowerCase().trim().split(',').map((e) => e.trim()).filter(Boolean);
  if (operatorList.length && operatorList.includes(normalized)) return 'operator';
  return 'user';
}

/**
 * 매장 담당자 메일 + EMAIL_OPERATOR(쉼표 구분) 동일 발송용 수신 목록. 대소문자 무시 중복 제거.
 * @param {string} [storeContactEmail] 매장 storeContactEmail
 * @returns {string[]}
 */
function getStoreNotificationEmailRecipients(storeContactEmail) {
  const primary = (storeContactEmail || '').trim();
  const operators = (process.env.EMAIL_OPERATOR || '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);
  const seen = new Set();
  const out = [];
  const add = (addr) => {
    const a = (addr || '').trim();
    if (!a) return;
    const key = a.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(a);
  };
  add(primary);
  operators.forEach(add);
  return out;
}

/** admin 또는 operator(보조 관리자) 여부 */
function isAdminOrOperator(user) {
  return user && (user.level === 'admin' || user.level === 'operator');
}

/** JWT decoded에 환경변수 기준 현재 레벨 반영 (세션/API에서 사용) */
function withResolvedLevel(decoded) {
  if (!decoded || !decoded.email) return null;
  return { ...decoded, level: getUserLevel(decoded.email) };
}

/**
 * 6자리 랜덤 코드 생성
 */
function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * CORS 헤더 설정
 * production에서는 APP_ORIGIN만 허용(미설정 시 빈 값 → 크로스오리진 차단). 개발 시 미설정이면 '*'.
 */
function setCorsHeaders(response) {
  const envOrigin = (process.env.APP_ORIGIN || '').trim();
  const isProduction = process.env.NODE_ENV === 'production';
  const allowOrigin = isProduction ? envOrigin : (envOrigin || '*');
  response.setHeader('Access-Control-Allow-Credentials', 'true');
  response.setHeader('Access-Control-Allow-Origin', allowOrigin || 'null');
  response.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  response.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, Cookie'
  );
}

/**
 * Authorization: Bearer 우선, 없으면 HttpOnly 쿠키(bzcat_session)에서 JWT 추출
 */
function getTokenFromRequest(req) {
  const getCookieToken = () => {
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader || typeof cookieHeader !== 'string') return '';
    const parts = cookieHeader.split(';');
    const prefix = `${SESSION_COOKIE_NAME}=`;
    for (let i = 0; i < parts.length; i += 1) {
      const segment = parts[i].trim();
      if (segment.startsWith(prefix)) {
        const rawVal = segment.slice(prefix.length);
        if (!rawVal) return '';
        try {
          return decodeURIComponent(rawVal);
        } catch (_) {
          return rawVal;
        }
      }
    }
    return '';
  };

  const authHeader = req.headers.authorization;
  if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const t = authHeader.substring(7).trim();
    if (t && t !== 'null' && t !== 'undefined') {
      // 만료/훼손 Bearer가 있어도 쿠키 세션이 유효하면 정상 동작하도록 fallback
      if (verifyToken(t)) return t;
      const cookieToken = getCookieToken();
      return cookieToken || t;
    }
  }
  return getCookieToken();
}

function isSecureForSessionCookie(req) {
  if (process.env.NODE_ENV === 'production') return true;
  const proto = (req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  return proto === 'https';
}

function buildSessionSetCookie(token, req) {
  const value = encodeURIComponent(token);
  const parts = [
    `${SESSION_COOKIE_NAME}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${JWT_MAX_AGE_SEC}`,
  ];
  if (isSecureForSessionCookie(req)) parts.push('Secure');
  return parts.join('; ');
}

function buildSessionClearCookie(req) {
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (isSecureForSessionCookie(req)) parts.push('Secure');
  return parts.join('; ');
}

function setSessionCookie(res, req, token) {
  res.setHeader('Set-Cookie', buildSessionSetCookie(token, req));
}

function clearSessionCookie(res, req) {
  res.setHeader('Set-Cookie', buildSessionClearCookie(req));
}

/**
 * API 응답 헬퍼
 */
function apiResponse(response, status, data) {
  setCorsHeaders(response);
  response.status(status).json(data);
}

/**
 * Bearer 토큰 검증 후 사용자 반환. 실패 시 401 응답 후 null 반환.
 * @param {object} req - request (req.headers.authorization)
 * @param {object} res - response
 * @param {{ resolveLevel?: boolean }} [opts] - resolveLevel true면 withResolvedLevel 적용
 */
function requireAuth(req, res, opts = {}) {
  const token = getTokenFromRequest(req);
  if (!token) {
    apiResponse(res, 401, { error: '로그인이 필요합니다.' });
    return null;
  }
  const decoded = verifyToken(token);
  if (!decoded) {
    apiResponse(res, 401, { error: '로그인이 필요합니다.' });
    return null;
  }
  return opts.resolveLevel ? withResolvedLevel(decoded) : decoded;
}

module.exports = {
  generateToken,
  verifyToken,
  getUserLevel,
  getStoreNotificationEmailRecipients,
  isAdminOrOperator,
  withResolvedLevel,
  generateCode,
  setCorsHeaders,
  apiResponse,
  requireAuth,
  getTokenFromRequest,
  setSessionCookie,
  clearSessionCookie,
  SESSION_COOKIE_NAME,
  JWT_MAX_AGE_SEC,
};
