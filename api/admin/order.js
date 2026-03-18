/**
 * GET /api/admin/order?orderId=xxx
 * 단일 주문 전체 조회 (admin/operator - 주문 상세 팝업용)
 * slugToDisplayName: slug별 브랜드명 (주문 상세에서 매장명으로 표시)
 */

const { requireAuth, apiResponse, isAdminOrOperator } = require('../_utils');
const { getOrderById, getStores } = require('../_redis');
const { buildSlugToBrandName } = require('../_order-display');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return apiResponse(res, 200, {});

  if (req.method !== 'GET') {
    return apiResponse(res, 405, { error: 'Method not allowed' });
  }

  try {
    const user = requireAuth(req, res, { resolveLevel: true });
    if (!user) return;
    if (!isAdminOrOperator(user)) return apiResponse(res, 403, { error: '관리자만 접근할 수 있습니다.' });

    const orderId = (req.query.orderId || '').toString().trim();
    if (!orderId) return apiResponse(res, 400, { error: 'orderId가 필요합니다.' });

    const order = await getOrderById(orderId);
    if (!order) return apiResponse(res, 404, { error: '주문을 찾을 수 없습니다.' });

    const stores = await getStores();
    const slugToDisplayName = buildSlugToBrandName(stores);
    const storeSlugs = (stores || []).map((s) => (s.slug || s.id || '').toString()).filter(Boolean);

    return apiResponse(res, 200, { order, slugToDisplayName, storeSlugs });
  } catch (error) {
    console.error('Admin get order error:', error);
    return apiResponse(res, 500, { error: '서버 오류가 발생했습니다.' });
  }
};
