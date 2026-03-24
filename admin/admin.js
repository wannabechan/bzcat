/**
 * Admin 페이지 - 매장·메뉴·결제정보 관리
 */

const TOKEN_KEY = 'bzcat_token';
const API_BASE = '';
const FETCH_TIMEOUT_MS = 15000;
const ADMIN_TAB_KEY = 'bzcat_admin_tab';

/** 'admin' | 'operator' - 관리 페이지 진입 허용 레벨. operator는 매장/로그 탭·주문 취소·삭제 비노출 */
let adminUserLevel = 'admin';

let adminPaymentOrders = [];
let adminPaymentTotal = 0;
let adminPaymentSortBy = 'created_at'; // 'created_at' | 'delivery_date'
let adminPaymentSortDir = { created_at: 'desc', delivery_date: 'desc' }; // 'asc' = 오래된순(↑), 'desc' = 최신순(↓)
let adminPaymentSubFilter = 'all'; // 'all' | 'new' | 'payment_wait' | 'delivery_wait' | 'shipping' | 'delivery_completed'
let adminPaymentPeriod = '45days'; // 'thisMonth' | '45days' | '90days' (주문시간 기준 조회 기간, 기본 45일)
let adminStoresMap = {};
let adminStoreOrder = []; // slug order for order detail
let adminStatsLastData = null;
let adminStatsMenuFilter = 'top10'; // 'top10' | 'all'
let adminUsersList = [];
let adminUsersSortKey = 'email'; // 'email' | 'recent'
let adminUsersSortDir = 'desc'; // 'asc' | 'desc'

const PAYMENT_IDLE_MS = 180000; // 180초 무활동 시 주문 목록 리프레시
let paymentIdleTimerId = null;
let paymentIdleListenersAttached = false;
let adminPaymentFlashIntervals = [];

// 이미지 규칙: 1:1 비율, 권장 400x400px
const IMAGE_RULE = '가로·세로 1:1 비율, 권장 400×400px';

const BUSINESS_HOURS_SLOTS = ['09:00-10:00', '10:00-11:00', '11:00-12:00', '12:00-13:00', '13:00-14:00', '14:00-15:00', '15:00-16:00', '16:00-17:00', '17:00-18:00', '18:00-19:00', '19:00-20:00', '20:00-21:00'];

/** 정산관리 탭: false = 실제 DB 데이터 사용, true = 테스트용 샘플(DB 미반영, 화면만) */
const SETTLEMENT_MOCK_FOR_TEST = false;

// KST(한국 표준시) 기준 날짜 (프로젝트 시간 판단 통일)
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
function getKSTDateStr(ts) {
  return new Date(ts).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
}
function getKSTTodayString() {
  return getKSTDateStr(Date.now());
}
function getKSTTomorrowString() {
  const today = getKSTTodayString();
  const start = new Date(today + 'T00:00:00+09:00');
  return getKSTDateStr(start.getTime() + 86400000);
}

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function escapeHtml(s) {
  if (s == null || s === '') return '';
  const t = String(s);
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** img src에 쓸 수 있는 URL만 허용 (http/https 또는 / 로 시작) */
function safeImageUrl(url) {
  const u = (url || '').trim();
  if (!u) return '';
  const lower = u.toLowerCase();
  if (lower.startsWith('https://') || lower.startsWith('http://') || u.startsWith('/')) return u;
  return '';
}

function fetchWithTimeout(url, options, timeoutMs) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs || FETCH_TIMEOUT_MS);
  return fetch(url, { ...options, signal: ctrl.signal }).finally(() => clearTimeout(id));
}

async function checkAdmin() {
  const token = getToken();
  if (!token) return { ok: false, error: '로그인이 필요합니다.' };
  try {
    const res = await fetchWithTimeout(`${API_BASE}/api/auth/session`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) return { ok: false, error: '세션이 만료되었습니다.' };
    const data = await res.json();
    const level = data.user?.level;
    const allowed = level === 'admin' || level === 'operator';
    return {
      ok: allowed,
      error: allowed ? null : '관리자만 접근할 수 있습니다.',
      user: data.user,
    };
  } catch (e) {
    return { ok: false, error: e.name === 'AbortError' ? '요청 시간이 초과되었습니다.' : (e.message || '연결에 실패했습니다.') };
  }
}

async function fetchStores() {
  const token = getToken();
  const debug = /[?&]debug=1(?:&|$)/i.test(window.location.search || '');
  const url = `${API_BASE}/api/admin/stores` + (debug ? '?debug=1' : '');
  try {
    const res = await fetchWithTimeout(url, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || '데이터를 불러올 수 없습니다.');
    }
    return res.json();
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('요청 시간이 초과되었습니다. 네트워크를 확인하고 다시 시도해 주세요.');
    throw e;
  }
}

async function saveStores(stores, menus) {
  const token = getToken();
  const res = await fetch(`${API_BASE}/api/admin/stores`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ stores, menus }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || '저장에 실패했습니다.');
  }
}

