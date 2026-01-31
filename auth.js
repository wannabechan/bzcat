/**
 * BzCat 인증 모듈 (API 연동 버전)
 * - 이메일 기반 6자리 코드 로그인
 * - 사용자 레벨: admin(1) | manager(2) | user(3)
 */

const TOKEN_KEY = 'bzcat_token';
const API_BASE = ''; // Same origin

let pendingEmail = null;

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  pendingEmail = null;
}

async function checkSession() {
  const token = getToken();
  if (!token) return null;

  try {
    const response = await fetch(`${API_BASE}/api/auth/session`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      clearToken();
      return null;
    }

    const data = await response.json();
    return data.user;
  } catch (error) {
    console.error('Session check error:', error);
    clearToken();
    return null;
  }
}

function showLogin() {
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('mainApp').style.display = 'none';
}

function showApp() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('mainApp').style.display = 'flex';
}

async function initAuth() {
  const user = await checkSession();
  
  if (user) {
    showApp();
  } else {
    showLogin();
  }

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

  btnSendCode.addEventListener('click', async () => {
    const email = loginEmail.value.trim();
    if (!validateEmail(email)) {
      alert('올바른 이메일 주소를 입력해 주세요.');
      return;
    }

    btnSendCode.disabled = true;
    btnSendCode.textContent = '발송 중...';

    try {
      const response = await fetch(`${API_BASE}/api/auth/send-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || '코드 발송에 실패했습니다.');
        return;
      }

      pendingEmail = email;
      loginCodeSection.style.display = '';
      loginCode.value = '';
      loginCode.focus();
      
      // 개발 모드에서 코드 표시
      if (data.devCode) {
        loginCodeHint.textContent = `[개발] 이메일 발송 연동 전입니다. 코드: ${data.devCode}`;
      } else {
        loginCodeHint.textContent = `${email}로 인증 코드를 발송했습니다.`;
      }

    } catch (error) {
      console.error('Send code error:', error);
      alert('네트워크 오류가 발생했습니다.');
    } finally {
      btnSendCode.disabled = false;
      btnSendCode.textContent = '로그인 코드 생성';
    }
  });

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = (loginCode.value || '').trim();
    
    if (!code || code.length !== 6) {
      alert('6자리 인증 코드를 입력해 주세요.');
      return;
    }
    
    if (!pendingEmail) {
      alert('먼저 로그인 코드를 생성해 주세요.');
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/auth/verify-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: pendingEmail,
          code: code,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || '인증에 실패했습니다.');
        return;
      }

      // 토큰 저장
      setToken(data.token);
      pendingEmail = null;

      // 첫 로그인 환영 메시지
      if (data.isFirstLogin) {
        alert('만나서 반갑습니다. 맛있게 준비해드릴게요!');
      }

      // 앱 표시
      showApp();
      loginCodeSection.style.display = 'none';
      loginForm.reset();

    } catch (error) {
      console.error('Verify code error:', error);
      alert('네트워크 오류가 발생했습니다.');
    }
  });

  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      clearToken();
      showLogin();
      if (loginCodeSection) loginCodeSection.style.display = 'none';
      if (loginForm) loginForm.reset();
    });
  }
}

// Export for use in app.js
window.BzCatAuth = {
  getToken,
  checkSession,
};

document.addEventListener('DOMContentLoaded', initAuth);
