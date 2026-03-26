/**
 * GET /api/auth/session
 * JWT 토큰으로 세션 검증
 * user.isStoreManager: 매장 담당자 이메일로 등록된 매장이 있을 때 true
 */

const { verifyToken, apiResponse, getUserLevel, getTokenFromRequest } = require('../_utils');
const { getStores } = require('../_redis');

function isStoreManagerEmail(email, stores) {
  if (!email || !Array.isArray(stores)) return false;
  const normalized = String(email).trim().toLowerCase();
  return stores.some(
    (s) => (s.storeContactEmail || '').trim().toLowerCase() === normalized
  );
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    return apiResponse(res, 200, {});
  }

  if (req.method !== 'GET') {
    return apiResponse(res, 405, { error: 'Method not allowed' });
  }

  try {
    const token = getTokenFromRequest(req);
    if (!token) {
      return apiResponse(res, 401, { error: '인증 토큰이 필요합니다.' });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      return apiResponse(res, 401, { error: '로그인이 필요합니다.' });
    }

    const stores = await getStores();
    const isStoreManager = isStoreManagerEmail(decoded.email, stores || []);
    // 레벨은 환경변수(EMAIL_ADMIN, EMAIL_OPERATOR) 기준으로 매 요청 시 계산 (토큰 발급 시점이 아닌 현재 설정 반영)
    const level = getUserLevel(decoded.email);

    return apiResponse(res, 200, {
      success: true,
      user: {
        email: decoded.email,
        level,
        isStoreManager: !!isStoreManager,
      },
    });
  } catch (error) {
    console.error('Session verification error:', error);
    return apiResponse(res, 500, { error: '서버 오류가 발생했습니다.' });
  }
};