async function uploadImage(file) {
  const token = getToken();
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_BASE}/api/admin/upload-image`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '업로드에 실패했습니다.');
  return data.url;
}

function showError(msg) {
  const el = document.getElementById('adminError');
  el.textContent = msg;
  el.style.display = 'block';
}

function hideError() {
  document.getElementById('adminError').style.display = 'none';
}

function generateId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** 사업자등록번호를 000-00-00000 형식으로 정규화 (숫자만 추출 후 3-2-5 구간에 하이픈) */
function formatBizNo(value) {
  const digits = (value || '').replace(/\D/g, '');
  if (digits.length !== 10) return (value || '').trim();
  return digits.slice(0, 3) + '-' + digits.slice(3, 5) + '-' + digits.slice(5, 10);
}

function generateStoreId() {
  return `store-${Date.now().toString(36)}`;
}

function renderStore(store, menus) {
  const payment = store.payment || { apiKeyEnvVar: 'TOSS_SECRET_KEY', widgetClientKeyEnvVar: 'TOSS_WIDGET_CLIENT_KEY' };
  const deliveryFee = Number.isFinite(Number(store.deliveryFee)) && Number(store.deliveryFee) >= 0 ? Math.floor(Number(store.deliveryFee)) : 50000;
  const items = menus || [];
  const storeIdEsc = escapeHtml(store.id || '');

  return `
    <div class="admin-store" id="admin-store-${storeIdEsc.replace(/"/g, '')}" data-store-id="${storeIdEsc}">
      <div class="admin-store-header">
        <span class="admin-store-title">${escapeHtml(store.title || store.id || '')}</span>
        <div class="admin-store-header-actions">
          <button type="button" class="admin-btn admin-btn-top" data-scroll-top aria-label="맨 위로">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
          </button>
          <button type="button" class="admin-btn admin-btn-danger admin-btn-delete-store" data-delete-store="${storeIdEsc}" title="카테고리 삭제">삭제</button>
        </div>
      </div>
      <div class="admin-store-body">
        <div class="admin-section">
          <div class="admin-section-title-row">
            <span class="admin-section-title">매장 정보</span>
            <button type="button" class="admin-btn admin-btn-icon admin-btn-settings" data-store-settings="${storeIdEsc}" aria-label="API 환경변수 설정" title="API 환경변수 설정">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            </button>
          </div>
          <div class="admin-form-row">
            <div class="admin-form-field">
              <label>대분류</label>
              <input type="text" data-field="title" value="${escapeHtml(store.title || '')}" placeholder="예: 도시락">
            </div>
          </div>
          <input type="hidden" data-field="apiKeyEnvVar" value="${escapeHtml(payment.apiKeyEnvVar || 'TOSS_SECRET_KEY')}">
          <input type="hidden" data-field="widgetClientKeyEnvVar" value="${escapeHtml(payment.widgetClientKeyEnvVar || 'TOSS_WIDGET_CLIENT_KEY')}">
          <input type="hidden" data-field="businessDays" value="${(store.businessDays && Array.isArray(store.businessDays) ? store.businessDays : [0,1,2,3,4,5,6]).join(',')}">
          <input type="hidden" data-field="businessHours" value="${(store.businessHours && Array.isArray(store.businessHours) ? store.businessHours : BUSINESS_HOURS_SLOTS).join(',')}">
          <input type="hidden" data-field="deliveryFee" value="${deliveryFee}">
        </div>
        <div class="admin-section">
          <div class="admin-section-title">브랜드</div>
          <div class="admin-form-row">
            <div class="admin-form-field">
              <label>브랜드명</label>
              <input type="text" data-field="brand" value="${escapeHtml(store.brand || '')}" placeholder="예: OO브랜드">
            </div>
            <div class="admin-form-field" style="flex: 2;">
              <label>매장주소</label>
              <input type="text" data-field="storeAddress" value="${escapeHtml(store.storeAddress || '')}" placeholder="예: 서울시 강남구 OO로 123">
            </div>
            <div class="admin-form-field">
              <label>사업자등록번호</label>
              <input type="text" data-field="bizNo" value="${escapeHtml(store.bizNo || '')}" placeholder="예: 000-00-00000">
            </div>
          </div>
          <div class="admin-form-row admin-form-row--brand-row2">
            <div class="admin-form-field admin-form-field--representative">
              <label>대표자</label>
              <input type="text" data-field="representative" value="${escapeHtml(store.representative || '')}" placeholder="대표자명">
        </div>
            <div class="admin-form-field">
              <label>담당자연락처</label>
              <input type="text" data-field="storeContact" value="${escapeHtml(store.storeContact || '')}" placeholder="예: 02-1234-5678">
            </div>
            <div class="admin-form-field admin-form-field--store-contact-email">
              <label>담당자이메일</label>
              <input type="email" data-field="storeContactEmail" value="${escapeHtml(store.storeContactEmail || '')}" placeholder="예: contact@example.com">
          </div>
            <div class="admin-form-field">
              <label>suburl</label>
              <input type="text" data-field="suburl" value="${escapeHtml(store.suburl || '')}" placeholder="영어 소문자" pattern="[a-z]*" autocomplete="off">
            </div>
          </div>
        </div>
        <div class="admin-section admin-section-menu">
          <div class="admin-section-title-row">
            <span class="admin-section-title">메뉴 (${items.length})</span>
            <button type="button" class="admin-btn admin-btn-icon admin-menu-toggle-btn" data-menu-toggle aria-label="메뉴 목록 열기" title="메뉴 목록 열기/접기">▼</button>
          </div>
          <div class="admin-menu-list-wrap admin-menu-list-collapsed">
            <div class="admin-menu-list" data-store-id="${storeIdEsc}">
              ${items.map((item, i) => renderMenuItem(store.id, item, i)).join('')}
            </div>
            <button type="button" class="admin-btn admin-btn-secondary admin-btn-add" data-add-menu="${storeIdEsc}">+ 메뉴 추가</button>
          </div>
        </div>
        <div class="admin-save-bar">
          <button type="button" class="admin-btn admin-btn-primary" data-save>저장</button>
        </div>
      </div>
    </div>
  `;
}

function renderMenuItem(storeId, item, index) {
  const safeUrl = safeImageUrl(item.imageUrl);
  const imgContent = safeUrl
    ? `<img src="${escapeHtml(safeUrl)}" alt="" onerror="this.parentElement.innerHTML='<span class=\\'placeholder\\'>📷</span>'">`
    : '<span class="placeholder">📷</span>';
  return `
    <div class="admin-menu-item" data-menu-index="${index}" data-menu-id="${escapeHtml(item.id || '')}">
      <div class="admin-menu-thumb">${imgContent}</div>
      <div class="admin-menu-fields">
        <div class="admin-form-field">
          <label>메뉴명</label>
          <input type="text" data-field="name" value="${escapeHtml(item.name || '')}" placeholder="메뉴명">
        </div>
        <div class="admin-form-row">
          <div class="admin-form-field">
            <label>가격 (원)</label>
            <input type="number" data-field="price" value="${item.price || 0}" placeholder="0" min="0">
          </div>
          <div class="admin-form-field admin-form-field-image" style="flex: 2;">
            <label>이미지</label>
            <div class="admin-image-input-row">
              <input type="url" data-field="imageUrl" value="${escapeHtml(item.imageUrl || '')}" placeholder="URL 또는 업로드">
              <input type="file" data-upload-input accept="image/jpeg,image/png,image/webp,image/gif" style="display:none">
              <button type="button" class="admin-btn admin-btn-upload" data-upload-btn title="파일 업로드">📤 업로드</button>
            </div>
            <div class="admin-image-rule">${IMAGE_RULE}</div>
          </div>
        </div>
        <div class="admin-form-field">
          <label>설명</label>
          <textarea data-field="description" placeholder="메뉴 설명">${escapeHtml(item.description || '')}</textarea>
        </div>
        <div class="admin-form-field">
          <label>원산지</label>
          <input type="text" data-field="origin" value="${escapeHtml(item.origin || '')}" placeholder="예: 국내산(쌀)">
        </div>
      </div>
      <div class="admin-menu-actions">
        <button type="button" class="admin-btn admin-btn-danger" data-remove-menu data-store-id="${escapeHtml(storeId)}" data-index="${index}">삭제</button>
        <div class="admin-menu-order-btns">
          <button type="button" class="admin-btn admin-btn-icon admin-menu-move-btn" data-menu-move="up" title="순서 위로">↑</button>
          <button type="button" class="admin-btn admin-btn-icon admin-menu-move-btn" data-menu-move="down" title="순서 아래로">↓</button>
        </div>
      </div>
    </div>
  `;
}

/** 담당자연락처: 010으로 시작하는 11자리 휴대폰 번호만 허용 (공백/하이픈 제거 후 판단) */
function isValidKoreanMobile(value) {
  const trimmed = (value || '').trim();
  if (!trimmed) return true;
  const digits = trimmed.replace(/\D/g, '');
  return digits.length === 11 && digits.startsWith('010');
}

function collectData() {
  const stores = [];
  const menus = {};
  const list = document.getElementById('adminStoresList');
  const storeEls = list ? list.querySelectorAll('.admin-store') : document.querySelectorAll('.admin-store');

  storeEls.forEach((storeEl) => {
    const storeId = storeEl.dataset.storeId;
    const titleInput = storeEl.querySelector('input[data-field="title"]');
    const brandInput = storeEl.querySelector('input[data-field="brand"]');
    const storeAddressInput = storeEl.querySelector('input[data-field="storeAddress"]');
    const storeContactInput = storeEl.querySelector('input[data-field="storeContact"]');
    const storeContactEmailInput = storeEl.querySelector('input[data-field="storeContactEmail"]');
    const representativeInput = storeEl.querySelector('input[data-field="representative"]');
    const bizNoInput = storeEl.querySelector('input[data-field="bizNo"]');
    const suburlInput = storeEl.querySelector('input[data-field="suburl"]');
    const apiKeyEnvVarInput = storeEl.querySelector('input[data-field="apiKeyEnvVar"]');
    const widgetClientKeyEnvVarInput = storeEl.querySelector('input[data-field="widgetClientKeyEnvVar"]');
    const businessDaysInput = storeEl.querySelector('input[data-field="businessDays"]');
    const businessHoursInput = storeEl.querySelector('input[data-field="businessHours"]');
    const deliveryFeeInput = storeEl.querySelector('input[data-field="deliveryFee"]');
    const businessDaysStr = businessDaysInput?.value?.trim() || '0,1,2,3,4,5,6';
    const businessDays = businessDaysStr.split(',').map((d) => parseInt(d, 10)).filter((n) => !isNaN(n) && n >= 0 && n <= 6);
    const businessHoursStr = businessHoursInput?.value?.trim() || BUSINESS_HOURS_SLOTS.join(',');
    const businessHours = businessHoursStr.split(',').map((s) => s.trim()).filter((s) => BUSINESS_HOURS_SLOTS.includes(s));
    const deliveryFee = parseInt(deliveryFeeInput?.value || '50000', 10);
    const store = { id: storeId, slug: storeId, title: titleInput?.value?.trim() || storeId, brand: brandInput?.value?.trim() || '', storeAddress: storeAddressInput?.value?.trim() || '', storeContact: storeContactInput?.value?.trim() || '', storeContactEmail: storeContactEmailInput?.value?.trim() || '', representative: representativeInput?.value?.trim() || '', bizNo: formatBizNo(bizNoInput?.value?.trim() || ''), suburl: (suburlInput?.value?.trim() || '').toLowerCase().replace(/[^a-z]/g, ''), businessDays: businessDays.length ? businessDays.sort((a, b) => a - b) : [0, 1, 2, 3, 4, 5, 6], businessHours: businessHours.length ? businessHours : [...BUSINESS_HOURS_SLOTS], deliveryFee: Number.isFinite(deliveryFee) && deliveryFee >= 0 ? deliveryFee : 50000, payment: {
      apiKeyEnvVar: apiKeyEnvVarInput?.value?.trim() || 'TOSS_SECRET_KEY',
      widgetClientKeyEnvVar: widgetClientKeyEnvVarInput?.value?.trim() || 'TOSS_WIDGET_CLIENT_KEY',
    } };
    stores.push(store);

    const menuList = storeEl.querySelector('.admin-menu-list');
    const items = [];
    menuList?.querySelectorAll('.admin-menu-item').forEach((itemEl) => {
      const nameInput = itemEl.querySelector('input[data-field="name"]');
      const priceInput = itemEl.querySelector('input[data-field="price"]');
      const descInput = itemEl.querySelector('textarea[data-field="description"]');
      const originInput = itemEl.querySelector('input[data-field="origin"]');
      const imageInput = itemEl.querySelector('input[data-field="imageUrl"]');
      const name = nameInput?.value?.trim();
      if (!name) return;
      items.push({
        id: itemEl.dataset.menuId || generateId(storeId),
        name,
        price: parseInt(priceInput?.value || '0', 10) || 0,
        description: descInput?.value?.trim() || '',
        origin: originInput?.value?.trim() || '',
        imageUrl: imageInput?.value?.trim() || '',
      });
    });
    menus[storeId] = items;
  });

  return { stores, menus };
}

function showLoadingError(msg, showRetry = false) {
  const content = document.getElementById('adminContent');
  content.innerHTML = `
    <div class="admin-loading admin-error">
      <p>${escapeHtml(msg || '')}</p>
      <p style="margin-top:12px;font-size:0.875rem;color:var(--color-text-secondary);">
        로그인 후 메인 화면에서 admin 링크를 통해 접속해 주세요.
      </p>
      <div style="margin-top:16px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
        <a href="/" class="admin-btn admin-btn-primary">메인으로</a>
        ${showRetry ? '<button type="button" class="admin-btn admin-btn-secondary" id="adminRetryBtn">다시 시도</button>' : ''}
      </div>
    </div>
  `;
  if (showRetry) {
    document.getElementById('adminRetryBtn')?.addEventListener('click', () => {
      document.getElementById('adminContent').innerHTML = '<div class="admin-loading">로딩 중...</div>';
      init();
    });
  }
}

function setupTabs() {
  const tabs = document.querySelectorAll('.admin-tab');
  const views = document.querySelectorAll('.admin-view');
  const canViewUsersTab = adminUserLevel === 'admin' || adminUserLevel === 'operator';
  
  function activateTab(targetTab) {
      tabs.forEach(t => t.classList.remove('active'));
      views.forEach(v => v.classList.remove('active'));
    const tabEl = document.querySelector(`.admin-tab[data-tab="${targetTab}"]`);
    if (tabEl) tabEl.classList.add('active');
      if (targetTab === 'stores') {
        document.getElementById('storesView').classList.add('active');
        clearPaymentIdleTimer();
      } else if (targetTab === 'payments') {
        document.getElementById('paymentsView').classList.add('active');
        adminPaymentPeriod = '45days';
        adminPaymentSortBy = 'created_at';
        adminPaymentSortDir = { created_at: 'desc', delivery_date: 'desc' };
        loadPaymentManagement().then(() => startPaymentIdleRefresh());
    } else     if (targetTab === 'stats') {
      document.getElementById('statsView').classList.add('active');
      loadStats();
    } else if (targetTab === 'settlement') {
      document.getElementById('settlementView').classList.add('active');
      loadSettlement();
    } else if (targetTab === 'logs') {
      document.getElementById('logsView').classList.add('active');
      loadLogs();
    } else if (targetTab === 'users') {
      document.getElementById('usersView').classList.add('active');
      loadUsersManagement();
    }
  }

  const allowedTabs = adminUserLevel === 'operator'
    ? ['payments', 'stats', 'settlement', ...(canViewUsersTab ? ['users'] : [])]
    : ['stores', 'payments', 'stats', 'settlement', 'logs', ...(canViewUsersTab ? ['users'] : [])];
  tabs.forEach(tab => {
    const tabKey = tab.dataset.tab;
    if ((adminUserLevel === 'operator' && (tabKey === 'stores' || tabKey === 'logs')) || (tabKey === 'users' && !canViewUsersTab)) {
      tab.style.display = 'none';
    } else {
      tab.style.display = '';
    }
    tab.addEventListener('click', () => {
      const targetTab = tab.dataset.tab;
      if (targetTab) sessionStorage.setItem(ADMIN_TAB_KEY, targetTab);
      activateTab(targetTab);
    });
  });

  const nav = performance.getEntriesByType?.('navigation')?.[0];
  const isReload = nav?.type === 'reload' || (typeof performance.navigation !== 'undefined' && performance.navigation.type === 1);
  const saved = sessionStorage.getItem(ADMIN_TAB_KEY);
  const isMobile = () => window.matchMedia('(max-width: 768px)').matches;
  let tabToActivate = (saved && allowedTabs.includes(saved) && (saved !== 'settlement' || !isMobile()) && (saved !== 'stores' || !isMobile()) && (saved !== 'logs' || !isMobile()) && (saved !== 'users' || !isMobile())) ? saved : (isMobile() ? 'payments' : 'stores');
  if (adminUserLevel === 'operator' && (tabToActivate === 'stores' || tabToActivate === 'logs')) {
    tabToActivate = 'payments';
  }
  if (isReload && saved) {
    activateTab(tabToActivate);
  }
}

/** 신청 완료 주문이 주문일(KST)+1일 15:00 KST까지 승인/거절되지 않은 경우 true */
function isOverdueForAccept(order) {
  if (order.status !== 'submitted') return false;
  const created = new Date(order.created_at);
  const createdKstStr = getKSTDateStr(created.getTime());
  const deadline = new Date(createdKstStr + 'T00:00:00+09:00');
  deadline.setTime(deadline.getTime() + 86400000 + 15 * 3600000);
  return Date.now() > deadline.getTime();
}

function sortPaymentOrders(orders, sortBy, dir) {
  const copy = orders.slice();
  const asc = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  if (sortBy === 'created_at') {
    copy.sort((a, b) => asc(new Date(a.created_at), new Date(b.created_at)));
  } else {
    copy.sort((a, b) => {
      const da = (a.delivery_date || '') + ' ' + (a.delivery_time || '00:00');
      const db = (b.delivery_date || '') + ' ' + (b.delivery_time || '00:00');
      return asc(new Date(da), new Date(db));
    });
  }
  if (dir === 'desc') copy.reverse();
  return copy;
}

function renderPaymentList() {
  const content = document.getElementById('adminPaymentContent');
  const allOrders = adminPaymentOrders;
  const cancelled = (o) => o.status === 'cancelled';

  const totalCount = allOrders.length;
  const newCount = allOrders.filter(o => !cancelled(o) && (o.status === 'submitted' || o.status === 'order_accepted')).length;
  const paymentWaitCount = allOrders.filter(o => !cancelled(o) && o.status === 'payment_link_issued').length;
  const deliveryWaitCount = allOrders.filter(o => !cancelled(o) && o.status === 'payment_completed').length;
  const shippingCount = allOrders.filter(o => !cancelled(o) && o.status === 'shipping').length;
  const deliveryCompletedCount = allOrders.filter(o => !cancelled(o) && o.status === 'delivery_completed').length;

  let filtered;
  if (adminPaymentSubFilter === 'new') {
    filtered = allOrders.filter(o => o.status === 'submitted' || o.status === 'order_accepted');
  } else if (adminPaymentSubFilter === 'payment_wait') {
    filtered = allOrders.filter(o => o.status === 'payment_link_issued');
  } else if (adminPaymentSubFilter === 'delivery_wait') {
    filtered = allOrders.filter(o => o.status === 'payment_completed');
  } else if (adminPaymentSubFilter === 'shipping') {
    filtered = allOrders.filter(o => o.status === 'shipping');
  } else if (adminPaymentSubFilter === 'delivery_completed') {
    filtered = allOrders.filter(o => o.status === 'delivery_completed');
  } else {
    filtered = allOrders.slice();
  }

  const sortBy = adminPaymentSortBy;
  const dir = adminPaymentSortDir[sortBy] || 'desc';
  const sorted = sortPaymentOrders(filtered, sortBy, dir);

  const arrow = (key) => (adminPaymentSortDir[key] === 'asc' ? ' ↑' : ' ↓');
  const periodBar = `
    <div class="admin-payment-subfilter admin-payment-period-row">
      <div class="admin-payment-subfilter-row">
        <span class="admin-payment-subfilter-item ${adminPaymentPeriod === 'thisMonth' ? 'active' : ''}" data-period="thisMonth" role="button" tabindex="0">이번달</span>
        <span class="admin-payment-subfilter-item ${adminPaymentPeriod === '45days' ? 'active' : ''}" data-period="45days" role="button" tabindex="0">45일전부터</span>
        <span class="admin-payment-subfilter-item ${adminPaymentPeriod === '90days' ? 'active' : ''}" data-period="90days" role="button" tabindex="0">90일전부터</span>
      </div>
    </div>
  `;
  const sortBar = `
    <div class="admin-payment-sort">
      <div class="admin-payment-sort-btns">
        <button type="button" class="admin-payment-sort-btn ${sortBy === 'created_at' ? 'active' : ''}" data-sort="created_at">주문시간${arrow('created_at')}</button>
        <button type="button" class="admin-payment-sort-btn ${sortBy === 'delivery_date' ? 'active' : ''}" data-sort="delivery_date">배송희망일시${arrow('delivery_date')}</button>
      </div>
    </div>
    <div class="admin-payment-subfilter">
      <div class="admin-payment-subfilter-row">
        <span class="admin-payment-subfilter-item ${adminPaymentSubFilter === 'all' ? 'active' : ''}" data-subfilter="all" role="button" tabindex="0">전체보기 ${totalCount}개</span>
        <span class="admin-payment-subfilter-item ${adminPaymentSubFilter === 'new' ? 'active' : ''}" data-subfilter="new" role="button" tabindex="0">신규주문 ${newCount}개</span>
        <span class="admin-payment-subfilter-item ${adminPaymentSubFilter === 'payment_wait' ? 'active' : ''}" data-subfilter="payment_wait" role="button" tabindex="0">결제대기 ${paymentWaitCount}개</span>
      </div>
      <div class="admin-payment-subfilter-row">
        <span class="admin-payment-subfilter-item ${adminPaymentSubFilter === 'delivery_wait' ? 'active' : ''}" data-subfilter="delivery_wait" role="button" tabindex="0">배송대기 ${deliveryWaitCount}개</span>
        <span class="admin-payment-subfilter-item ${adminPaymentSubFilter === 'shipping' ? 'active' : ''}" data-subfilter="shipping" role="button" tabindex="0">배송중 ${shippingCount}개</span>
        <span class="admin-payment-subfilter-item ${adminPaymentSubFilter === 'delivery_completed' ? 'active' : ''}" data-subfilter="delivery_completed" role="button" tabindex="0">배송완료 ${deliveryCompletedCount}개</span>
      </div>
    </div>
  `;

  const todayKstStr = getKSTTodayString();
  const todayStart = new Date(todayKstStr + 'T00:00:00+09:00').getTime();
  const ordersHtml = sorted.map(order => {
    const deliveryDayStart = new Date((order.delivery_date || '').toString().trim() + 'T00:00:00+09:00').getTime();
    const daysUntilDelivery = Math.floor((deliveryDayStart - todayStart) / 86400000);
    const dDayText = daysUntilDelivery < 0 ? 'D+' + Math.abs(daysUntilDelivery) : (daysUntilDelivery === 0 ? 'D-day' : 'D-' + daysUntilDelivery);
    const dDayClass = daysUntilDelivery < 0 ? 'admin-days-overdue' : (daysUntilDelivery <= 7 ? 'admin-days-urgent' : '');
    const isCancelled = order.status === 'cancelled';
    const isUrgent = !isCancelled && daysUntilDelivery >= 0 && daysUntilDelivery <= 7 && !(order.payment_link && String(order.payment_link).trim());
    const isPaymentDone = order.status === 'payment_completed' || order.status === 'shipping' || order.status === 'delivery_completed';
    const paymentLinkRowDisabled = isCancelled || isPaymentDone || order.status === 'submitted' || !!(order.payment_link && String(order.payment_link).trim());
    const shippingRowDisabled = order.status !== 'payment_completed';
    const deliveryRowDisabled = order.status !== 'shipping';
    const shippingValue = (order.status === 'shipping' || order.status === 'delivery_completed') ? (order.tracking_number || '') : '';
    const overdue = isOverdueForAccept(order);
    const orderIdEsc = escapeHtml(String(order.id));
    const orderIdEl = overdue
      ? `<span class="admin-payment-order-id admin-overdue-flash admin-payment-order-id-link" data-order-detail="${orderIdEsc}" data-overdue-flash role="button" tabindex="0"><span class="admin-overdue-id">주문 #${orderIdEsc}</span><span class="admin-overdue-msg">주문 신청을 승인해 주세요.</span></span>`
      : `<span class="admin-payment-order-id admin-payment-order-id-link" data-order-detail="${orderIdEsc}" role="button" tabindex="0">주문 #${orderIdEsc}</span>`;

    const statusLabelEsc = escapeHtml(getStatusLabel(order.status, order.cancel_reason));
    const deliveryAddressEsc = escapeHtml([(order.delivery_address || '').trim(), (order.detail_address || '').trim()].filter(Boolean).join(' ') || '—');
    const paymentLinkEsc = escapeHtml(order.payment_link || '');
    const shippingValueEsc = escapeHtml(shippingValue || '');
    const deliveryInputValueEsc = order.status === 'delivery_completed' ? escapeHtml(`주문 #${order.id}`) : '';

    return `
      <div class="admin-payment-order ${isCancelled ? 'admin-payment-order-cancelled' : ''}" data-order-id="${orderIdEsc}">
        <div class="admin-payment-order-header">
          ${orderIdEl}
          <span class="admin-payment-order-status ${order.status}">${statusLabelEsc}</span>
        </div>
        <div class="admin-payment-order-info">
          <div>주문시간: ${formatAdminOrderDate(order.created_at)}</div>
          <div>배송희망: ${escapeHtml(order.delivery_date || '')} ${escapeHtml(order.delivery_time || '')}${isCancelled || adminPaymentSubFilter === 'delivery_completed' ? '' : ` <span class="${dDayClass}">(${dDayText})</span>`}</div>
          <div>배송주소: ${deliveryAddressEsc}</div>
          <div>주문자: ${escapeHtml(order.depositor || '—')} / ${escapeHtml(order.contact || '—')}</div>
          <div>이메일: ${escapeHtml(order.user_email || '—')}</div>
          <div>총액: ${formatAdminPrice(order.total_amount)}</div>
        </div>
        <div class="admin-payment-link-row">
          <input 
            type="text" 
            class="admin-payment-link-input ${isUrgent ? 'urgent' : ''}" 
            value="${paymentLinkEsc}" 
            data-order-id="${orderIdEsc}"
            placeholder="결제 생성 코드 입력"
            ${paymentLinkRowDisabled ? 'readonly disabled' : ''}
          >
          <button 
            type="button" 
            class="admin-btn admin-btn-primary admin-payment-link-btn" 
            data-save-link="${orderIdEsc}"
            ${paymentLinkRowDisabled ? 'disabled' : ''}
          >저장</button>
        </div>
        <div class="admin-payment-link-row">
          <input 
            type="text" 
            class="admin-payment-link-input admin-shipping-input" 
            value="${shippingValueEsc}" 
            data-order-id="${orderIdEsc}"
            data-shipping-input="${orderIdEsc}"
            placeholder="배송 번호 입력"
            ${shippingRowDisabled ? 'readonly disabled' : ''}
          >
          <button 
            type="button" 
            class="admin-btn admin-btn-primary admin-payment-link-btn" 
            data-save-shipping="${orderIdEsc}"
            ${shippingRowDisabled ? 'disabled' : ''}
          >저장</button>
        </div>
        <div class="admin-payment-link-row">
          <input 
            type="text" 
            class="admin-payment-link-input admin-delivery-input" 
            value="${deliveryInputValueEsc}" 
            data-order-id="${orderIdEsc}"
            data-delivery-input="${orderIdEsc}"
            placeholder="배송 완료 코드 입력"
            ${deliveryRowDisabled ? 'readonly disabled' : ''}
          >
          <button 
            type="button" 
            class="admin-btn admin-btn-primary admin-payment-link-btn" 
            data-save-delivery="${orderIdEsc}"
            ${deliveryRowDisabled ? 'disabled' : ''}
          >저장</button>
        </div>
        <div class="admin-payment-order-delete-row">
          ${adminUserLevel !== 'operator' ? `${order.status !== 'cancelled' && (order.status === 'submitted' || order.status === 'order_accepted' || order.status === 'payment_link_issued') ? `<button type="button" class="admin-payment-cancel-btn" data-cancel-order="${orderIdEsc}">취소</button>` : ''}
          <button type="button" class="admin-payment-delete-btn" data-delete-order="${orderIdEsc}">삭제</button>` : ''}
        </div>
      </div>
    `;
  }).join('');

  content.innerHTML = periodBar + sortBar + ordersHtml;

  adminPaymentFlashIntervals.forEach(id => clearInterval(id));
  adminPaymentFlashIntervals = [];
  content.querySelectorAll('[data-overdue-flash]').forEach(el => {
    const id = setInterval(() => {
      el.classList.toggle('admin-overdue-show-msg');
    }, 1500);
    adminPaymentFlashIntervals.push(id);
  });

  content.querySelectorAll('[data-period]').forEach(el => {
    const handler = () => {
      adminPaymentPeriod = el.dataset.period;
      loadPaymentManagement();
    };
    el.addEventListener('click', handler);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handler();
      }
    });
  });

  content.querySelectorAll('[data-sort]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.sort;
      if (adminPaymentSortBy === key) {
        adminPaymentSortDir[key] = adminPaymentSortDir[key] === 'asc' ? 'desc' : 'asc';
      } else {
        adminPaymentSortBy = key;
      }
      renderPaymentList();
    });
  });

  content.querySelectorAll('[data-subfilter]').forEach(el => {
    const handler = () => {
      adminPaymentSubFilter = el.dataset.subfilter;
      renderPaymentList();
    };
    el.addEventListener('click', handler);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handler();
      }
    });
  });

  content.querySelectorAll('[data-order-detail]').forEach(el => {
    el.addEventListener('click', () => {
      const orderId = el.dataset.orderDetail;
      if (orderId) openAdminOrderDetailById(orderId);
    });
  });

  content.querySelectorAll('[data-save-link]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const orderId = btn.dataset.saveLink;
      const input = content.querySelector(`.admin-payment-link-input[data-order-id="${orderId}"]`);
      const paymentLink = input?.value?.trim() || '';

      const approvedPhrase = paymentLink && (orderId === paymentLink || `주문 #${orderId}` === paymentLink);
      if (!approvedPhrase) {
        alert('결제 진행 승인 코드 오류');
        if (input) input.value = '';
        return;
      }

      btn.disabled = true;
      btn.textContent = '저장 중...';

      try {
        const token = getToken();
        const res = await fetch(`${API_BASE}/api/admin/payment-link`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ orderId, paymentLink }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || '저장에 실패했습니다.');
        }

        const order = adminPaymentOrders.find(o => o.id === orderId);
        if (order) {
          order.payment_link = paymentLink;
          if (!paymentLink.trim() && order.status === 'payment_link_issued') {
            order.status = 'order_accepted';
          } else if (paymentLink.trim() && (order.status === 'submitted' || order.status === 'order_accepted')) {
            order.status = 'payment_link_issued';
          }
        }
        alert('저장되었습니다.');
        renderPaymentList();
      } catch (e) {
        alert(e.message || '저장에 실패했습니다.');
      } finally {
        btn.disabled = false;
        btn.textContent = '저장';
      }
    });
  });

  content.querySelectorAll('[data-save-shipping]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const orderId = btn.dataset.saveShipping;
      const input = content.querySelector(`.admin-shipping-input[data-order-id="${orderId}"]`);
      const raw = (input?.value || '').trim();
      const trackingNumber = raw.replace(/\D/g, '');

      const isKoreanPhone = /^0\d{8,10}$/.test(trackingNumber);
      if (!isKoreanPhone) {
        alert('대한민국 휴대폰 또는 전화번호만 입력 가능합니다. (9~11자리 숫자, 0으로 시작)');
        return;
      }

      btn.disabled = true;
      btn.textContent = '저장 중...';

      try {
        const token = getToken();
        const res = await fetch(`${API_BASE}/api/admin/shipping-number`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ orderId, trackingNumber }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || '저장에 실패했습니다.');
        }

        const order = adminPaymentOrders.find(o => o.id === orderId);
        if (order) {
          order.status = 'shipping';
          order.tracking_number = trackingNumber;
        }
        alert('저장되었습니다.');
        renderPaymentList();
      } catch (e) {
        alert(e.message || '저장에 실패했습니다.');
      } finally {
        btn.disabled = false;
        btn.textContent = '저장';
      }
    });
  });

  content.querySelectorAll('[data-save-delivery]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const orderId = btn.dataset.saveDelivery;
      const input = content.querySelector(`.admin-delivery-input[data-order-id="${orderId}"]`);
      const code = input?.value?.trim() || '';

      const valid = code === orderId || code === `주문 #${orderId}`;
      if (!valid) {
        alert('배송 완료 승인 코드 오류');
        if (input) input.value = '';
        return;
      }

      btn.disabled = true;
      btn.textContent = '저장 중...';

      try {
        const token = getToken();
        const res = await fetch(`${API_BASE}/api/admin/delivery-complete`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ orderId, code }),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || '저장에 실패했습니다.');
        }

        const order = adminPaymentOrders.find(o => o.id === orderId);
        if (order) order.status = 'delivery_completed';
        alert('저장되었습니다.');
        renderPaymentList();
      } catch (e) {
        alert(e.message || '저장에 실패했습니다.');
      } finally {
        btn.disabled = false;
        btn.textContent = '저장';
      }
    });
  });

  content.querySelectorAll('[data-cancel-order]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const orderId = btn.dataset.cancelOrder;
      const code = prompt('주문 손님도 알고 계신거죠?\n취소 코드를 입력해주세요.');
      if (code === null) return;
      const trimmed = String(code).trim();
      if (trimmed !== orderId && trimmed !== `주문 #${orderId}`) {
        alert('취소 코드 오류입니다.');
        return;
      }
      try {
        const token = getToken();
        if (!token) return;
        const res = await fetch(`${API_BASE}/api/admin/cancel-order`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ orderId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          alert(data.error || '취소에 실패했습니다.');
          return;
        }
        const order = adminPaymentOrders.find((o) => o.id === orderId);
        if (order) order.status = 'cancelled';
        alert('주문이 취소되었습니다.');
        renderPaymentList();
      } catch (err) {
        alert(err.message || '취소에 실패했습니다.');
      }
    });
  });

  content.querySelectorAll('[data-delete-order]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const orderId = btn.dataset.deleteOrder;
      const code = prompt('주문 내역이 완전히 삭제됩니다.\n삭제 코드를 입력해주세요.');
      if (code === null) return;
      const trimmed = String(code).trim();
      if (trimmed !== orderId && trimmed !== `주문 #${orderId}`) {
        alert('삭제 코드 오류입니다.');
        return;
      }
      try {
        const token = getToken();
        if (!token) return;
        const res = await fetch(`${API_BASE}/api/admin/delete-order`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ orderId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          alert(data.error || '삭제에 실패했습니다.');
          return;
        }
        adminPaymentOrders = adminPaymentOrders.filter((o) => o.id !== orderId);
        renderPaymentList();
      } catch (err) {
        alert(err.message || '삭제에 실패했습니다.');
      }
    });
  });
}

