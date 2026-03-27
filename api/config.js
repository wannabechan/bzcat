/**
 * GET /api/config
 * 공개 설정 값 (프론트에서 사용, 인증 불필요)
 * emailAdmin: 문의용 이메일 (환경변수 EMAIL_ADMIN)
 * minOrderPrice: 최소 주문 금액 (환경변수 MIN_ORDERRPICE)
 * tossApiClientKey: API 개별 연동 클라이언트 키 (live_ck_…, PAYKEY_BZCAT_API_SECRET에서 파생)
 */

const { apiResponse } = require('./_utils');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    return apiResponse(res, 200, {});
  }

  if (req.method !== 'GET') {
    return apiResponse(res, 405, { error: 'Method not allowed' });
  }

  try {
    const emailAdmin = process.env.EMAIL_ADMIN || '';
    const envMinOrderPrice = Number(process.env.MIN_ORDERRPICE);
    const minOrderPrice = Number.isFinite(envMinOrderPrice) && envMinOrderPrice >= 1
      ? Math.floor(envMinOrderPrice)
      : 100;
    const apiSecret = (process.env.PAYKEY_BZCAT_API_SECRET || '').trim();
    // Toss API 개별 키는 보통 sk<->ck 페어로 prefix만 다르므로 secret에서 client를 파생
    // 예) live_sk_xxx -> live_ck_xxx, test_sk_xxx -> test_ck_xxx
    let tossApiClientKey = '';
    if (apiSecret.startsWith('live_sk_')) tossApiClientKey = `live_ck_${apiSecret.slice('live_sk_'.length)}`;
    else if (apiSecret.startsWith('test_sk_')) tossApiClientKey = `test_ck_${apiSecret.slice('test_sk_'.length)}`;
    return apiResponse(res, 200, {
      emailAdmin,
      minOrderPrice,
      tossApiClientKey,
    });
  } catch (error) {
    console.error('Config error:', error);
    return apiResponse(res, 500, {
      emailAdmin: '',
      minOrderPrice: 100,
      tossApiClientKey: '',
    });
  }
};
