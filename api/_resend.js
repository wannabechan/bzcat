/**
 * Resend emails.send()는 rate limit 등 실패 시에도 예외를 던지지 않고
 * { data, error } 형태로 error 필드를 채워 반환할 수 있음.
 * 호출 후 반드시 error 여부를 검사한다.
 * @see https://resend.com/docs/api-reference/emails/send-email
 */

function formatResendError(error) {
  if (error == null) return 'Unknown error';
  if (typeof error === 'string') return error;
  if (typeof error.message === 'string' && error.message) return error.message;
  if (typeof error.name === 'string' && error.name) return error.name;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function assertResendSendSucceeded(result, context) {
  const ctx = context || 'resend.emails.send';
  if (result == null) {
    throw new Error(`${ctx}: Resend returned no result`);
  }
  if (result.error) {
    const msg = formatResendError(result.error);
    const err = new Error(`${ctx}: ${msg}`);
    err.resendError = result.error;
    throw err;
  }
}

/**
 * @param {object} resend - Resend 인스턴스
 * @param {object} payload - Resend emails.send 인자
 * @param {string} [context] - 로그/에러 구분용
 */
async function resendEmailsSend(resend, payload, context) {
  const result = await resend.emails.send(payload);
  assertResendSendSucceeded(result, context);
  return result;
}

module.exports = {
  resendEmailsSend,
  assertResendSendSucceeded,
  formatResendError,
};