function getPaymentPeriodRange(period) {
  const now = Date.now();
  const today = getKSTTodayString();
  const endDate = today;
  let startDate;
  if (period === 'thisMonth') {
    const d = new Date(now + KST_OFFSET_MS);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    startDate = `${y}-${m}-01`;
  } else if (period === '90days') {
    const start = new Date(now - 90 * 86400000);
    startDate = getKSTDateStr(start.getTime());
  } else {
    // '45days' default
    const start = new Date(now - 45 * 86400000);
    startDate = getKSTDateStr(start.getTime());
  }
  return { startDate, endDate };
}

async function loadPaymentManagement() {
  const content = document.getElementById('adminPaymentContent');
  content.innerHTML = '<div class="admin-loading">로딩 중...</div>';

  try {
    const token = getToken();
    const { startDate, endDate } = getPaymentPeriodRange(adminPaymentPeriod);
    const params = new URLSearchParams({ startDate, endDate, limit: '5000', offset: '0' });
    const res = await fetchWithTimeout(`${API_BASE}/api/admin/orders?${params}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || '주문 목록을 불러올 수 없습니다.');
    }

    const { orders, total } = await res.json();
    adminPaymentOrders = orders || [];
    adminPaymentTotal = typeof total === 'number' ? total : adminPaymentOrders.length;

    try {
      const storesRes = await fetchWithTimeout(`${API_BASE}/api/admin/stores`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (storesRes.ok) {
        const { stores } = await storesRes.json();
        adminStoresMap = {};
        adminStoreOrder = [];
        (stores || []).forEach(s => {
          const slug = (s.slug || s.id || '').toString();
          const displayName = (s.brand || s.title || s.id || s.slug || slug).toString().trim() || slug;
          adminStoresMap[slug] = displayName;
          adminStoresMap[(slug || '').toLowerCase()] = displayName;
          adminStoreOrder.push(slug);
        });
      }
    } catch (_) {}

    if (adminPaymentOrders.length === 0 && adminPaymentTotal === 0) {
      content.innerHTML = '<div class="admin-loading">주문 내역이 없습니다</div>';
      return;
    }

    renderPaymentList();
  } catch (e) {
    content.innerHTML = `<div class="admin-loading admin-error"><p>${escapeHtml(e.message || '오류가 발생했습니다.')}</p></div>`;
  }
}

async function refetchPaymentOrdersAndRender() {
  const content = document.getElementById('adminPaymentContent');
  try {
    const token = getToken();
    const { startDate, endDate } = getPaymentPeriodRange(adminPaymentPeriod);
    const params = new URLSearchParams({ startDate, endDate, limit: '5000', offset: '0' });
    const res = await fetchWithTimeout(`${API_BASE}/api/admin/orders?${params}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) return;
    const { orders, total } = await res.json();
    adminPaymentOrders = orders || [];
    adminPaymentTotal = typeof total === 'number' ? total : adminPaymentOrders.length;
    if (adminPaymentOrders.length === 0 && adminPaymentTotal === 0) {
      content.innerHTML = '<div class="admin-loading">주문 내역이 없습니다</div>';
      return;
    }
    renderPaymentList();
  } catch (_) {}
}

function resetPaymentIdleTimer() {
  if (paymentIdleTimerId != null) clearTimeout(paymentIdleTimerId);
  paymentIdleTimerId = setTimeout(() => {
    refetchPaymentOrdersAndRender().then(() => resetPaymentIdleTimer());
  }, PAYMENT_IDLE_MS);
}

function startPaymentIdleRefresh() {
  if (paymentIdleTimerId != null) clearTimeout(paymentIdleTimerId);
  paymentIdleTimerId = setTimeout(() => {
    refetchPaymentOrdersAndRender().then(() => resetPaymentIdleTimer());
  }, PAYMENT_IDLE_MS);
  if (!paymentIdleListenersAttached) {
    paymentIdleListenersAttached = true;
    document.addEventListener('click', resetPaymentIdleTimer);
    document.addEventListener('keydown', resetPaymentIdleTimer);
    document.addEventListener('input', resetPaymentIdleTimer);
  }
}

function clearPaymentIdleTimer() {
  if (paymentIdleTimerId != null) {
    clearTimeout(paymentIdleTimerId);
    paymentIdleTimerId = null;
  }
  if (paymentIdleListenersAttached) {
    paymentIdleListenersAttached = false;
    document.removeEventListener('click', resetPaymentIdleTimer);
    document.removeEventListener('keydown', resetPaymentIdleTimer);
    document.removeEventListener('input', resetPaymentIdleTimer);
  }
}

