/**
 * GET /api/admin/stores - 매장·메뉴 데이터 조회 (admin 전용)
 * PUT /api/admin/stores - 매장·메뉴 데이터 저장 (admin 전용)
 */

const { getStores, getMenus, saveStoresAndMenus } = require('../_redis');
const { verifyToken, apiResponse } = require('../_utils');

const ADMIN_EMAIL = 'bzcatmanager@gmail.com';

function isAdmin(user) {
  return user && (user.level === 'admin' || (user.email || '').toLowerCase() === ADMIN_EMAIL);
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    return apiResponse(res, 200, {});
  }

  if (req.method !== 'GET' && req.method !== 'PUT') {
    return apiResponse(res, 405, { error: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return apiResponse(res, 401, { error: '로그인이 필요합니다.' });
    }

    const user = verifyToken(authHeader.substring(7));
    if (!user || !isAdmin(user)) {
      return apiResponse(res, 403, { error: '관리자만 접근할 수 있습니다.' });
    }

    if (req.method === 'GET') {
      const stores = await getStores();
      const menusByStore = {};
      for (const store of stores) {
        menusByStore[store.id] = await getMenus(store.id);
      }
      return apiResponse(res, 200, { stores, menus: menusByStore });
    }

    if (req.method === 'PUT') {
      const { stores, menus } = req.body;
      if (!stores || !menus) {
        return apiResponse(res, 400, { error: 'stores와 menus 데이터가 필요합니다.' });
      }
      await saveStoresAndMenus(stores, menus);
      return apiResponse(res, 200, { success: true });
    }
  } catch (error) {
    console.error('Admin stores error:', error);
    return apiResponse(res, 500, { error: '서버 오류가 발생했습니다.' });
  }
};
