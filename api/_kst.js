/**
 * KST(한국 표준시, UTC+9) 기준 날짜/시간 유틸
 * 프로젝트 내 시간 판단은 이 모듈을 사용해 KST로 통일한다.
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * 특정 시각(또는 현재)의 KST 날짜 문자열 반환 (YYYY-MM-DD)
 * @param {Date|number|string} [date] - Date, timestamp, 또는 ISO 문자열. 생략 시 현재 시각
 */
function getKSTDateString(date) {
  const t = date == null ? Date.now() : (typeof date === 'object' && date.getTime ? date.getTime() : new Date(date).getTime());
  const d = new Date(t + KST_OFFSET_MS);
  const y = d.getUTCFullYear();
  const m = pad2(d.getUTCMonth() + 1);
  const day = pad2(d.getUTCDate());
  return `${y}-${m}-${day}`;
}

/**
 * KST 기준 오늘 날짜 문자열 (YYYY-MM-DD)
 */
function getKSTTodayString() {
  return getKSTDateString(Date.now());
}

/**
 * KST 기준 내일 날짜 문자열 (YYYY-MM-DD)
 */
function getKSTTomorrowString() {
  return getKSTDateString(Date.now() + 86400000);
}

/**
 * KST 기준 어제 날짜 문자열 (YYYY-MM-DD)
 */
function getKSTYesterdayString() {
  return getKSTDateString(Date.now() - 86400000);
}

/**
 * KST 기준 오늘 날짜를 YYMMDD 형식 (주문 ID 등에 사용)
 */
function getYymmddKST() {
  const ymd = getKSTDateString(Date.now());
  return ymd.replace(/-/g, '').slice(2);
}

/**
 * YYYY-MM-DD 문자열을 해당일 00:00:00 KST 시각의 Date로 파싱
 * @param {string} dateStr - 'YYYY-MM-DD' 또는 'YYYYMMDD'
 */
function parseKSTDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const s = dateStr.trim().replace(/\D/g, '');
  if (s.length === 8) {
    const iso = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T00:00:00+09:00`;
    const d = new Date(iso);
    return isNaN(d.getTime()) ? null : d;
  }
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const iso = `${match[1]}-${match[2]}-${match[3]}T00:00:00+09:00`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * KST 해당일의 시작(00:00:00.000)과 다음날 시작 직전(23:59:59.999) 타임스탬프
 * @returns {{ startMs: number, endMs: number }}
 */
function getKSTDayRange(dateStr) {
  const start = parseKSTDate(dateStr);
  if (!start) return { startMs: 0, endMs: 0 };
  const startMs = start.getTime();
  const endMs = startMs + 86400000 - 1;
  return { startMs, endMs };
}

/**
 * ISO 문자열을 KST 기준으로 포맷 (표시용)
 * @param {string} isoStr - ISO 8601 문자열
 * @param {object} [options] - Intl 옵션
 */
function formatDateKST(isoStr, options = {}) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    ...options,
  });
}

/**
 * 현재 시각이 지정한 KST 날짜의 hour:minute:59.999 를 지났는지
 * (예: 배송 희망일 4일 전 23:59 KST → dateStr = 그 날짜, hourKST=23, minuteKST=59)
 */
function isPastKSTDeadline(dateStr, hourKST = 23, minuteKST = 59) {
  const start = parseKSTDate(dateStr);
  if (!start) return false;
  const deadlineMs = start.getTime() + (hourKST * 3600000 + minuteKST * 60000 + 59) * 1000 + 999;
  return Date.now() > deadlineMs;
}

/**
 * menu_love: 좋아요한 날(KST 달력)을 1일째로 보고, 7일째 00:00 KST부터 잠금.
 * @param {string} likedAtIso - ISO 8601
 * @returns {number|null} 잠금 시각(ms)
 */
function getMenuLoveLockAtMs(likedAtIso) {
  const likeMs = new Date(likedAtIso).getTime();
  if (isNaN(likeMs)) return null;
  const ymd = getKSTDateString(likeMs);
  const dayStart = parseKSTDate(ymd);
  if (!dayStart) return null;
  return dayStart.getTime() + 6 * 86400000;
}

/** 현재 시각이 menu_love 잠금 이후인지 */
function isMenuLoveLockedNow(likedAtIso) {
  const lockMs = getMenuLoveLockAtMs(likedAtIso);
  if (lockMs == null) return false;
  return Date.now() >= lockMs;
}

module.exports = {
  KST_OFFSET_MS,
  getKSTDateString,
  getKSTTodayString,
  getKSTTomorrowString,
  getKSTYesterdayString,
  getYymmddKST,
  parseKSTDate,
  getKSTDayRange,
  formatDateKST,
  isPastKSTDeadline,
  getMenuLoveLockAtMs,
  isMenuLoveLockedNow,
};
