/**
 * GET /api/admin/users
 * 사용자관리 탭용 사용자 요약 조회 (admin/operator)
 */

const { getAllOrders, getAllUsers, getStores } = require('../_redis');
const { verifyToken, apiResponse, isAdminOrOperator, withResolvedLevel, getUserLevel, getTokenFromRequest } = require('../_utils');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return apiResponse(res, 200, {});
  if (req.method !== 'GET') return apiResponse(res, 405, { error: 'Method not allowed' });

  try {
    const sessionToken = getTokenFromRequest(req);
    if (!sessionToken) {
      return apiResponse(res, 401, { error: '로그인이 필요합니다.' });
    }
    const user = withResolvedLevel(verifyToken(sessionToken));
    if (!user || !isAdminOrOperator(user)) {
      return apiResponse(res, 403, { error: '관리자만 접근할 수 있습니다.' });
    }

    const users = await getAllUsers() || [];
    const stores = await getStores() || [];
    const orders = await getAllOrders() || [];
    const now = Date.now();
    const threeMonthsAgo = now - 90 * 24 * 60 * 60 * 1000;
    const operatorSet = new Set(
      (process.env.EMAIL_OPERATOR || '')
        .toLowerCase()
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean)
    );
    const managerSet = new Set(
      stores
        .map((s) => (s.storeContactEmail || '').toString().toLowerCase().trim())
        .filter(Boolean)
    );
    const byEmail = {};

    for (const order of orders) {
      const email = (order.user_email || '').toString().trim().toLowerCase();
      if (!email) continue;
      if (!byEmail[email]) {
        byEmail[email] = { email, contact: '', latestTs: 0, latestOrderId: '', recent3mCount: 0 };
      }
      const createdTs = new Date(order.created_at || 0).getTime();
      if (Number.isFinite(createdTs) && createdTs >= threeMonthsAgo) {
        byEmail[email].recent3mCount += 1;
      }
      if (Number.isFinite(createdTs) && createdTs >= byEmail[email].latestTs) {
        byEmail[email].latestTs = createdTs;
        byEmail[email].latestOrderId = (order.id || '').toString();
        byEmail[email].contact = (order.contact || '').toString().trim();
      }
      if (!byEmail[email].contact) {
        byEmail[email].contact = (order.contact || '').toString().trim();
      }
    }

    const resolvedUsers = (users || [])
      .map((u) => {
        const email = (u.email || '').toString().toLowerCase().trim();
        if (!email) return null;
        let level = getUserLevel(email);
        if (level !== 'admin' && level !== 'operator') {
          if (operatorSet.has(email)) level = 'operator';
          else if (managerSet.has(email)) level = 'manager';
          else level = 'user';
        }
        const summary = byEmail[email] || { latestTs: 0, latestOrderId: '', recent3mCount: 0, contact: '' };
        return {
          email,
          level,
          contact: summary.contact || '—',
          latestOrderDate: summary.latestTs > 0 ? new Date(summary.latestTs).toISOString().slice(0, 10) : '—',
          recent3mCount: summary.recent3mCount || 0,
          latestOrderId: summary.latestOrderId || '—',
          _latestTs: summary.latestTs || 0,
        };
      })
      .filter(Boolean)
      .sort((a, b) => (b._latestTs - a._latestTs) || a.email.localeCompare(b.email))
      .map(({ _latestTs, ...rest }) => rest);

    return apiResponse(res, 200, { users: resolvedUsers });
  } catch (error) {
    console.error('Admin users error:', error);
    return apiResponse(res, 500, { error: '사용자 목록을 불러올 수 없습니다.' });
  }
};