function getStatsDateStr(d) {
  return getKSTDateStr(d instanceof Date ? d.getTime() : d);
}
function getThisWeekMondayKST() {
  const todayStr = getKSTTodayString();
  const todayStart = new Date(todayStr + 'T00:00:00+09:00').getTime();
  const day = new Date(todayStart + KST_OFFSET_MS).getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  return getKSTDateStr(todayStart - diff * 86400000);
}
function getDefaultStatsRange() {
  const endStr = getKSTTodayString();
  const startStr = getThisWeekMondayKST();
  return { start: startStr, end: endStr };
}
function getPresetStatsRange(preset) {
  const todayStr = getKSTTodayString();
  const todayStart = new Date(todayStr + 'T00:00:00+09:00').getTime();
  if (preset === 'today') return { start: todayStr, end: todayStr };
  if (preset === 'this_week') {
    const startStr = getThisWeekMondayKST();
    return { start: startStr, end: todayStr };
  }
  if (preset === 'last_week') {
    const thisMonStr = getThisWeekMondayKST();
    const thisMonStart = new Date(thisMonStr + 'T00:00:00+09:00').getTime();
    const lastSunStart = thisMonStart - 86400000;
    const lastMonStart = thisMonStart - 7 * 86400000;
    return { start: getKSTDateStr(lastMonStart), end: getKSTDateStr(lastSunStart) };
  }
  if (preset === 'this_month') {
    const start = todayStr.replace(/-(\d{2})$/, '-01');
    return { start, end: todayStr };
  }
  if (preset === 'last_month') {
    const d = new Date(todayStr + 'T12:00:00+09:00');
    const y = d.getFullYear(), m = d.getMonth();
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 0));
    return { start: getKSTDateStr(start.getTime()), end: getKSTDateStr(end.getTime()) };
  }
  return null;
}

function getActiveStatsPreset(startVal, endVal) {
  const presets = ['today', 'this_week', 'last_week', 'this_month', 'last_month'];
  for (const p of presets) {
    const r = getPresetStatsRange(p);
    if (r && r.start === startVal && r.end === endVal) return p;
  }
  return null;
}

async function loadStats() {
  const content = document.getElementById('adminStatsContent');
  if (!content) return;
  const startInput = document.getElementById('adminStatsStartDate');
  const endInput = document.getElementById('adminStatsEndDate');
  let startDate = startInput?.value?.trim() || '';
  let endDate = endInput?.value?.trim() || '';
  const defaultRange = getDefaultStatsRange();
  if (!startDate) startDate = defaultRange.start;
  if (!endDate) endDate = defaultRange.end;

  content.innerHTML = '<div class="admin-loading">로딩 중...</div>';
  try {
    const token = getToken();
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    const res = await fetchWithTimeout(`${API_BASE}/api/admin/stats?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      content.innerHTML = `<div class="admin-stats-error">${escapeHtml(err.error || '통계를 불러올 수 없습니다.')}</div>`;
      return;
    }
    const data = await res.json();
    adminStatsLastData = data;
    renderStats(content, data);
  } catch (e) {
    content.innerHTML = `<div class="admin-stats-error">${escapeHtml(e.message || '통계를 불러올 수 없습니다.')}</div>`;
  }
}

/** YYYY-MM-DD (KST) */
function toDateKey(d) {
  const x = d instanceof Date ? d : new Date(d);
  return getKSTDateStr(x.getTime());
}

/** yy/mm/dd hh:mm:ss KST (실시간 시계용) */
function formatSettlementClock() {
  const x = new Date();
  const formatter = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const parts = formatter.formatToParts(x);
  const get = (t) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}/${get('month')}/${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

var _settlementEmptyParagraph = '<p class="admin-settlement-empty">내역이 없습니다.</p>';

function renderSettlementTable(byBrand) {
  if (!byBrand || byBrand.length === 0) {
    return _settlementEmptyParagraph;
  }
  const formatMoney = (n) => Number(n || 0).toLocaleString() + '원';
  let html = '<table class="admin-stats-table"><thead><tr><th>브랜드</th><th>주문 수</th><th>판매금액</th><th>수수료</th><th>정산금액</th></tr></thead><tbody>';
  byBrand.forEach((b) => {
    const sales = Number(b.totalAmount) || 0;
    const fee = Math.round(sales * 0.18);
    const settlement = sales - fee;
    html += '<tr><td>' + escapeHtml(b.brandTitle || b.slug || '') + '</td><td>' + (b.orderCount || 0) + '</td><td>' + formatMoney(sales) + '</td><td>' + formatMoney(fee) + '</td><td>' + formatMoney(settlement) + '</td></tr>';
  });
  html += '</tbody></table>';
  return html;
}

/** 정산 기준일 목록: 2026-01-01 ~ 오늘(KST), 10일·20일·말일만, 최신순 */
function getSettlementDatesList() {
  const todayStr = getKSTTodayString();
  const [endY, endM] = todayStr.split('-').map(Number);
  const list = [];
  for (let y = 2026; y <= endY; y++) {
    const monthStart = y === 2026 ? 1 : 1;
    const monthEnd = y === endY ? endM : 12;
    for (let m = monthStart; m <= monthEnd; m++) {
      const pad = (n) => String(n).padStart(2, '0');
      const d10 = y + '-' + pad(m) + '-10';
      const d20 = y + '-' + pad(m) + '-20';
      const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const dLast = y + '-' + pad(m) + '-' + pad(lastDay);
      if (d10 >= '2026-01-01' && d10 <= todayStr) list.push(d10);
      if (d20 >= '2026-01-01' && d20 <= todayStr) list.push(d20);
      if (dLast >= '2026-01-01' && dLast <= todayStr && dLast !== d10 && dLast !== d20) list.push(dLast);
    }
  }
  list.sort((a, b) => b.localeCompare(a));
  return list;
}

/** 정산 기준일에 해당하는 지급 기간 반환 (startDate, endDate) */
function getPeriodForSettlementDate(settlementDateStr) {
  const parts = settlementDateStr.split('-').map(Number);
  const y = parts[0], m = parts[1], dayNum = parts[2];
  const pad = (n) => String(n).padStart(2, '0');
  if (dayNum === 10) {
    const prev = m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };
    const prevLast = new Date(Date.UTC(prev.y, prev.m, 0)).getUTCDate();
    return { start: prev.y + '-' + pad(prev.m) + '-21', end: prev.y + '-' + pad(prev.m) + '-' + pad(prevLast) };
  }
  if (dayNum === 20) {
    return { start: y + '-' + pad(m) + '-01', end: y + '-' + pad(m) + '-10' };
  }
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (dayNum === lastDay) {
    return { start: y + '-' + pad(m) + '-11', end: y + '-' + pad(m) + '-20' };
  }
  return null;
}

/**
 * 정산관리 탭 테스트용 샘플 데이터 (실제 DB 미사용).
 * 가정: 2026-02-01부터 매일 9시, 주문 페이지 첫 번째 카테고리(매장) 전메뉴 1개씩 주문, 배송희망일 = 주문일+8일.
 * → 최초 배송일은 2026-02-09. 그 이전 구간에는 배송/정산 없음.
 * 배송일이 토요일인 주문만 admin이 배송완료 미저장.
 * 샘플 매장 = loadSettlement 시점의 매장 목록(getStores) 첫 번째 = 주문 페이지 첫 카테고리와 동일.
 */
const SAMPLE_FIRST_ORDER_DATE = '2026-02-01';
const SAMPLE_FIRST_DELIVERY_DATE = '2026-02-09';

var _mockFirstCategory = { slug: '', brandTitle: '', storeContactEmail: '', representative: '' };

function getMockSettlementByBrandForPeriod(startDateStr, endDateStr) {
  const SAMPLE_AMOUNT_PER_ORDER = 50000;
  const MOCK_BRAND = { slug: _mockFirstCategory.slug, brandTitle: _mockFirstCategory.brandTitle || _mockFirstCategory.slug };
  if (!_mockFirstCategory.slug) return { executed: [], notExecuted: [] };
  if (endDateStr < SAMPLE_FIRST_DELIVERY_DATE || startDateStr > endDateStr) {
    return { executed: [], notExecuted: [] };
  }
  const rangeStart = startDateStr < SAMPLE_FIRST_DELIVERY_DATE ? SAMPLE_FIRST_DELIVERY_DATE : startDateStr;
  const rangeEnd = endDateStr;
  let executedCount = 0;
  let notExecutedCount = 0;
  const start = new Date(rangeStart + 'T12:00:00+09:00');
  const end = new Date(rangeEnd + 'T12:00:00+09:00');
  for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
    const dayKst = new Date(t + KST_OFFSET_MS).getUTCDay();
    if (dayKst === 6) notExecutedCount += 1;
    else executedCount += 1;
  }
  const executed = executedCount > 0
    ? [{ ...MOCK_BRAND, orderCount: executedCount, totalAmount: executedCount * SAMPLE_AMOUNT_PER_ORDER }]
    : [];
  const notExecuted = notExecutedCount > 0
    ? [{ ...MOCK_BRAND, orderCount: notExecutedCount, totalAmount: notExecutedCount * SAMPLE_AMOUNT_PER_ORDER }]
    : [];
  return { executed, notExecuted };
}

/** 정산서 출력 mock: 정산 내역과 동일한 샘플 규칙(2026-02-09 이후, 토요일 제외). 정산 집행분만 일별로 반환. 매장 = 주문 페이지 첫 카테고리. */
function getMockSettlementStatementData(startDateStr, endDateStr) {
  const SAMPLE_AMOUNT_PER_ORDER = 50000;
  const slug = _mockFirstCategory.slug;
  const brandTitle = _mockFirstCategory.brandTitle || slug;
  if (endDateStr < SAMPLE_FIRST_DELIVERY_DATE || startDateStr > endDateStr || !slug) {
    return {
      brandTitle: brandTitle || '',
      slug: slug || '',
      storeContactEmail: _mockFirstCategory.storeContactEmail || '',
      representative: _mockFirstCategory.representative || '',
      startDate: startDateStr,
      endDate: endDateStr,
      days: [],
      totalOrderCount: 0,
      totalSales: 0,
      totalFee: 0,
      totalSettlement: 0,
    };
  }
  const rangeStart = startDateStr < SAMPLE_FIRST_DELIVERY_DATE ? SAMPLE_FIRST_DELIVERY_DATE : startDateStr;
  const rangeEnd = endDateStr;
  const days = [];
  const start = new Date(rangeStart + 'T12:00:00+09:00');
  const end = new Date(rangeEnd + 'T12:00:00+09:00');
  for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
    const dayKst = new Date(t + KST_OFFSET_MS).getUTCDay();
    if (dayKst === 6) continue;
    const d = new Date(t);
    const dateKey = getKSTDateStr(t);
    const sales = SAMPLE_AMOUNT_PER_ORDER;
    const fee = Math.round(sales * 0.18);
    const settlement = sales - fee;
    days.push({ date: dateKey, orderCount: 1, totalAmount: sales, fee, settlement });
  }
  const totalOrderCount = days.length;
  const totalSales = totalOrderCount * SAMPLE_AMOUNT_PER_ORDER;
  const totalFee = Math.round(totalSales * 0.18);
  const totalSettlement = totalSales - totalFee;
  return {
    brandTitle,
    slug,
    storeContactEmail: _mockFirstCategory.storeContactEmail || '',
    representative: _mockFirstCategory.representative || '',
    startDate: startDateStr,
    endDate: endDateStr,
    days,
    totalOrderCount,
    totalSales,
    totalFee,
    totalSettlement,
  };
}

var _settlementTableClass = 'admin-stats-table admin-settlement-equal-cols';
function renderMockSettlementTwoLists(executed, notExecuted) {
  const table1 = renderSettlementTable(executed).replace('<table class="admin-stats-table">', '<table class="' + _settlementTableClass + '">');
  const table2 = renderSettlementTable(notExecuted).replace('<table class="admin-stats-table">', '<table class="' + _settlementTableClass + '">');
  return (
    '<div class="admin-settlement-mock-lists">' +
    '<br><h4 class="admin-settlement-subheading">정산 집행 (배송 완료 처리)</h4>' +
    '<div class="admin-settlement-mock-table-wrap">' + table1 + '</div>' +
    '<br><h4 class="admin-settlement-subheading">정산 미집행 (배송 완료 미처리)</h4>' +
    '<div class="admin-settlement-mock-table-wrap">' + table2 + '</div>' +
    '</div>'
  );
}

let settlementClockIntervalId = null;

/** 정산서 출력용 기본 기간 (최근 7일, KST) */
function getStatementDefaultRange() {
  const endStr = getKSTTodayString();
  const endStart = new Date(endStr + 'T00:00:00+09:00').getTime();
  const startStr = getKSTDateStr(endStart - 6 * 86400000);
  return { start: startStr, end: endStr };
}

function renderSettlementStatementContent(data) {
  if (!data || !data.days) return '';
  const formatMoney = (n) => Number(n || 0).toLocaleString() + '원';
  const brandName = escapeHtml(data.brandTitle || data.slug || '');
  const periodText = (data.startDate || '') + ' ~ ' + (data.endDate || '');
  const contactEmail = escapeHtml(data.storeContactEmail || '');
  const repName = escapeHtml(data.representative || '');
  const issueDate = toDateKey(new Date());

  let html = '<div class="admin-settlement-statement-print">';
  html += '<div class="admin-settlement-statement-print-inner">';
  html += '<div class="admin-settlement-statement-header">';
  html += '<p class="admin-settlement-statement-logo">BzCat</p>';
  html += '<p class="admin-settlement-statement-title">정산서</p>';
  html += '<p class="admin-settlement-statement-period">' + escapeHtml(periodText) + '</p>';
  html += '<hr class="admin-settlement-statement-hr">';
  html += '</div>';

  html += '<div class="admin-settlement-statement-brand">';
  html += '<br><p><strong>브랜드 정보</strong></p><br>';
  html += '<p class="admin-settlement-statement-bullet">• 브랜드명: ' + brandName + '</p>';
  html += '<p class="admin-settlement-statement-bullet">• 담당자이메일: ' + contactEmail + '</p>';
  html += '<p class="admin-settlement-statement-bullet">• 대표자이름: ' + repName + '</p>';
  html += '</div>';

  html += '<div class="admin-settlement-statement-body">';
  html += '<br><p><strong>정산 내역</strong></p><br>';
  html += '<table class="admin-stats-table admin-settlement-statement-table"><thead><tr><th>일자</th><th>주문 수</th><th>판매금액</th><th>수수료</th><th>정산금액</th></tr></thead><tbody>';
  (data.days || []).forEach((row) => {
    html += '<tr><td>' + escapeHtml(row.date) + '</td><td>' + (row.orderCount || 0) + '</td><td>' + formatMoney(row.totalAmount) + '</td><td>' + formatMoney(row.fee) + '</td><td>' + formatMoney(row.settlement) + '</td></tr>';
  });
  html += '<tr class="admin-settlement-statement-total"><td>합계</td><td>' + (data.totalOrderCount || 0) + '</td><td>' + formatMoney(data.totalSales) + '</td><td>' + formatMoney(data.totalFee) + '</td><td>' + formatMoney(data.totalSettlement) + '</td></tr>';
  html += '</tbody></table>';
  html += '<br><hr class="admin-settlement-statement-hr admin-settlement-statement-hr--footer"><br>';
  html += '</div>';

  html += '<div class="admin-settlement-statement-footer">';
  html += '<p>* 수수료는 판매금액의 18%이며, 정산금액 = 판매금액 − 수수료입니다.</p>';
  html += '<p>* 정산서 확인 후, 본사의 지정된 이메일 주소로 전자세금계산서 발행 부탁드립니다.</p>';
  html += '<p>* 정산금액은 귀사의 지정된 입금 계좌로 현금 지급됩니다.</p>';
  html += '</div>';
  html += '<br><br>';
  html += '<div class="admin-settlement-statement-issuer">';
  html += '<p>정산서 발행일: ' + escapeHtml(issueDate) + '</p>';
  html += '<p>정산서 발행처: (주)코코로키친</p>';
  html += '</div>';
  html += '</div></div>';
  return html;
}

function _showStatementSpinner(show) {
  const el = document.getElementById('adminSettlementStatementSpinner');
  if (!el) return;
  if (show) {
    el.style.display = '';
    el.innerHTML = '<div class="admin-settlement-spinner" role="status" aria-label="로딩 중"></div>';
  } else {
    el.innerHTML = '';
    el.style.display = 'none';
  }
}

async function runSettlementStatementSearch() {
  const dateSelectEl = document.getElementById('adminSettlementDateSelect');
  const slugEl = document.getElementById('adminSettlementBrandSelect');
  const resultBox = document.getElementById('adminSettlementStatementResult');
  if (!dateSelectEl || !slugEl || !resultBox) return;
  const slug = (slugEl.value || '').trim().toLowerCase();
  if (!slug) {
    _showStatementSpinner(false);
    resultBox.innerHTML = '';
    return;
  }
  const period = getPeriodForSettlementDate(dateSelectEl.value || '');
  if (!period) {
    _showStatementSpinner(false);
    resultBox.innerHTML = '<p class="admin-stats-error">정산 기준일을 선택해 주세요.</p>';
    return;
  }
  const startDate = period.start;
  const endDate = period.end;
  _showStatementSpinner(true);
  resultBox.innerHTML = '';
  if (SETTLEMENT_MOCK_FOR_TEST) {
    const slugNorm = slug.replace(/\s/g, '');
    const mockBrandSlug = (_mockFirstCategory.slug || '').replace(/\s/g, '');
    const brandLabel = (slugEl.options[slugEl.selectedIndex] && slugEl.options[slugEl.selectedIndex].text) || slug;
    if (slugNorm !== mockBrandSlug) {
      const emptyData = {
        brandTitle: brandLabel,
        slug,
        storeContactEmail: '',
        representative: '',
        startDate,
        endDate,
        days: [],
        totalOrderCount: 0,
        totalSales: 0,
        totalFee: 0,
        totalSettlement: 0,
      };
      _showStatementSpinner(false);
      resultBox.innerHTML = renderSettlementStatementContent(emptyData);
      return;
    }
    const mockStatementData = getMockSettlementStatementData(startDate, endDate);
    _showStatementSpinner(false);
    resultBox.innerHTML = renderSettlementStatementContent(mockStatementData);
    return;
  }
  try {
    const token = getToken();
    const res = await fetchWithTimeout(`${API_BASE}/api/admin/settlement-statement?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}&slug=${encodeURIComponent(slug)}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      _showStatementSpinner(false);
      resultBox.innerHTML = '<p class="admin-stats-error">' + escapeHtml(err.error || '정산서를 불러올 수 없습니다.') + '</p>';
      return;
    }
    const data = await res.json();
    _showStatementSpinner(false);
    resultBox.innerHTML = renderSettlementStatementContent(data);
  } catch (e) {
    _showStatementSpinner(false);
    resultBox.innerHTML = '<p class="admin-stats-error">' + escapeHtml(e.message || '정산서를 불러올 수 없습니다.') + '</p>';
  }
}

