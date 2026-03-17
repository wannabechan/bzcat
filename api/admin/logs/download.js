/**
 * GET /api/admin/logs/download?url=<blob-url>
 * private blob 파일 다운로드 (admin 전용). BLOB_LOG_READ_WRITE_TOKEN으로 blob URL fetch 후 스트리밍.
 */

const { Readable } = require('stream');
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

    const blobUrl = (req.query.url || req.query.URL || '').toString().trim();
    if (!blobUrl || !/^https:\/\//.test(blobUrl)) {
      return apiResponse(res, 400, { error: '유효한 로그 URL이 필요합니다.' });
    }
    // SSRF·토큰 유출 방지: Vercel Blob 스토어 URL만 허용
    try {
      const u = new URL(blobUrl);
      if (!u.hostname.endsWith('.blob.vercel-storage.com')) {
        return apiResponse(res, 400, { error: '유효한 로그 URL이 필요합니다.' });
      }
    } catch (_) {
      return apiResponse(res, 400, { error: '유효한 로그 URL이 필요합니다.' });
    }

    const r = await fetch(blobUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!r.ok) {
      return apiResponse(res, r.status === 404 ? 404 : 502, { error: '로그 파일을 불러올 수 없습니다.' });
    }

    let filename = blobUrl.split('/').pop()?.replace(/\?.*$/, '') || 'log.csv';
    filename = filename.replace(/["\\\r\n\x00-\x1f]/g, '').slice(0, 200) || 'log.csv';
    res.setHeader('Content-Type', r.headers.get('content-type') || 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200);
    const nodeStream = Readable.fromWeb(r.body);
    nodeStream.pipe(res);
  } catch (error) {
    console.error('[admin/logs/download]', error);
    return apiResponse(res, 500, { error: '다운로드에 실패했습니다.' });
  }
};
