/**
 * API 유틸리티 함수
 */

const jwt = require('jsonwebtoken');

const rawSecret = process.env.JWT_SECRET;
if (process.env.NODE_ENV === 'production' && !rawSecret) {
  throw new Error('JWT_SECRET is required in production. Set it in Vercel Environment Variables.');
}
const JWT_SECRET = rawSecret || 'default-secret-change-in-production';

/**
 * JWT 토큰 생성
 */
function generateToken(email, level) {
  return jwt.sign(
    { email, level },
    JWT_SECRET,
    { expiresIn: '7d' }
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
 * 사용자 레벨 결정 (관리자 이메일은 Vercel 환경 변수 EMAIL_ADMIN 사용)
 */
function getUserLevel(email) {
  const normalized = (email || '').toLowerCase().trim();
  const adminEmail = (process.env.EMAIL_ADMIN || '').toLowerCase().trim();
  if (adminEmail && normalized === adminEmail) return 'admin';
  return 'user';
}

/**
 * 6자리 랜덤 코드 생성
 */
function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * CORS 헤더 설정
 */
function setCorsHeaders(response) {
  response.setHeader('Access-Control-Allow-Credentials', 'true');
  response.setHeader('Access-Control-Allow-Origin', '*');
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
  generateCode,
  setCorsHeaders,
  apiResponse,
};