function printSettlementStatement() {
  const wrap = document.getElementById('adminSettlementStatementResult');
  const printEl = wrap?.querySelector('.admin-settlement-statement-print');
  if (!printEl || !printEl.innerHTML.trim()) {
    alert('먼저 브랜드를 선택하여 정산서를 생성한 뒤 PDF 출력해 주세요.');
    return;
  }
  const win = window.open('', '_blank');
  if (!win) {
    alert('팝업이 차단되었을 수 있습니다. 브라우저에서 팝업을 허용해 주세요.');
    return;
  }
  win.document.write(
    '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>정산서</title><style>' +
    'body{font-family:inherit;padding:24px;color:#333;font-size:14px;max-width:640px;margin:0 auto;}' +
    '.admin-settlement-statement-print{}' +
    '.admin-settlement-statement-header{text-align:center;margin-bottom:20px;}' +
    '.admin-settlement-statement-logo{margin:0 0 4px;font-size:1.25rem;font-weight:600;}' +
    '.admin-settlement-statement-title{margin:0 0 4px;font-size:0.875rem;color:#000;}' +
    '.admin-settlement-statement-period{margin:0 0 12px;font-size:0.875rem;color:#666;}' +
    '.admin-settlement-statement-hr{border:none;border-top:1px solid #ddd;margin:12px 0;}' +
    '.admin-settlement-statement-hr--footer{margin:20px 0 12px;}' +
    '.admin-settlement-statement-brand{margin-bottom:20px;font-size:0.875rem;}.admin-settlement-statement-brand p{margin:4px 0;}' +
    '.admin-settlement-statement-body{margin-bottom:12px;}.admin-settlement-statement-body>p{margin:0 0 8px;font-size:0.875rem;}' +
    'table{width:100%;border-collapse:collapse;}th,td{padding:10px 12px;text-align:left;border:1px solid #ddd;}' +
    'th{font-weight:600;background:#f5f5f5;}.admin-settlement-statement-total{font-weight:600;background:#f9f9f9;}' +
    '.admin-settlement-statement-footer{font-size:12px;color:#666;text-align:left;}.admin-settlement-statement-footer p{margin:4px 0;}' +
    '.admin-settlement-statement-issuer{text-align:left;font-size:13px;}.admin-settlement-statement-issuer p{margin:2px 0;}' +
    '</style></head><body>' + printEl.outerHTML + '</body></html>'
  );
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); win.close(); }, 300);
}

function _applySettlementPeriodResult(html) {
  const view = document.getElementById('settlementView');
  const box = view ? view.querySelector('#adminSettlementPeriodResult') : document.getElementById('adminSettlementPeriodResult');
  if (box) box.innerHTML = html;
}

var _periodSpinnerHtml = '<div class="admin-settlement-spinner" role="status" aria-label="로딩 중"></div>';

async function loadSettlementPeriod(settlementDateStr) {
  if (!settlementDateStr) return;
  const period = getPeriodForSettlementDate(settlementDateStr);
  if (!period) return;
  const periodSpinnerEl = document.getElementById('adminSettlementPeriodSpinner');
  if (periodSpinnerEl) {
    periodSpinnerEl.style.display = '';
    periodSpinnerEl.innerHTML = _periodSpinnerHtml;
  }
  _applySettlementPeriodResult('');
  if (SETTLEMENT_MOCK_FOR_TEST) {
    const data = getMockSettlementByBrandForPeriod(period.start, period.end);
    if (periodSpinnerEl) { periodSpinnerEl.innerHTML = ''; periodSpinnerEl.style.display = 'none'; }
    _applySettlementPeriodResult(renderMockSettlementTwoLists(data.executed || [], data.notExecuted || []));
    return;
  }
  const token = getToken();
  const requestedDate = settlementDateStr;
  try {
    const res = await fetchWithTimeout(`${API_BASE}/api/admin/settlement-period?startDate=${encodeURIComponent(period.start)}&endDate=${encodeURIComponent(period.end)}`, { headers: { Authorization: `Bearer ${token}` } });
    const currentSelect = document.getElementById('adminSettlementDateSelect');
    if (currentSelect && currentSelect.value !== requestedDate) {
      if (periodSpinnerEl) { periodSpinnerEl.innerHTML = ''; periodSpinnerEl.style.display = 'none'; }
      return;
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || '정산 내역을 불러올 수 없습니다.');
    }
    const data = await res.json();
    if (document.getElementById('adminSettlementDateSelect')?.value !== requestedDate) {
      if (periodSpinnerEl) { periodSpinnerEl.innerHTML = ''; periodSpinnerEl.style.display = 'none'; }
      return;
    }
    if (periodSpinnerEl) { periodSpinnerEl.innerHTML = ''; periodSpinnerEl.style.display = 'none'; }
    _applySettlementPeriodResult(renderMockSettlementTwoLists(data.byBrand || [], []));
  } catch (e) {
    if (document.getElementById('adminSettlementDateSelect')?.value !== requestedDate) {
      if (periodSpinnerEl) { periodSpinnerEl.innerHTML = ''; periodSpinnerEl.style.display = 'none'; }
      return;
    }
    if (periodSpinnerEl) { periodSpinnerEl.innerHTML = ''; periodSpinnerEl.style.display = 'none'; }
    _applySettlementPeriodResult('<p class="admin-stats-error">' + escapeHtml(e.message || '정산 내역을 불러올 수 없습니다.') + '</p>');
  }
}

async function loadSettlement() {
  const container = document.getElementById('adminSettlementContent');
  if (!container) return;

  const settlementDates = getSettlementDatesList();
  const defaultDate = settlementDates[0] || getKSTTodayString();

  const statementBlock =
    '<div class="admin-settlement-statement-area">' +
    '<h3 class="admin-settlement-statement-heading">정산서 출력<span id="adminSettlementStatementSpinner" class="admin-settlement-heading-spinner" style="display:none;"></span></h3>' +
    '<div class="admin-stats-daterange" style="margin-bottom:16px;">' +
    '<select id="adminSettlementBrandSelect" class="admin-settlement-brand-select"><option value="">브랜드 선택</option></select>' +
    '</div>' +
    '<div id="adminSettlementStatementResult" class="admin-settlement-statement-result"></div>' +
    '<div style="margin-top:16px;"><button type="button" class="admin-btn admin-settlement-pdf-btn" id="adminSettlementPdfBtn">PDF 출력하기</button></div>' +
    '</div>';

  const comboOptions = settlementDates.map((d) => '<option value="' + escapeHtml(d) + '"' + (d === defaultDate ? ' selected' : '') + '>' + escapeHtml(d) + '</option>').join('');
  const defaultPeriod = getPeriodForSettlementDate(defaultDate);
  const periodRangeLabel = defaultPeriod ? '>> 정산구간 : ' + defaultPeriod.start + '~' + defaultPeriod.end : '';
  container.innerHTML =
    '<div class="admin-settlement-period-select-wrap">' +
    '<h3 class="admin-settlement-period-heading">정산 기준일<span id="adminSettlementPeriodSpinner" class="admin-settlement-heading-spinner" style="display:none;"></span></h3>' +
    '<select id="adminSettlementDateSelect" class="admin-settlement-brand-select" style="min-width:160px;">' + comboOptions + '</select>' +
    '<p class="admin-settlement-caption" id="adminSettlementPeriodRangeLabel" style="margin-top:8px;">' + escapeHtml(periodRangeLabel) + '</p>' +
    '</div>' +
    '<section class="admin-stats-section"><h3>정산 내역' + (SETTLEMENT_MOCK_FOR_TEST ? ' <span class="admin-settlement-mock-badge">[샘플 데이터]</span>' : '') + '</h3><div id="adminSettlementPeriodResult"></div></section>' +
    statementBlock;

  document.getElementById('adminSettlementBrandSelect')?.addEventListener('change', runSettlementStatementSearch);
  document.getElementById('adminSettlementPdfBtn')?.addEventListener('click', printSettlementStatement);

  const dateSelect = document.getElementById('adminSettlementDateSelect');
  const rangeLabelEl = document.getElementById('adminSettlementPeriodRangeLabel');
  dateSelect?.addEventListener('change', function () {
    const val = this.value;
    if (!val) return;
    const period = getPeriodForSettlementDate(val);
    if (rangeLabelEl && period) rangeLabelEl.textContent = '>> 정산구간 : ' + period.start + '~' + period.end;
    const brandSelectEl = document.getElementById('adminSettlementBrandSelect');
    const statementResultEl = document.getElementById('adminSettlementStatementResult');
    if (brandSelectEl) brandSelectEl.value = '';
    if (statementResultEl) statementResultEl.innerHTML = '';
    setTimeout(() => loadSettlementPeriod(val), 0);
  });

  try {
    const storesRes = await fetchStores();
    const stores = (storesRes && storesRes.stores) || [];
    if (stores.length > 0) {
      const first = stores[0];
      _mockFirstCategory = {
        slug: (first.slug || first.id || '').toString().toLowerCase().trim(),
        brandTitle: (first.brand || first.title || first.id || first.slug || '').toString().trim() || _mockFirstCategory.slug,
        storeContactEmail: (first.storeContactEmail || '').toString().trim(),
        representative: (first.representative || '').toString().trim(),
      };
    }
    const sorted = stores.slice().sort((a, b) => (a.brand || a.title || a.id || '').toString().localeCompare((b.brand || b.title || b.id || '').toString(), 'ko'));
    const selectEl = document.getElementById('adminSettlementBrandSelect');
    if (selectEl) {
      selectEl.innerHTML = '<option value="">브랜드 선택</option>';
      sorted.forEach((s) => {
        const sid = (s.slug || s.id || '').toString().toLowerCase();
        const label = (s.brand || s.title || s.id || sid).toString().trim() || sid;
        if (sid) selectEl.appendChild(new Option(label, sid));
      });
    }
  } catch (_) {}

  await loadSettlementPeriod(defaultDate);
}

/** 로그관리 탭: blob(bzcat-blob-log) 목록 조회 후 테이블 렌더, 체크박스 shift/command 선택, 다운로드 */
let adminLogsList = []; // { pathname, dateLabel }[]

