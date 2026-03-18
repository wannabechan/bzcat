/**
 * GET /api/admin/order?orderId=xxx
 * 단일 주문 전체 조회 (admin/operator - 주문 상세 팝업용)
 * slugToDisplayName: 주문에 등장하는 slug별 브랜드/표시명 (서버 getStores 기준, 팝업에서 브랜드명 표시용)
 */

const { verifyToken, apiResponse, isAdminOrOperator, withResolvedLevel } = require('../_utils');
const { getOrderById, getStores } = require('../_redis');

function buildSlugToDisplayName(stores) {
  const map = {};
  for (const s of stores || []) {
    const slug = (s.slug || s.id || '').toString();
    // brand/title이 비어 있으면 id/slug만 쓰이면 "store"처럼 나올 수 있음 → suburl을 보조로 사용
    const displayName = (s.brand || s.title || (s.suburl && s.suburl.trim() ? s.suburl : null) || s.id || s.slug || slug).toString().trim() || slug;
    if (slug) map[slug] = displayName;
    const lower = slug.toLowerCase();
    if (lower) map[lower] = displayName;
    const suburl = (s.suburl || '').toString().trim().toLowerCase();
    if (suburl) map[suburl] = displayName;
  }
  return map;
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return apiResponse(res, 200, {});

  if (req.method !== 'GET') {
    return apiResponse(res, 405, { error: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return apiResponse(res, 401, { error: '로그인이 필요합니다.' });
    }

    const user = withResolvedLevel(verifyToken(authHeader.substring(7)));
    if (!user) return apiResponse(res, 401, { error: '로그인이 필요합니다.' });
    if (!isAdminOrOperator(user)) return apiResponse(res, 403, { error: '관리자만 접근할 수 있습니다.' });

    const orderId = (req.query.orderId || '').toString().trim();
    if (!orderId) return apiResponse(res, 400, { error: 'orderId가 필요합니다.' });

    const order = await getOrderById(orderId);
    if (!order) return apiResponse(res, 404, { error: '주문을 찾을 수 없습니다.' });

    const stores = await getStores();
    const slugToDisplayName = buildSlugToDisplayName(stores);

    return apiResponse(res, 200, { order, slugToDisplayName });
  } catch (error) {
    console.error('Admin get order error:', error);
    return apiResponse(res, 500, { error: '서버 오류가 발생했습니다.' });
  }
};
