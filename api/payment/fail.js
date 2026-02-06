/**
 * GET /api/payment/fail
 * Toss 결제 실패/취소 리다이렉트 → 앱으로 돌려보내서 팝업 표시
 */

function getAppOrigin(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  const proto = req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  return `${proto}://${host}`;
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }

  const origin = getAppOrigin(req);
  res.redirect(302, `${origin}/?payment=cancel`);
};