async function loadLogs() {
  const container = document.getElementById('adminLogsContent');
  if (!container) return;

  container.innerHTML = '<div class="admin-loading">로딩 중...</div>';
  const token = getToken();
  try {
    const res = await fetchWithTimeout(`${API_BASE}/api/admin/logs/list`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || '로그 목록을 불러올 수 없습니다.');
    }
    const data = await res.json();
    const blobs = data.blobs || [];
    adminLogsList = (blobs || []).map((b) => {
      const pathname = (b.pathname || b.name || '').toString();
      const url = (b.url || '').toString();
      const base = pathname.split('/').pop() || pathname;
      const dateLabel = base.replace(/\.csv$/i, '') || pathname;
      return { pathname, url, dateLabel };
    }).sort((a, b) => b.dateLabel.localeCompare(a.dateLabel));

    let tableRows = adminLogsList.map((item, idx) =>
      '<tr data-index="' + idx + '"><td class="admin-logs-col-check"><input type="checkbox" class="admin-logs-cb" data-pathname="' + escapeHtml(item.pathname) + '" data-url="' + escapeHtml(item.url) + '" data-index="' + idx + '" aria-label="' + escapeHtml(item.dateLabel) + ' 선택"></td><td>' + escapeHtml(item.dateLabel) + '</td></tr>'
    ).join('');
    if (tableRows === '') tableRows = '<tr><td colspan="2">등록된 로그가 없습니다.</td></tr>';

    container.innerHTML =
      '<h2 class="admin-logs-title">logs</h2>' +
      '<div class="admin-logs-table-wrap">' +
      '<table class="admin-logs-table"><thead><tr><th class="admin-logs-col-check">선택</th><th class="admin-logs-col-date">날짜</th></tr></thead><tbody>' + tableRows + '</tbody></table>' +
      '</div>' +
      '<div class="admin-logs-download-wrap"><button type="button" class="admin-logs-download-btn" id="adminLogsDownloadBtn">download</button></div>';

    const tbody = container.querySelector('.admin-logs-table tbody');
    const downloadBtn = document.getElementById('adminLogsDownloadBtn');
    if (!tbody || !downloadBtn) return;

    let lastClickedIndex = null;
    tbody.addEventListener('click', function (e) {
      const row = e.target.closest('tr[data-index]');
      const cb = e.target.closest('input.admin-logs-cb');
      if (!row || !cb) return;
      const idx = parseInt(row.dataset.index, 10);
      if (e.shiftKey) {
        if (lastClickedIndex == null) lastClickedIndex = idx;
        const from = Math.min(lastClickedIndex, idx);
        const to = Math.max(lastClickedIndex, idx);
        tbody.querySelectorAll('input.admin-logs-cb').forEach((input, i) => {
          input.checked = i >= from && i <= to;
        });
        e.preventDefault();
        return;
      }
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault();
        cb.checked = !cb.checked;
        lastClickedIndex = idx;
        return;
      }
      lastClickedIndex = idx;
    });

    function updateDownloadButtonState() {
      const any = container.querySelectorAll('input.admin-logs-cb:checked').length > 0;
      downloadBtn.disabled = !any;
    }
    tbody.querySelectorAll('input.admin-logs-cb').forEach((input) => {
      input.addEventListener('change', updateDownloadButtonState);
    });
    updateDownloadButtonState();

    downloadBtn.addEventListener('click', async function () {
      if (this.disabled) return;
      const checked = Array.from(container.querySelectorAll('input.admin-logs-cb:checked')).map((el) => ({ pathname: el.dataset.pathname || '', url: el.dataset.url || '' })).filter((x) => x.pathname || x.url);
      if (checked.length === 0) return;
      for (const { pathname, url } of checked) {
        try {
          const q = url ? `url=${encodeURIComponent(url)}` : `pathname=${encodeURIComponent(pathname)}`;
          const r = await fetchWithTimeout(`${API_BASE}/api/admin/logs/download?${q}`, { headers: { Authorization: `Bearer ${token}` } });
          if (!r.ok) continue;
          const blob = await r.blob();
          const objectUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = objectUrl;
          a.download = (pathname.split('/').pop() || pathname) || 'log.csv';
          a.click();
          URL.revokeObjectURL(objectUrl);
        } catch (_) {}
      }
    });
  } catch (e) {
    container.innerHTML = '<p class="admin-stats-error">' + escapeHtml(e.message || '로그 목록을 불러올 수 없습니다.') + '</p>';
  }
}

async function loadUsersManagement() {
  const container = document.getElementById('adminUsersContent');
  if (!container) return;
  container.innerHTML = '<div class="admin-loading">로딩 중...</div>';
  const token = getToken();
  try {
    const res = await fetchWithTimeout(`${API_BASE}/api/admin/users`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || '사용자 목록을 불러올 수 없습니다.');
    }
    const data = await res.json();
    adminUsersList = data.users || [];
    adminUsersSortKey = 'email';
    adminUsersSortDir = 'desc';

    const levelMark = (level) => {
      if (level === 'admin') return '***';
      if (level === 'operator') return '**';
      if (level === 'manager') return '*';
      return '';
    };
    const levelRank = (level) => {
      if (level === 'admin') return 3;
      if (level === 'operator') return 2;
      if (level === 'manager') return 1;
      return 0;
    };

    const renderUsersTable = () => {
      const sorted = adminUsersList.slice().sort((a, b) => {
        if (adminUsersSortKey === 'email') {
          const rankDiff = levelRank(a.level) - levelRank(b.level);
          if (rankDiff !== 0) return adminUsersSortDir === 'desc' ? -rankDiff : rankDiff;
          const emailCmp = (a.email || '').localeCompare((b.email || ''), 'en');
          return adminUsersSortDir === 'desc' ? -emailCmp : emailCmp;
        }
        const dateA = (a.latestOrderDate || '0000-00-00');
        const dateB = (b.latestOrderDate || '0000-00-00');
        const dateCmp = dateA.localeCompare(dateB);
        if (dateCmp !== 0) return adminUsersSortDir === 'desc' ? -dateCmp : dateCmp;
        const cntA = Number(a.recent3mCount || 0);
        const cntB = Number(b.recent3mCount || 0);
        return adminUsersSortDir === 'desc' ? (cntB - cntA) : (cntA - cntB);
      });

      let rows = sorted.map((u) => {
        const marker = levelMark(u.level);
        const emailWithLevel = marker ? `${u.email || '—'} ${marker}` : (u.email || '—');
        const recentOrderDate = `${u.latestOrderDate || '—'} (3개월 이내 ${Number(u.recent3mCount || 0)}번 주문)`;
        const orderLink = u.latestOrderId && u.latestOrderId !== '—'
          ? `<span class="admin-users-order-link" data-user-last-order="${escapeHtml(u.latestOrderId)}">주문 #${escapeHtml(u.latestOrderId)}</span>`
          : '—';
        return `<tr>
          <td>${escapeHtml(emailWithLevel)}</td>
          <td>${escapeHtml(u.contact || '—')}</td>
          <td>${escapeHtml(recentOrderDate)}</td>
          <td>${orderLink}</td>
        </tr>`;
      }).join('');
      if (!rows) rows = '<tr><td colspan="4">표시할 사용자가 없습니다.</td></tr>';

      const emailArrow = adminUsersSortKey === 'email' ? (adminUsersSortDir === 'desc' ? '▼' : '▲') : '△';
      const recentArrow = adminUsersSortKey === 'recent' ? (adminUsersSortDir === 'desc' ? '▼' : '▲') : '△';

      container.innerHTML =
        '<h2 class="admin-users-title">사용자관리</h2>' +
        '<div class="admin-users-table-wrap">' +
        '<table class="admin-users-table"><thead><tr>' +
        '<th class="admin-users-col-email">이메일<button type="button" class="admin-users-sort-btn" data-users-sort="email" aria-label="이메일 정렬">' + emailArrow + '</button></th>' +
        '<th class="admin-users-col-contact">연락처</th>' +
        '<th class="admin-users-col-last-date">최근주문일<button type="button" class="admin-users-sort-btn" data-users-sort="recent" aria-label="최근주문일 정렬">' + recentArrow + '</button></th>' +
        '<th class="admin-users-col-last-order">최근주문넘버</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table>' +
        '</div>';

      container.querySelectorAll('[data-user-last-order]').forEach((el) => {
        el.addEventListener('click', () => {
          const orderId = el.getAttribute('data-user-last-order');
          if (!orderId) return;
          openAdminOrderDetailById(orderId);
        });
      });

      container.querySelectorAll('[data-users-sort]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const key = btn.getAttribute('data-users-sort');
          if (!key) return;
          if (adminUsersSortKey === key) {
            adminUsersSortDir = adminUsersSortDir === 'desc' ? 'asc' : 'desc';
          } else {
            adminUsersSortKey = key;
            adminUsersSortDir = 'desc';
          }
          renderUsersTable();
        });
      });
    };

    renderUsersTable();
  } catch (e) {
    container.innerHTML = '<p class="admin-stats-error">' + escapeHtml(e.message || '사용자 목록을 불러올 수 없습니다.') + '</p>';
  }
}

function renderStats(container, data) {
  const orderSummary = data.orderSummary || {};
  const revenue = data.revenue || {};
  const conversion = data.conversion || {};
  const delivery = data.delivery || {};
  const topMenus = data.topMenus || [];
  const timeSeries = data.timeSeries || [];
  const crm = data.crm || {};
  const alerts = data.alerts || {};
  const dateRange = data.dateRange || {};
  const defaultRange = getDefaultStatsRange();
  const startVal = dateRange.startDate || defaultRange.start;
  const endVal = dateRange.endDate || defaultRange.end;
  const formatMoney = (n) => Number(n || 0).toLocaleString() + '원';
  let html = '<div class="admin-stats-toolbar"><div class="admin-stats-daterange"><input type="date" id="adminStatsStartDate" value="' + escapeHtml(startVal) + '"><span>~</span><input type="date" id="adminStatsEndDate" value="' + escapeHtml(endVal) + '"><button type="button" class="admin-stats-search-btn" id="adminStatsApplyBtn" title="조회" aria-label="조회"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg></button></div>';
  const activePreset = getActiveStatsPreset(startVal, endVal);
  const presetClass = (key) => 'admin-stats-preset-btn' + (activePreset === key ? ' active' : '');
  html += '<div class="admin-stats-presets">';
  html += '<div class="admin-stats-preset-row"><button type="button" class="' + presetClass('today') + '" data-preset="today">오늘</button><button type="button" class="' + presetClass('this_week') + '" data-preset="this_week">이번주</button><button type="button" class="' + presetClass('last_week') + '" data-preset="last_week">지난1주일</button><button type="button" class="' + presetClass('this_month') + '" data-preset="this_month">이번달</button><button type="button" class="' + presetClass('last_month') + '" data-preset="last_month">지난1개월</button></div>';
  html += '</div></div>';
  html += '<div class="admin-stats-section"><h3>주문 현황</h3><p class="admin-stats-big">총 주문 <strong>' + (orderSummary.total ?? 0) + '</strong>건</p><div class="admin-stats-grid">';
  const byStatus = orderSummary.byStatus || {};
  Object.entries(byStatus).forEach(function (e) {
    const v = e[1];
    html += '<div class="admin-stats-card"><span class="admin-stats-card-label">' + escapeHtml((v && v.label) || e[0]) + '</span><span class="admin-stats-card-value">' + ((v && v.count) ?? 0) + '</span></div>';
  });
  html += '</div><br><h4 class="admin-stats-brand-heading">브랜드별 주문</h4><ul class="admin-stats-list">';
  const byStore = orderSummary.byStore || {};
  Object.entries(byStore).forEach(function (e) {
    const v = e[1];
    const progress = (v && v.count) ?? 0;
    const cancelled = (v && v.cancelledCount) ?? 0;
    html += '<li>' + escapeHtml((v && v.title) || e[0]) + ' : 진행 <strong>' + progress + '</strong>건 (취소 <strong>' + cancelled + '</strong>건)</li>';
  });
  html += '</ul></div>';
  const revTotal = Number(revenue.total) || 0;
  const revExpected = Number(revenue.expected) || 0;
  const totalRevText = formatMoney(revTotal) + (revExpected > 0 ? ' (+' + formatMoney(revExpected) + ' 예정)' : '');
  html += '<div class="admin-stats-section"><h3>매출</h3><p class="admin-stats-big">총 매출 <strong>' + totalRevText + '</strong></p><br><h4 class="admin-stats-brand-heading">브랜드별 매출</h4><ul class="admin-stats-list">';
  const revByStore = revenue.byStore || {};
  Object.entries(revByStore).forEach(function (e) {
    const v = e[1];
    const amt = Number(v && v.amount) || 0;
    const exp = Number(v && v.expected) || 0;
    const line = formatMoney(amt) + (exp > 0 ? ' (+' + formatMoney(exp) + ' 예정)' : '');
    html += '<li>' + escapeHtml((v && v.title) || e[0]) + ' : ' + line + '</li>';
  });
  html += '</ul></div>';
  html += '<div class="admin-stats-section"><h3 class="admin-stats-section-title-with-hint">일 매출<span class="admin-stats-section-hint">&nbsp;*매출은 예상매출 포함</span></h3><table class="admin-stats-table admin-stats-table-cols3"><thead><tr><th>날짜</th><th>진행주문</th><th>매출</th></tr></thead><tbody>';
  timeSeries.slice(-14).reverse().forEach(function (d) {
    html += '<tr><td>' + escapeHtml(d.date) + '</td><td>' + d.orders + '</td><td>' + formatMoney(d.revenue) + '</td></tr>';
  });
  html += '</tbody></table></div>';
  const menuFilterLimit = adminStatsMenuFilter === 'top10' ? 10 : (topMenus.length || 20);
  const menuList = topMenus.slice(0, menuFilterLimit);
  const menuFilterLabel = adminStatsMenuFilter === 'top10' ? 'top10' : 'all';
  html += '<div class="admin-stats-section"><div class="admin-stats-section-title-row"><h3 class="admin-stats-section-title">메뉴 매출<span class="admin-stats-section-hint">&nbsp;*매출은 예상매출 포함</span></h3><span class="admin-stats-menu-filter"><button type="button" class="admin-stats-menu-filter-btn active" data-menu-filter-toggle>' + menuFilterLabel + '</button></span></div><table class="admin-stats-table admin-stats-table-cols3 admin-stats-table-menu"><thead><tr><th>메뉴</th><th>진행주문</th><th>매출</th></tr></thead><tbody>';
  menuList.forEach(function (m) {
    html += '<tr><td>' + escapeHtml(m.name) + '</td><td>' + m.orderCount + '</td><td>' + formatMoney(m.revenue) + '</td></tr>';
  });
  html += '</tbody></table></div>';
  const totalOrders = Number(orderSummary.total) || 0;
  const n2 = Number(conversion.paymentCompleted) || 0;
  const n3 = Number(conversion.cancelledBeforePayment) || 0;
  const n4 = Number(conversion.cancelledAfterPayment) || 0;
  const n5 = Number(conversion.deliveryCompleted) || 0;
  const pct = (a, b) => (b > 0 ? ((a / b) * 100).toFixed(1) : '0.0');
  html += '<div class="admin-stats-section"><h3>전환율</h3><ul class="admin-stats-list">';
  html += '<li>전체 주문 <strong>' + totalOrders + '</strong> → 결제완료 <strong>' + n2 + '</strong> (' + pct(n2, totalOrders) + '%)</li>';
  html += '<li>전체 주문 <strong>' + totalOrders + '</strong> → 결제전취소 <strong>' + n3 + '</strong> (' + pct(n3, totalOrders) + '%)</li>';
  html += '<li>결제완료 <strong>' + n2 + '</strong> → 결제후취소 <strong>' + n4 + '</strong> (' + pct(n4, n2) + '%)</li>';
  html += '<li>결제완료 <strong>' + n2 + '</strong> → 배송완료 <strong>' + n5 + '</strong> (' + pct(n5, n2) + '%)</li>';
  html += '</ul></div>';
  html += '<div class="admin-stats-section admin-stats-section-crm"><h3>고객 분석<span class="admin-stats-section-hint">&nbsp;*매출은 예상매출 포함</span></h3><table class="admin-stats-table"><thead><tr><th>이메일</th><th>진행주문</th><th>매출</th><th>마지막 주문일</th><th>고객 클러스터</th></tr></thead><tbody>';
  (crm.byCustomer || []).forEach(function (c) {
    const lastDate = c.lastOrderAt ? new Date(c.lastOrderAt).toLocaleDateString('ko-KR') : '—';
    html += '<tr><td>' + escapeHtml(c.email) + '</td><td>' + c.orderCount + '</td><td>' + formatMoney(c.totalAmount) + '</td><td>' + lastDate + '</td><td>n/a</td></tr>';
  });
  html += '</tbody></table></div>';
  container.innerHTML = html;
  document.getElementById('adminStatsApplyBtn')?.addEventListener('click', loadStats);
  container.querySelectorAll('.admin-stats-preset-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const preset = btn.getAttribute('data-preset');
      const range = getPresetStatsRange(preset);
      if (!range) return;
      const startEl = document.getElementById('adminStatsStartDate');
      const endEl = document.getElementById('adminStatsEndDate');
      if (startEl) startEl.value = range.start;
      if (endEl) endEl.value = range.end;
      loadStats();
    });
  });
  container.querySelectorAll('[data-menu-filter-toggle]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      adminStatsMenuFilter = adminStatsMenuFilter === 'top10' ? 'all' : 'top10';
      if (adminStatsLastData) renderStats(container, adminStatsLastData);
    });
  });
}

