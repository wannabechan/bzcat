/**
 * POST /api/orders/menu-love
 * 배송완료 주문에 대해 '사랑'(like) 토글 — 메뉴 likePoints ±1, 잠금 후 변경 불가
 */

const { verifyToken, apiResponse, getTokenFromRequest } = require('../_utils');
const { getOrderById, getStores, adjustMenuPointsForOrder, getRedis } = require('../_redis');
const { isMenuLoveLockedNow } = require('../_kst');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return apiResponse(res, 200, {});

  if (req.method !== 'POST') {
    return apiResponse(res, 405, { error: 'Method not allowed' });
  }

  try {
    const sessionToken = getTokenFromRequest(req);
    if (!sessionToken) {
      return apiResponse(res, 401, { error: '로그인이 필요합니다.' });
    }

    const user = verifyToken(sessionToken);
    if (!user) {
      return apiResponse(res, 401, { error: '로그인이 필요합니다.' });
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const orderId = (body.orderId || '').toString().trim();
    const wantLiked = body.liked === true;

    if (!orderId) {
      return apiResponse(res, 400, { error: 'orderId가 필요합니다.' });
    }

    const order = await getOrderById(orderId);
    if (!order || (order.user_email || '').toLowerCase() !== (user.email || '').toLowerCase()) {
      return apiResponse(res, 404, { error: '주문을 찾을 수 없습니다.' });
    }

    if ((order.status || '') !== 'delivery_completed') {
      return apiResponse(res, 400, { error: '배송완료된 주문만 이용할 수 있습니다.' });
    }

    const stores = await getStores();
    const nowLiked = !!order.menu_love_liked;
    const likedAt = order.menu_love_liked_at || null;
    const locked = nowLiked && likedAt && isMenuLoveLockedNow(likedAt);

    if (wantLiked) {
      if (nowLiked) {
        return apiResponse(res, 200, {
          success: true,
          menuLoveLiked: true,
          menuLoveLikedAt: likedAt,
          menuLoveLocked: locked,
        });
      }
      await adjustMenuPointsForOrder(order, stores, { likeDelta: 1 });
      order.menu_love_liked = true;
      order.menu_love_liked_at = new Date().toISOString();
    } else {
      if (!nowLiked) {
        return apiResponse(res, 400, { error: '좋아요한 상태가 아닙니다.' });
      }
      if (locked) {
        return apiResponse(res, 403, { error: '이미 고정된 좋아요는 취소할 수 없습니다.' });
      }
      await adjustMenuPointsForOrder(order, stores, { likeDelta: -1 });
      order.menu_love_liked = false;
      order.menu_love_liked_at = null;
    }

    await getRedis().set(`order:${orderId}`, JSON.stringify(order));

    const outLocked = !!(
      order.menu_love_liked &&
      order.menu_love_liked_at &&
      isMenuLoveLockedNow(order.menu_love_liked_at)
    );

    return apiResponse(res, 200, {
      success: true,
      menuLoveLiked: !!order.menu_love_liked,
      menuLoveLikedAt: order.menu_love_liked_at || null,
      menuLoveLocked: outLocked,
    });
  } catch (error) {
    console.error('menu-love error:', error);
    return apiResponse(res, 500, { error: '서버 오류가 발생했습니다.' });
  }
};
