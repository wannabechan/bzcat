/**
 * API 유틸리티 함수
 */

const jwt = require('jsonwebtoken');

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

/** admin 또는 operator(보조 관리자) 여부 */
function isAdminOrOperator(user) {
  return user && (user.level === 'admin' || user.level === 'operator');
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
  response.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');
}

/**
 * API 응답 헬퍼
 */
function apiResponse(response, status, data) {
  setCorsHeaders(response);
  response.status(status).json(data);
}

module.exports = {
  generateToken,
  verifyToken,
  getUserLevel,
  isAdminOrOperator,
  generateCode,
  setCorsHeaders,
  apiResponse,
};