function getStatusLabel(status, cancelReason) {
  const s = (status || '').trim();
  const labels = {
    submitted: '신청 완료',
    order_accepted: '결제준비중',
    payment_link_issued: '결제 링크 발급',
    payment_completed: '결제 완료',
    shipping: '배송중',
    delivery_completed: '배송 완료',
    cancelled: '주문취소',
  };
  const base = labels[s] || s || '—';
  return s === 'cancelled' && cancelReason ? `${base}(${cancelReason})` : base;
}

function formatAdminOrderDate(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}.${m}.${day} ${h}:${min}`;
}

function formatAdminPrice(price) {
  return Number(price || 0).toLocaleString() + '원';
}

/** itemId에서 매장 slug 추출 (storeSlugs 있으면 longest-prefix 매칭, 없으면 마지막 세그먼트 제외) */
function getSlugFromItemIdInAdmin(itemId, storeSlugs) {
  const id = String(itemId || '').trim().toLowerCase();
  if (!id) return 'default';
  if (Array.isArray(storeSlugs) && storeSlugs.length > 0) {
    const sorted = [...new Set(storeSlugs)].map((s) => String(s || '').toLowerCase()).filter(Boolean).sort((a, b) => b.length - a.length);
    for (const s of sorted) {
      if (id === s || id.startsWith(s + '-')) return s;
    }
  }
  const parts = id.split('-');
  return parts.length > 1 ? parts.slice(0, -1).join('-') : (parts[0] || 'default');
}

/** slugToDisplayName: 서버에서 받은 slug별 브랜드/표시명 (있으면 우선 사용). storeSlugs: 매장 slug 목록(선택, itemId→slug longest match용) */
function renderAdminOrderDetailHtml(order, slugToDisplayName, storeSlugs) {
  const orderItems = order.order_items || order.orderItems || [];
  const byCategory = {};
  for (const oi of orderItems) {
    const itemId = (oi.id || '').toString();
    const slug = getSlugFromItemIdInAdmin(itemId, storeSlugs);
    const item = { name: oi.name || '', price: Number(oi.price) || 0 };
    const qty = Number(oi.quantity) || 0;
    if (qty <= 0) continue;
    if (!byCategory[slug]) byCategory[slug] = [];
    byCategory[slug].push({ item, qty });
  }
  const slugsInOrder = Object.keys(byCategory);
  const slugMatches = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
  const categoryOrder = adminStoreOrder.length
    ? adminStoreOrder.filter((s) => slugsInOrder.some((k) => slugMatches(k, s))).concat(slugsInOrder.filter((s) => !adminStoreOrder.some((a) => slugMatches(a, s))).sort())
    : slugsInOrder.sort();
  for (const slug of Object.keys(byCategory)) {
    byCategory[slug].sort((a, b) => (a.item.name || '').localeCompare(b.item.name || '', 'ko'));
  }
  const categoryTotals = {};
  for (const slug of Object.keys(byCategory)) {
    categoryTotals[slug] = byCategory[slug].reduce((sum, { item, qty }) => sum + item.price * qty, 0);
  }
  const displayNameForSlug = (slug) => {
    if (slugToDisplayName && (slugToDisplayName[slug] !== undefined || slugToDisplayName[String(slug).toLowerCase()] !== undefined))
      return slugToDisplayName[slug] || slugToDisplayName[String(slug).toLowerCase()];
    return adminStoresMap[slug] || adminStoresMap[String(slug).toLowerCase()] || slug;
  };
  const renderItem = ({ item, qty }) => `
    <div class="admin-order-detail-item">
      <div class="cart-item-info">
        <div class="cart-item-name">${escapeHtml(item.name || '')}</div>
        <div class="cart-item-price">${formatAdminPrice(item.price)} × ${qty}</div>
      </div>
    </div>
  `;
  return categoryOrder
    .filter(slug => byCategory[slug]?.length)
    .map(slug => {
      const title = displayNameForSlug(slug);
      const catTotal = categoryTotals[slug] || 0;
      const itemsHtml = byCategory[slug].map(renderItem).join('');
      return `
        <div class="cart-category-group">
          <div class="cart-category-header">
            <span class="cart-category-title">${escapeHtml(title || '')}</span>
            <span class="cart-category-total met">${formatAdminPrice(catTotal)}</span>
          </div>
          ${itemsHtml}
        </div>
      `;
    })
    .join('');
}

/** 주문 번호로 서버에서 전체 주문 조회 후 팝업 오픈 (목록 응답의 order는 order_items 누락 가능성 있어 항상 단건 API 사용) */
async function openAdminOrderDetailById(orderId) {
  const content = document.getElementById('adminOrderDetailContent');
  const overlay = document.getElementById('adminOrderDetailOverlay');
  if (!content || !overlay) return;
  overlay.classList.add('visible');
  overlay.setAttribute('aria-hidden', 'false');
  content.innerHTML = '<div class="admin-loading">로딩 중...</div>';
  const token = getToken();
  try {
    const res = await fetchWithTimeout(`${API_BASE}/api/admin/order?orderId=${encodeURIComponent(orderId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      content.innerHTML = '<p class="admin-stats-error">' + escapeHtml(err.error || '주문을 불러올 수 없습니다.') + '</p>';
      return;
    }
    const data = await res.json();
    const order = data.order;
    const slugToDisplayName = data.slugToDisplayName || null;
    const storeSlugs = data.storeSlugs || null;
    if (!order) {
      content.innerHTML = '<p class="admin-stats-error">주문을 찾을 수 없습니다.</p>';
      return;
    }
    openAdminOrderDetail(order, slugToDisplayName, storeSlugs);
  } catch (e) {
    content.innerHTML = '<p class="admin-stats-error">' + escapeHtml(e.message || '주문을 불러올 수 없습니다.') + '</p>';
  }
}

