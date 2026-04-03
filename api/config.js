/**
 * GET /api/config
 * 공개 설정 값 (프론트에서 사용, 인증 불필요)
 * emailAdmin: 문의용 이메일 (환경변수 EMAIL_ADMIN)
 * minOrderPrice: 최소 주문 금액 (환경변수 MIN_ORDERPRICE)
 * tossApiClientKey: API 개별 연동 클라이언트 키 (환경변수 PAYKEY_BZCAT_API_CLIENT)
 * commissionPercent: 정산 수수료율 % (환경변수 BZCAT_COMMISSION)
 */

const { apiResponse } = require('./_utils');
const { getCommissionPercent } = require('./_commission');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    return apiResponse(res, 200, {});
  }

  if (req.method !== 'GET') {
    return apiResponse(res, 405, { error: 'Method not allowed' });
  }

  try {
    const emailAdmin = process.env.EMAIL_ADMIN || '';
    const envMinOrderPrice = Number(process.env.MIN_ORDERPRICE);
    const minOrderPrice = Number.isFinite(envMinOrderPrice) && envMinOrderPrice >= 1
      ? Math.floor(envMinOrderPrice)
      : 100;
    const tossApiClientKey = (process.env.PAYKEY_BZCAT_API_CLIENT || '').trim();
    return apiResponse(res, 200, {
      emailAdmin,
      minOrderPrice,
      tossApiClientKey,
      commissionPercent: getCommissionPercent(),
    });
  } catch (error) {
    console.error('Config error:', error);
    return apiResponse(res, 500, {
      emailAdmin: '',
      minOrderPrice: 100,
      tossApiClientKey: '',
      commissionPercent: 18,
    });
  }
};
