/**
 * GET /api/auth/session
 * JWT 토큰으로 세션 검증
 */

const { verifyToken, apiResponse } = require('../_utils');

module.exports = async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return apiResponse(res, 200, {});
  }

  if (req.method !== 'GET') {
    return apiResponse(res, 405, { error: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return apiResponse(res, 401, { error: '인증 토큰이 필요합니다.' });
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token);

    if (!decoded) {
      return apiResponse(res, 401, { error: '유효하지 않은 토큰입니다.' });
    }

    return apiResponse(res, 200, {
      success: true,
      user: {
        email: decoded.email,
        level: decoded.level,
      },
    });

  } catch (error) {
    console.error('Session verification error:', error);
    return apiResponse(res, 500, { error: '서버 오류가 발생했습니다.' });
  }
};
