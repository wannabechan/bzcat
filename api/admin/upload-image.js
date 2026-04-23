/**
 * POST /api/admin/upload-image
 * 이미지 업로드 (admin 전용) - Vercel Blob 저장
 * 서버리스(Vercel)에서 multipart 파싱을 위해 formidable-serverless 사용
 */

const fs = require('fs');
const crypto = require('crypto');
const { put } = require('@vercel/blob');
const formidable = require('formidable-serverless');
const { verifyToken, apiResponse, getTokenFromRequest, withResolvedLevel, isAdminOnly } = require('../_utils');

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const EXT_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};
const MAX_SIZE = 4 * 1024 * 1024; // 4MB

function parseForm(req) {
  return new Promise((resolve, reject) => {
    const form = new formidable.IncomingForm();
    form.maxFileSize = MAX_SIZE;
    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      else resolve({ fields, files });
    });
  });
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    return apiResponse(res, 200, {});
  }

  if (req.method !== 'POST') {
    return apiResponse(res, 405, { error: 'Method not allowed' });
  }

  try {
    const sessionToken = getTokenFromRequest(req);
    if (!sessionToken) {
      return apiResponse(res, 401, { error: '로그인이 필요합니다.' });
    }

    const decoded = verifyToken(sessionToken);
    const user = withResolvedLevel(decoded);
    if (!user || !isAdminOnly(user)) {
      return apiResponse(res, 403, { error: '관리자만 접근할 수 있습니다.' });
    }

    const { files } = await parseForm(req);

    const file = (files?.file && (Array.isArray(files.file) ? files.file[0] : files.file)) ||
      (files?.image && (Array.isArray(files.image) ? files.image[0] : files.image));
    const filepath = file?.filepath || file?.path;
    if (!file || !filepath) {
      return apiResponse(res, 400, { error: '이미지 파일을 선택해 주세요.' });
    }

    const mimetype = (file.mimetype || file.type || file.mimeType || 'image/jpeg').toLowerCase();
    if (!ALLOWED_TYPES.includes(mimetype)) {
      return apiResponse(res, 400, { error: 'JPEG, PNG, WebP, GIF 이미지만 업로드할 수 있습니다.' });
    }

    const ext = EXT_BY_MIME[mimetype] || '.jpg';
    const pathname = `menu/${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;

    const fileBuffer = fs.readFileSync(filepath);
    try {
      fs.unlinkSync(filepath);
    } catch (_) {
      /* 임시 파일 삭제 실패는 업로드 성공에 영향 없음 */
    }

    const blob = await put(pathname, fileBuffer, {
      access: 'public',
      addRandomSuffix: true,
      contentType: mimetype,
    });

    return apiResponse(res, 200, { url: blob.url });
  } catch (error) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return apiResponse(res, 400, { error: '파일 크기는 4MB 이하여야 합니다.' });
    }
    if (error.message && error.message.includes('BLOB_')) {
      console.error('Upload image error (Blob env):', error.message);
      return apiResponse(res, 500, { error: '업로드 설정 오류입니다. BLOB_READ_WRITE_TOKEN 환경 변수를 확인해 주세요.' });
    }
    console.error('Upload image error:', error);
    return apiResponse(res, 500, { error: '업로드에 실패했습니다.' });
  }
};