function openAdminOrderDetail(order, slugToDisplayName, storeSlugs) {
  const content = document.getElementById('adminOrderDetailContent');
  const totalEl = document.getElementById('adminOrderDetailTotal');
  const pdfBtn = document.getElementById('adminOrderDetailPdfBtn');
  const overlay = document.getElementById('adminOrderDetailOverlay');
  const panel = overlay?.querySelector('.admin-order-detail-panel');
  if (!content || !overlay) return;
  let html = renderAdminOrderDetailHtml(order, slugToDisplayName, storeSlugs);
  if (!html || !html.trim()) {
    html = '<p class="admin-settlement-empty">주문 메뉴 내역이 없습니다.</p>';
  }
  content.innerHTML = `<div class="order-detail-list order-detail-cart-style">${html}</div>`;
  if (totalEl) totalEl.textContent = formatAdminPrice(order.total_amount || 0);
  if (panel) panel.classList.toggle('admin-order-detail-cancelled', order.status === 'cancelled');
  if (pdfBtn) {
    pdfBtn.href = '#';
    pdfBtn.style.display = '';
    pdfBtn.textContent = order.status === 'cancelled' ? '주문서 확인 (취소 건)' : '주문서 확인';
    const orderIdForPdf = order.id;
    pdfBtn.onclick = async (e) => {
      e.preventDefault();
      const token = getToken();
      if (!token) return;
      try {
        const res = await fetch(`${API_BASE}/api/orders/pdf?orderId=${encodeURIComponent(orderIdForPdf)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank', 'noopener,noreferrer');
      } catch (_) {}
    };
  }
  overlay.classList.add('visible');
  overlay.setAttribute('aria-hidden', 'false');
}

function closeAdminOrderDetail() {
  const overlay = document.getElementById('adminOrderDetailOverlay');
  if (overlay) {
    overlay.classList.remove('visible');
    overlay.setAttribute('aria-hidden', 'true');
  }
}

async function init() {
  const authResult = await checkAdmin();
  if (!authResult.ok) {
    showLoadingError(authResult.error || '접근할 수 없습니다.');
    return;
  }
  
  adminUserLevel = authResult.user?.level || 'admin';
  const pageTitleEl = document.getElementById('adminPageTitle');
  if (pageTitleEl) pageTitleEl.textContent = adminUserLevel === 'operator' ? 'Operator' : 'Admin';
  document.title = (adminUserLevel === 'operator' ? 'Operator' : 'Admin') + ' - BzCat';
  setupTabs();
  adminPaymentPeriod = '45days';
  adminPaymentSortBy = 'created_at';
  adminPaymentSortDir = { created_at: 'desc', delivery_date: 'desc' };
  loadPaymentManagement();

  document.getElementById('adminOrderDetailClose')?.addEventListener('click', closeAdminOrderDetail);
  document.getElementById('adminOrderDetailOverlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'adminOrderDetailOverlay') closeAdminOrderDetail();
  });

  function closeApiSettingsModal() {
    const modal = document.getElementById('adminApiSettingsModal');
    if (modal) {
      modal.classList.remove('admin-modal-visible');
      modal.setAttribute('aria-hidden', 'true');
    }
  }
  function applyApiSettingsModal() {
    const modal = document.getElementById('adminApiSettingsModal');
    const modalInput = document.getElementById('adminApiSettingsEnvVar');
    const modalWidgetInput = document.getElementById('adminApiSettingsWidgetEnvVar');
    const businessDaysContainer = document.getElementById('adminApiSettingsBusinessDays');
    const businessHoursContainer = document.getElementById('adminApiSettingsBusinessHours');
    const deliveryFeeModalInput = document.getElementById('adminApiSettingsDeliveryFee');
    const storeId = modal?.dataset?.currentStoreId;
    if (!storeId) return;
    const storeEl = Array.from(document.querySelectorAll('.admin-store')).find((el) => el.dataset.storeId === storeId);
    const apiKeyInput = storeEl?.querySelector('input[data-field="apiKeyEnvVar"]');
    const widgetKeyInput = storeEl?.querySelector('input[data-field="widgetClientKeyEnvVar"]');
    const businessDaysInput = storeEl?.querySelector('input[data-field="businessDays"]');
    const businessHoursInput = storeEl?.querySelector('input[data-field="businessHours"]');
    const deliveryFeeInput = storeEl?.querySelector('input[data-field="deliveryFee"]');
    if (apiKeyInput) apiKeyInput.value = (modalInput?.value || '').trim() || 'TOSS_SECRET_KEY';
    if (widgetKeyInput) widgetKeyInput.value = (modalWidgetInput?.value || '').trim() || 'TOSS_WIDGET_CLIENT_KEY';
    if (businessDaysContainer && businessDaysInput) {
      const checked = Array.from(businessDaysContainer.querySelectorAll('input[data-day]:checked'))
        .map((cb) => parseInt(cb.dataset.day, 10))
        .sort((a, b) => a - b);
      businessDaysInput.value = checked.length ? checked.join(',') : '0,1,2,3,4,5,6';
    }
    if (businessHoursContainer && businessHoursInput) {
      const checked = Array.from(businessHoursContainer.querySelectorAll('input[data-slot]:checked'))
        .map((cb) => cb.dataset.slot)
        .filter(Boolean);
      businessHoursInput.value = checked.length ? checked.join(',') : BUSINESS_HOURS_SLOTS.join(',');
    }
    if (deliveryFeeInput && deliveryFeeModalInput) {
      const parsedFee = parseInt(deliveryFeeModalInput.value || '50000', 10);
      deliveryFeeInput.value = Number.isFinite(parsedFee) && parsedFee >= 0 ? String(parsedFee) : '50000';
    }
    closeApiSettingsModal();
  }
  document.getElementById('adminApiSettingsModalClose')?.addEventListener('click', closeApiSettingsModal);
  document.getElementById('adminApiSettingsCancel')?.addEventListener('click', closeApiSettingsModal);
  document.getElementById('adminApiSettingsApply')?.addEventListener('click', applyApiSettingsModal);
  document.getElementById('adminApiSettingsModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'adminApiSettingsModal') closeApiSettingsModal();
    if (e.target.closest('[data-settings-tab]')) {
      const tab = e.target.closest('[data-settings-tab]');
      const modal = tab.closest('#adminApiSettingsModal');
      if (!modal) return;
      const tabId = tab.dataset.settingsTab;
      modal.querySelectorAll('.admin-modal-tab').forEach((t) => t.classList.toggle('active', t.dataset.settingsTab === tabId));
      const panelMap = { 'payment-env': 'adminSettingsPanelPaymentEnv', 'business-days': 'adminSettingsPanelBusinessDays', 'business-hours': 'adminSettingsPanelBusinessHours', 'delivery-fee': 'adminSettingsPanelDeliveryFee' };
      const panelId = panelMap[tabId];
      modal.querySelectorAll('.admin-modal-panel').forEach((p) => p.classList.remove('active'));
      if (panelId) document.getElementById(panelId)?.classList.add('active');
    }
  });

  try {
    const { stores, menus } = await fetchStores();
    const content = document.getElementById('adminContent');
    const indexHtml = stores.length > 1
      ? `<div class="admin-index">
          <span class="admin-index-label">바로가기</span>
          <div class="admin-index-btns">
            ${stores.map((s) => `<button type="button" class="admin-btn admin-btn-index" data-goto-store="${escapeHtml(s.id || '')}">${escapeHtml(s.title || s.id || '')}</button>`).join('')}
          </div>
        </div>`
      : '';
    content.innerHTML = `
      ${indexHtml}
      <div class="admin-stores-list" id="adminStoresList">
        ${stores.map((s) => renderStore(s, menus[s.id] || [])).join('')}
      </div>
      <div class="admin-add-store-row">
        <button type="button" class="admin-btn admin-btn-secondary admin-btn-add-store" data-add-store>+ 카테고리 추가</button>
        <button type="button" class="admin-btn admin-btn-reorder-stores" data-reorder-stores aria-label="카테고리 순서 변경" title="카테고리 순서 변경"><span class="admin-reorder-icon" aria-hidden="true">↕</span></button>
      </div>
    `;

    content.addEventListener('click', async (e) => {
      if (e.target.closest('[data-scroll-top]')) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      if (e.target.closest('[data-store-settings]')) {
        const btn = e.target.closest('[data-store-settings]');
        const storeEl = btn.closest('.admin-store');
        const storeId = storeEl?.dataset?.storeId;
        const apiKeyInput = storeEl?.querySelector('input[data-field="apiKeyEnvVar"]');
        const widgetKeyInput = storeEl?.querySelector('input[data-field="widgetClientKeyEnvVar"]');
        const businessDaysInput = storeEl?.querySelector('input[data-field="businessDays"]');
        const businessHoursInput = storeEl?.querySelector('input[data-field="businessHours"]');
        const deliveryFeeInput = storeEl?.querySelector('input[data-field="deliveryFee"]');
        const modal = document.getElementById('adminApiSettingsModal');
        const modalInput = document.getElementById('adminApiSettingsEnvVar');
        const modalWidgetInput = document.getElementById('adminApiSettingsWidgetEnvVar');
        const deliveryFeeModalInput = document.getElementById('adminApiSettingsDeliveryFee');
        const modalTitle = document.getElementById('adminApiSettingsStoreTitle');
        const businessDaysContainer = document.getElementById('adminApiSettingsBusinessDays');
        const businessHoursContainer = document.getElementById('adminApiSettingsBusinessHours');
        if (storeId && apiKeyInput && modal && modalInput) {
          modal.dataset.currentStoreId = storeId;
          modalTitle.textContent = storeEl.querySelector('.admin-store-title')?.textContent || storeId;
          modalInput.value = apiKeyInput.value || 'TOSS_SECRET_KEY';
          if (modalWidgetInput && widgetKeyInput) modalWidgetInput.value = widgetKeyInput.value || 'TOSS_WIDGET_CLIENT_KEY';
          const daysStr = businessDaysInput?.value || '0,1,2,3,4,5,6';
          const days = daysStr.split(',').map((d) => parseInt(d, 10)).filter((n) => !isNaN(n) && n >= 0 && n <= 6);
          businessDaysContainer?.querySelectorAll('input[data-day]').forEach((cb) => {
            cb.checked = days.includes(parseInt(cb.dataset.day, 10));
          });
          const hoursStr = businessHoursInput?.value || BUSINESS_HOURS_SLOTS.join(',');
          const hoursSet = new Set(hoursStr.split(',').map((s) => s.trim()).filter(Boolean));
          businessHoursContainer?.querySelectorAll('input[data-slot]').forEach((cb) => {
            cb.checked = hoursSet.has(cb.dataset.slot);
          });
          if (deliveryFeeModalInput) {
            const parsedDeliveryFee = parseInt(deliveryFeeInput?.value || '50000', 10);
            deliveryFeeModalInput.value = Number.isFinite(parsedDeliveryFee) && parsedDeliveryFee >= 0 ? String(parsedDeliveryFee) : '50000';
          }
          modal.querySelectorAll('.admin-modal-tab').forEach((t) => t.classList.remove('active'));
          modal.querySelector('[data-settings-tab="payment-env"]')?.classList.add('active');
          modal.querySelectorAll('.admin-modal-panel').forEach((p) => p.classList.remove('active'));
          document.getElementById('adminSettingsPanelPaymentEnv')?.classList.add('active');
          modal.classList.add('admin-modal-visible');
          modal.setAttribute('aria-hidden', 'false');
        }
      }
      if (e.target.closest('[data-goto-store]')) {
        const storeId = e.target.closest('[data-goto-store]').dataset.gotoStore;
        const el = document.getElementById(`admin-store-${storeId}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      if (e.target.closest('[data-reorder-stores]')) {
        openReorderStoresModal();
      }
      if (e.target.closest('[data-add-store]')) {
        const list = document.getElementById('adminStoresList');
        const indexBtns = document.querySelector('.admin-index-btns');
        const newStore = {
          id: generateStoreId(),
          slug: generateStoreId(),
          title: '새 카테고리',
          brand: '',
          storeAddress: '',
          storeContact: '',
          storeContactEmail: '',
          representative: '',
          bizNo: '',
          suburl: '',
          businessDays: [0, 1, 2, 3, 4, 5, 6],
          businessHours: [...BUSINESS_HOURS_SLOTS],
          deliveryFee: 50000,
          payment: { apiKeyEnvVar: 'TOSS_SECRET_KEY', widgetClientKeyEnvVar: 'TOSS_WIDGET_CLIENT_KEY' },
        };
        const div = document.createElement('div');
        div.innerHTML = renderStore(newStore, []);
        list.appendChild(div.firstElementChild);
        if (indexBtns) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'admin-btn admin-btn-index';
          btn.dataset.gotoStore = newStore.id;
          btn.textContent = newStore.title;
          indexBtns.appendChild(btn);
        }
      }
      if (e.target.closest('[data-delete-store]')) {
        const btn = e.target.closest('[data-delete-store]');
        const storeEl = btn.closest('.admin-store');
        const list = document.getElementById('adminStoresList');
        if (list && list.querySelectorAll('.admin-store').length <= 1) {
          alert('최소 1개 이상의 카테고리가 필요합니다.');
          return;
        }
        const menuCount = storeEl.querySelectorAll('.admin-menu-item').length;
        if (menuCount > 0) {
          alert('메뉴가 1개라도 있으면 카테고리를 삭제할 수 없습니다. 먼저 메뉴를 모두 삭제해 주세요.');
          return;
        }
        if (confirm('이 카테고리를 삭제하시겠습니까?')) {
          const gotoBtn = content.querySelector(`[data-goto-store="${storeEl.dataset.storeId}"]`);
          if (gotoBtn) gotoBtn.remove();
          storeEl.remove();
          try {
            await handleSave();
          } catch (err) {
            showError(err.message);
          }
        }
      }
      if (e.target.closest('[data-upload-btn]')) {
        const btn = e.target.closest('[data-upload-btn]');
        const item = btn.closest('.admin-menu-item');
        const fileInput = item?.querySelector('[data-upload-input]');
        if (fileInput) fileInput.click();
      }
      if (e.target.closest('[data-menu-toggle]')) {
        const btn = e.target.closest('[data-menu-toggle]');
        const section = btn?.closest('.admin-section-menu');
        const wrap = section?.querySelector('.admin-menu-list-wrap');
        if (wrap) {
          wrap.classList.toggle('admin-menu-list-collapsed');
          btn.textContent = wrap.classList.contains('admin-menu-list-collapsed') ? '▼' : '▲';
          btn.setAttribute('aria-label', wrap.classList.contains('admin-menu-list-collapsed') ? '메뉴 목록 열기' : '메뉴 목록 접기');
          btn.setAttribute('title', wrap.classList.contains('admin-menu-list-collapsed') ? '메뉴 목록 열기/접기' : '메뉴 목록 열기/접기');
        }
      }
      if (e.target.closest('[data-add-menu]')) {
        const storeId = e.target.closest('[data-add-menu]').dataset.addMenu;
        const list = content.querySelector(`.admin-menu-list[data-store-id="${storeId}"]`);
        const newItem = { id: generateId(storeId), name: '', price: 0, description: '', origin: '', imageUrl: '' };
        const div = document.createElement('div');
        div.innerHTML = renderMenuItem(storeId, newItem, list.children.length);
        const itemEl = div.firstElementChild;
        itemEl.dataset.menuId = newItem.id;
        list.appendChild(itemEl);
        const storeEl = content.querySelector(`.admin-store[data-store-id="${storeId}"]`);
        const titleSpan = storeEl?.querySelector('.admin-section-menu .admin-section-title');
        if (titleSpan) titleSpan.textContent = '메뉴 (' + list.querySelectorAll('.admin-menu-item').length + ')';
      }
      if (e.target.closest('[data-menu-move]')) {
        const btn = e.target.closest('[data-menu-move]');
        const dir = btn?.dataset?.menuMove;
        const itemEl = btn?.closest('.admin-menu-item');
        const list = itemEl?.closest('.admin-menu-list');
        if (!itemEl || !list || !dir) return;
        if (dir === 'up') {
          const prev = itemEl.previousElementSibling;
          if (prev) list.insertBefore(itemEl, prev);
        } else {
          const next = itemEl.nextElementSibling;
          if (next) list.insertBefore(next, itemEl);
        }
        const storeEl = list?.closest('.admin-store');
        const titleSpan = storeEl?.querySelector('.admin-section-menu .admin-section-title');
        if (titleSpan && list) titleSpan.textContent = '메뉴 (' + list.querySelectorAll('.admin-menu-item').length + ')';
      }
      if (e.target.closest('[data-remove-menu]')) {
        const btn = e.target.closest('[data-remove-menu]');
        const itemEl = btn?.closest('.admin-menu-item');
        const menuId = itemEl?.dataset?.menuId;
        if (menuId) {
          try {
            const token = getToken();
            const res = await fetch(`${API_BASE}/api/admin/check-menu-in-use?menuId=${encodeURIComponent(menuId)}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json().catch(() => ({}));
            if (data.inUse === true) {
              alert('해당 메뉴는 주문 진행중입니다.');
              return;
            }
          } catch (err) {
            alert(err.message || '확인에 실패했습니다.');
            return;
          }
        }
        const storeEl = itemEl?.closest('.admin-store');
        itemEl?.remove();
        if (storeEl) {
          const list = storeEl.querySelector('.admin-menu-list');
          const titleSpan = storeEl.querySelector('.admin-section-menu .admin-section-title');
          if (titleSpan && list) titleSpan.textContent = '메뉴 (' + list.querySelectorAll('.admin-menu-item').length + ')';
        }
      }
      if (e.target.closest('[data-save]')) {
        handleSave();
      }
    });

    content.addEventListener('blur', (e) => {
      const input = e.target;
      if (input?.getAttribute('data-field') === 'bizNo' && input.value?.trim()) {
        const formatted = formatBizNo(input.value.trim());
        if (formatted) input.value = formatted;
      }
    });

    content.addEventListener('input', (e) => {
      const input = e.target;
      if (input?.getAttribute('data-field') === 'suburl') {
        const cursor = input.selectionStart;
        const raw = input.value;
        const filtered = raw.toLowerCase().replace(/[^a-z]/g, '');
        if (raw !== filtered) {
          input.value = filtered;
          input.setSelectionRange(Math.min(cursor, filtered.length), Math.min(cursor, filtered.length));
        }
      }
    });

    content.addEventListener('change', async (e) => {
      const input = e.target.closest('[data-upload-input]');
      if (!input || !input.files?.length) return;
      const file = input.files[0];
      const item = input.closest('.admin-menu-item');
      const urlInput = item?.querySelector('input[data-field="imageUrl"]');
      const thumb = item?.querySelector('.admin-menu-thumb');
      const btn = item?.querySelector('[data-upload-btn]');
      if (!urlInput) return;
      const origText = btn?.textContent;
      if (btn) btn.disabled = true;
      if (btn) btn.textContent = '업로드 중...';
      try {
        const url = await uploadImage(file);
        urlInput.value = url;
        if (thumb) {
          const safeUrl = safeImageUrl(url);
          thumb.innerHTML = safeUrl ? `<img src="${escapeHtml(safeUrl)}" alt="" onerror="this.parentElement.innerHTML='<span class=\\'placeholder\\'>📷</span>'">` : '<span class="placeholder">📷</span>';
        }
      } catch (err) {
        alert(err.message);
      } finally {
        input.value = '';
        if (btn) { btn.disabled = false; btn.textContent = origText || '📤 업로드'; }
      }
    });
  } catch (err) {
    showLoadingError(err.message || '로딩에 실패했습니다.', true);
    document.getElementById('adminError').style.display = 'none';
  }
}

function openReorderStoresModal() {
  const list = document.getElementById('adminStoresList');
  if (!list) return;
  const storeEls = list.querySelectorAll('.admin-store');
  const items = [...storeEls].map((el) => ({
    id: el.dataset.storeId,
    title: (el.querySelector('.admin-store-title')?.textContent?.trim()) || (el.querySelector('input[data-field="title"]')?.value?.trim()) || el.dataset.storeId || '',
  }));
  const listContainer = document.getElementById('adminReorderStoresList');
  if (!listContainer) return;
  listContainer.innerHTML = items
    .map(
      (item) =>
        `<li data-store-id="${escapeHtml(item.id)}" class="admin-reorder-modal-item">
          <span class="admin-reorder-modal-title">${escapeHtml(item.title)}</span>
          <div class="admin-reorder-modal-move">
            <button type="button" data-move-up aria-label="위로">↑</button>
            <button type="button" data-move-down aria-label="아래로">↓</button>
          </div>
        </li>`
    )
    .join('');
  const modal = document.getElementById('adminReorderStoresModal');
  if (modal) {
    modal.classList.add('admin-modal-visible');
    modal.setAttribute('aria-hidden', 'false');
  }
}

function closeReorderStoresModal() {
  const modal = document.getElementById('adminReorderStoresModal');
  if (modal) {
    modal.classList.remove('admin-modal-visible');
    modal.setAttribute('aria-hidden', 'true');
  }
}

function applyReorderAndSave() {
  const listEl = document.getElementById('adminReorderStoresList');
  const storesList = document.getElementById('adminStoresList');
  const indexBtns = document.querySelector('.admin-index-btns');
  if (!listEl || !storesList) return;
  const order = [...listEl.querySelectorAll('li')].map((li) => li.dataset.storeId);
  const storeEls = storesList.querySelectorAll('.admin-store');
  const byId = {};
  storeEls.forEach((el) => {
    byId[el.dataset.storeId] = el;
  });
  order.forEach((id) => {
    if (byId[id]) storesList.appendChild(byId[id]);
  });
  if (indexBtns) {
    const btns = indexBtns.querySelectorAll('[data-goto-store]');
    const btnById = {};
    btns.forEach((b) => {
      btnById[b.dataset.gotoStore] = b;
    });
    order.forEach((id) => {
      if (btnById[id]) indexBtns.appendChild(btnById[id]);
    });
  }
  handleSave();
}

async function handleSave() {
  hideError();
  try {
    const { stores, menus } = collectData();
    for (const store of stores) {
      if (!isValidKoreanMobile(store.storeContact)) {
        alert('정상적인 핸드폰 번호를 입력해주세요.');
        return;
      }
    }
    await saveStores(stores, menus);
    alert('저장되었습니다.');
  } catch (err) {
    showError(err.message);
  }
}

(function bindReorderStoresModal() {
  const modal = document.getElementById('adminReorderStoresModal');
  if (!modal) return;
  modal.querySelector('#adminReorderStoresModalClose')?.addEventListener('click', closeReorderStoresModal);
  modal.querySelector('#adminReorderStoresCancel')?.addEventListener('click', closeReorderStoresModal);
  modal.querySelector('#adminReorderStoresConfirm')?.addEventListener('click', () => {
    applyReorderAndSave();
    closeReorderStoresModal();
  });
  document.getElementById('adminReorderStoresList')?.addEventListener('click', (e) => {
    const up = e.target.closest('[data-move-up]');
    const down = e.target.closest('[data-move-down]');
    if (up) {
      const li = up.closest('li');
      if (li?.previousElementSibling) li.parentNode.insertBefore(li, li.previousElementSibling);
    } else if (down) {
      const li = down.closest('li');
      if (li?.nextElementSibling) li.parentNode.insertBefore(li.nextElementSibling, li);
    }
  });
})();

init();
