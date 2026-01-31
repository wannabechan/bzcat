/**
 * POST /api/auth/verify-code
 * 인증 코드 검증 및 JWT 토큰 발급
 */

const { sql } = require('@vercel/postgres');
const { generateToken, getUserLevel, apiResponse } = require('../_utils');

module.exports = async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return apiResponse(res, 200, {});
  }

  if (req.method !== 'POST') {
    return apiResponse(res, 405, { error: 'Method not allowed' });
  }

  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return apiResponse(res, 400, { error: '이메일과 코드를 입력해 주세요.' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // 유효한 코드 조회
    const result = await sql`
      SELECT * FROM auth_codes
      WHERE email = ${normalizedEmail}
        AND code = ${code}
        AND used = false
        AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1
    `;

    if (result.rows.length === 0) {
      return apiResponse(res, 401, { error: '인증 코드가 유효하지 않거나 만료되었습니다.' });
    }

    // 코드 사용 처리
    await sql`
      UPDATE auth_codes
      SET used = true
      WHERE id = ${result.rows[0].id}
    `;

    // 사용자 확인 및 생성
    let user = await sql`
      SELECT * FROM users WHERE email = ${normalizedEmail}
    `;

    let isFirstLogin = false;

    if (user.rows.length === 0) {
      // 신규 사용자 생성
      const level = getUserLevel(normalizedEmail);
      await sql`
        INSERT INTO users (email, level, is_first_login)
        VALUES (${normalizedEmail}, ${level}, true)
      `;
      
      user = await sql`
        SELECT * FROM users WHERE email = ${normalizedEmail}
      `;
      isFirstLogin = true;
    } else {
      // 기존 사용자
      isFirstLogin = user.rows[0].is_first_login;
      
      // 마지막 로그인 시간 업데이트 및 첫 로그인 플래그 제거
      await sql`
        UPDATE users
        SET last_login = NOW(), is_first_login = false
        WHERE email = ${normalizedEmail}
      `;
    }

    const userData = user.rows[0];
    const token = generateToken(normalizedEmail, userData.level);

    return apiResponse(res, 200, {
      success: true,
      token,
      user: {
        email: userData.email,
        level: userData.level,
      },
      isFirstLogin,
    });

  } catch (error) {
    console.error('Verify code error:', error);
    return apiResponse(res, 500, { error: '서버 오류가 발생했습니다.' });
  }
};
