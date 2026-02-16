/**
 * GET /api/manager/orders
 * 매장 담당자 이메일로 등록된 매장의 주문만 조회 (담당자 전용)
 */

const { verifyToken, apiResponse } = require('../_utils');
const { getAllOrders, getStores } = require('../_redis');
const { getStoreEmailForOrder } = require('../orders/_order-email');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    return apiResponse(res, 200, {});
  }

  if (req.method !== 'GET') {
    return apiResponse(res, 405, { error: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return apiResponse(res, 401, { error: '로그인이 필요합니다.' });
    }

    const token = authHeader.substring(7);
    const user = verifyToken(token);
    if (!user) {
      return apiResponse(res, 401, { error: '유효하지 않은 토큰입니다.' });
    }

    const stores = await getStores();
    const managerEmail = (user.email || '').trim().toLowerCase();
    if (!managerEmail) {
      return apiResponse(res, 403, { error: '담당자로 등록된 매장이 없습니다.' });
    }

    const allOrders = await getAllOrders();
    const orders = (allOrders || []).filter((order) => {
      const storeEmail = getStoreEmailForOrder(order, stores);
      return storeEmail && storeEmail.trim().toLowerCase() === managerEmail;
    });

    return apiResponse(res, 200, { orders, stores: stores || [] });
  } catch (error) {
    console.error('Manager orders error:', error);
    return apiResponse(res, 500, { error: '서버 오류가 발생했습니다.' });
  }
};
