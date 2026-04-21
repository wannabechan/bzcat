/**
 * 일별 주문 로그 CSV 및 PII 익명화 배치와 동일한 마스킹 규칙
 */

/** 이메일: 앞 2자리 + ****** + @도메인. 예: ab******@gmail.com */
function maskEmail(v) {
  if (v == null || String(v).trim() === '') return '';
  const s = String(v).trim();
  const at = s.indexOf('@');
  if (at <= 0) return '******';
  const local = s.slice(0, at);
  const domain = s.slice(at);
  const head = local.length <= 2 ? local : local.slice(0, 2);
  return head + '******' + domain;
}

/** 이름: 앞 한 글자 + * + 뒤 한 글자. 예: 김*민 */
function maskName(v) {
  if (v == null || String(v).trim() === '') return '';
  const s = String(v).trim();
  if (s.length <= 2) return s.length === 1 ? `${s}*` : `${s[0]}*`;
  return `${s[0]}*${s[s.length - 1]}`;
}

/** 전화번호: 뒷 4자리만. 예: ****5678 */
function maskPhone(v) {
  if (v == null || String(v).trim() === '') return '';
  const digits = String(v).replace(/\D/g, '');
  if (digits.length < 4) return '****';
  return `****${digits.slice(-4)}`;
}

/** 주소: 기본주소만 (상세주소 제외) — CSV와 동일 */
function maskAddress(baseAddress, _detailAddress) {
  if (baseAddress == null || String(baseAddress).trim() === '') return '';
  return String(baseAddress).trim();
}

module.exports = {
  maskEmail,
  maskName,
  maskPhone,
  maskAddress,
};
