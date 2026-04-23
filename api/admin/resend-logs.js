/**
 * GET /api/admin/resend-logs
 * Resend 발송 목록 (admin 전용). 최근 30일·최대 500건·최대 6페이지(600건) 조회로 부하 제한.
 */

const { verifyToken, apiResponse, getTokenFromRequest } = require('../_utils');
const { formatDateKST } = require('../_kst');

const RESEND_API = 'https://api.resend.com/emails';
const MAX_RETURN = 500;
const MAX_PAGES = 6;
const PAGE_LIMIT = 100;
const RETENTION_MS = 30 * 86400000;

function isAdmin(user) {
  return user && user.level === 'admin';
}

function classifySubject(subject) {
  const s = (subject || '').toString();
  if (/로그인\s*인증\s*코드/.test(s) || /\[BzCat\]\s*로그인/.test(s)) return '로그인 인증';
  if (/\[BzCat\s*신규\s*주문\]/.test(s)) return '신규 주문 알림';
  if (/\[BzCat\s*주문\s*취소\]/.test(s)) return '주문 취소 알림';
  if (!s.trim()) return '기타';
  return s.length > 48 ? `${s.slice(0, 48)}…` : s;
}

function mapLastEvent(ev) {
  const m = {
    delivered: '전달됨',
    opened: '수신확인',
    clicked: '클릭',
    bounced: '반송',
    complained: '수신거부',
    failed: '실패',
    delayed: '지연',
    scheduled: '예약',
    canceled: '취소',
    delivery_delayed: '전달 지연',
  };
  if (!ev) return '—';
  return m[ev] || String(ev);
}

function mapErrorHint(lastEvent) {
  if (lastEvent === 'bounced' || lastEvent === 'failed' || lastEvent === 'complained') {
    return lastEvent === 'bounced' ? '반송(주소·수신함 확인)' : lastEvent === 'failed' ? '발송 실패' : '수신거부';
  }
  return '—';
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    return apiResponse(res, 200, {});
  }

  if (req.method !== 'GET') {
    return apiResponse(res, 405, { error: 'Method not allowed' });
  }

  try {
    const sessionToken = getTokenFromRequest(req);
    if (!sessionToken) {
      return apiResponse(res, 401, { error: '로그인이 필요합니다.' });
    }

    const user = verifyToken(sessionToken);
    if (!user || !isAdmin(user)) {
      return apiResponse(res, 403, { error: '관리자만 접근할 수 있습니다.' });
    }

    const apiKey = (process.env.RESEND_API_KEY || '').trim();
    if (!apiKey) {
      return apiResponse(res, 503, { error: 'RESEND_API_KEY가 설정되지 않았습니다.' });
    }

    const cutoffMs = Date.now() - RETENTION_MS;
    const raw = [];
    let after = null;
    let pages = 0;

    while (pages < MAX_PAGES) {
      pages += 1;
      const url = new URL(RESEND_API);
      url.searchParams.set('limit', String(PAGE_LIMIT));
      if (after) url.searchParams.set('after', after);

      const r = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
        },
      });

      const bodyText = await r.text();
      let body = null;
      try {
        body = bodyText ? JSON.parse(bodyText) : null;
      } catch (_) {}

      if (!r.ok) {
        const msg = (body && (body.message || body.name)) || bodyText || `HTTP ${r.status}`;
        console.error('[admin/resend-logs] Resend API error', r.status, msg);
        return apiResponse(res, 502, { error: 'Resend 목록을 불러올 수 없습니다.', detail: msg });
      }

      const batch = Array.isArray(body?.data) ? body.data : [];
      if (batch.length === 0) break;

      raw.push(...batch);

      const hasMore = Boolean(body?.has_more);
      if (!hasMore) break;

      after = batch[batch.length - 1]?.id || null;
      if (!after) break;

      const oldestInPage = new Date(batch[batch.length - 1].created_at || 0).getTime();
      if (oldestInPage < cutoffMs) break;
    }

    const within = raw.filter((e) => {
      const t = new Date(e.created_at || 0).getTime();
      return !Number.isNaN(t) && t >= cutoffMs;
    });

    within.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    const sliced = within.slice(0, MAX_RETURN);

    const rows = sliced.map((e) => {
      const toArr = Array.isArray(e.to) ? e.to : [];
      const recipients = toArr.join(', ');
      const lastEvent = e.last_event || '';
      return {
        sentAtKst: formatDateKST(e.created_at || ''),
        category: classifySubject(e.subject),
        recipients,
        result: mapLastEvent(lastEvent),
        resendId: e.id || '',
        error: mapErrorHint(lastEvent),
      };
    });

    return apiResponse(res, 200, {
      rows,
      meta: {
        maxDays: 30,
        maxRows: MAX_RETURN,
        fetchedPages: pages,
        totalFetched: raw.length,
        returned: rows.length,
      },
    });
  } catch (error) {
    console.error('[admin/resend-logs]', error);
    return apiResponse(res, 500, { error: '발송 로그를 불러올 수 없습니다.' });
  }
};
