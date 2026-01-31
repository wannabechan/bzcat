/**
 * BzCat 인증 모듈
 * - 이메일 기반 6자리 코드 로그인
 * - 사용자 레벨: admin(1) | manager(2) | user(3)
 */

const SESSION_KEY = 'bzcat_session';
const ADMIN_EMAIL = 'bzcatmanager@gmail.com';
// manager 이메일 목록 (추후 확장)
const MANAGER_EMAILS = new Set([]);

let pendingCode = null;
let pendingEmail = null;

function getUserLevel(email) {
  const normalized = (email || '').trim().toLowerCase();
  if (normalized === ADMIN_EMAIL) return 'admin';
  if (MANAGER_EMAILS.has(normalized)) return 'manager';
  return 'user';
}

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function getSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.email) return null;
    return { email: data.email, level: data.level || getUserLevel(data.email) };
  } catch {
    return null;
  }
}

function setSession(email) {
  const level = getUserLevel(email);
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ email: email.trim(), level }));
  return level;
}

function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
  pendingCode = null;
  pendingEmail = null;
}

function showLogin() {
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('mainApp').style.display = 'none';
}

function showApp() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('mainApp').style.display = 'flex';
}

function initAuth() {
  const session = getSession();
  if (session) {
    showApp();
    return;
  }
  showLogin();

  const loginForm = document.getElementById('loginForm');
  const loginEmail = document.getElementById('loginEmail');
  const loginCode = document.getElementById('loginCode');
  const loginCodeSection = document.getElementById('loginCodeSection');
  const loginCodeHint = document.getElementById('loginCodeHint');
  const btnSendCode = document.getElementById('btnSendCode');
  const btnLogout = document.getElementById('btnLogout');

  function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email || '').trim());
  }

  btnSendCode.addEventListener('click', () => {
    const email = loginEmail.value.trim();
    if (!validateEmail(email)) {
      alert('올바른 이메일 주소를 입력해 주세요.');
      return;
    }
    pendingEmail = email;
    pendingCode = generateCode();
    loginCodeSection.style.display = '';
    loginCode.value = '';
    loginCode.focus();
    loginCodeHint.textContent = `[개발] 이메일 발송 연동 전입니다. 아래 코드를 입력하세요: ${pendingCode}`;
  });

  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const code = (loginCode.value || '').trim();
    if (!code || code.length !== 6) {
      alert('6자리 인증 코드를 입력해 주세요.');
      return;
    }
    if (!pendingCode || !pendingEmail) {
      alert('먼저 로그인 코드를 생성해 주세요.');
      return;
    }
    if (code !== pendingCode) {
      alert('인증 코드가 일치하지 않습니다.');
      return;
    }
    const email = pendingEmail;
    pendingCode = null;
    pendingEmail = null;
    setSession(email);
    showApp();
    loginCodeSection.style.display = 'none';
    loginForm.reset();
  });

  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      clearSession();
      showLogin();
      loginCodeSection.style.display = 'none';
      loginForm.reset();
    });
  }
}

document.addEventListener('DOMContentLoaded', initAuth);
