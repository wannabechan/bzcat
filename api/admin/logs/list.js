/**
 * GET /api/admin/logs/list
 * bzcat-blob-log 스토어의 로그 파일 목록 조회 (admin 전용, BLOB_LOG_READ_WRITE_TOKEN 사용)
 */

const { list } = require('@vercel/blob');
const { verifyToken, apiResponse } = require('../../_utils');

function isAdmin(user) {
  return user && user.level === 'admin';
}

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

    const user = verifyToken(authHeader.substring(7));
    if (!user || !isAdmin(user)) {
      return apiResponse(res, 403, { error: '관리자만 접근할 수 있습니다.' });
    }

    const token = process.env.BLOB_LOG_READ_WRITE_TOKEN;
    if (!token) {
      return apiResponse(res, 503, { error: '로그 저장소가 설정되지 않았습니다.' });
    }

    const result = await list({
      token,
      limit: 1000,
      mode: 'expanded',
    });

    const allBlobs = Array.isArray(result.blobs) ? result.blobs : [];
    let collected = allBlobs.slice();
    let nextCursor = result.cursor;
    let hasMore = result.hasMore;

    while (hasMore && nextCursor) {
      const next = await list({ token, cursor: nextCursor, limit: 1000, mode: 'expanded' });
      collected = collected.concat(Array.isArray(next.blobs) ? next.blobs : []);
      nextCursor = next.cursor;
      hasMore = next.hasMore;
    }

    return apiResponse(res, 200, {
      blobs: collected.map((b) => ({ pathname: b.pathname, url: b.url })),
    });
  } catch (error) {
    console.error('[admin/logs/list]', error);
    return apiResponse(res, 500, { error: '로그 목록을 불러올 수 없습니다.' });
  }
};
