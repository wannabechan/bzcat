/**
 * POST /api/auth/logout
 * HttpOnly 세션 쿠키 삭제 (클라이언트는 credentials: 'include' 로 호출)
 */

const { apiResponse, clearSessionCookie } = require('../_utils');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    return apiResponse(res, 200, {});
  }

  if (req.method !== 'POST') {
    return apiResponse(res, 405, { error: 'Method not allowed' });
  }

  try {
    clearSessionCookie(res, req);
    return apiResponse(res, 200, { success: true });
  } catch (error) {
    console.error('Logout error:', error);
    return apiResponse(res, 500, { error: '서버 오류가 발생했습니다.' });
  }
};
