/**
 * Admin 페이지 - 매장·메뉴·결제정보 관리
 */

const TOKEN_KEY = 'bzcat_token';
const API_BASE = '';
const FETCH_TIMEOUT_MS = 15000;

let adminPaymentOrders = [];
let adminPaymentTotal = 0;
let adminPaymentSortBy = 'created_at'; // 'created_at' | 'delivery_date'
let adminPaymentSortDir = { created_at: 'desc', delivery_date: 'desc' }; // 'asc' = 오래된순(↑), 'desc' = 최신순(↓)
let adminPaymentSubFilter = 'all'; // 'all' | 'new' | 'payment_wait' | 'delivery_wait'
let adminStoresMap = {};
let adminStoreOrder = []; // slug order for order detail

const PAYMENT_IDLE_MS = 180000; // 180초 무활동 시 주문 목록 리프레시
let paymentIdleTimerId = null;
let paymentIdleListenersAttached = false;
let adminPaymentFlashIntervals = [];

// 이미지 규칙: 1:1 비율, 권장 400x400px
const IMAGE_RULE = '가로·세로 1:1 비율, 권장 400×400px';

const BUSINESS_HOURS_SLOTS = ['09:00-10:00', '10:00-11:00', '11:00-12:00', '12:00-13:00', '13:00-14:00', '14:00-15:00', '15:00-16:00', '16:00-17:00', '17:00-18:00', '18:00-19:00', '19:00-20:00', '20:00-21:00'];

async function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function fetchWithTimeout(url, options, timeoutMs) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs || FETCH_TIMEOUT_MS);
  return fetch(url, { ...options, signal: ctrl.signal }).finally(() => clearTimeout(id));
}

async function checkAdmin() {
  const token = await getToken();
  if (!token) return { ok: false, error: '로그인이 필요합니다.' };
  try {
    const res = await fetchWithTimeout(`${API_BASE}/api/auth/session`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) return { ok: false, error: '세션이 만료되었습니다.' };
    const data = await res.json();
    const isAdmin = data.user?.level === 'admin';
    return { ok: isAdmin, error: isAdmin ? null : '관리자만 접근할 수 있습니다.' };
  } catch (e) {
    return { ok: false, error: e.name === 'AbortError' ? '요청 시간이 초과되었습니다.' : (e.message || '연결에 실패했습니다.') };
  }
}

async function fetchStores() {
  const token = await getToken();
  try {
    const res = await fetchWithTimeout(`${API_BASE}/api/admin/stores`, {
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
  const token = await getToken();
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
  const token = await getToken();
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

function generateStoreId() {
  return `store-${Date.now().toString(36)}`;
}

function renderStore(store, menus) {
  const payment = store.payment || { apiKeyEnvVar: 'TOSS_SECRET_KEY' };
  const items = menus || [];

  return `
    <div class="admin-store" id="admin-store-${store.id.replace(/"/g, '')}" data-store-id="${store.id}">
      <div class="admin-store-header">
        <span class="admin-store-title">${store.title || store.id}</span>
        <div class="admin-store-header-actions">
          <button type="button" class="admin-btn admin-btn-top" data-scroll-top aria-label="맨 위로">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
          </button>
          <button type="button" class="admin-btn admin-btn-danger admin-btn-delete-store" data-delete-store="${store.id}" title="카테고리 삭제">삭제</button>
        </div>
      </div>
      <div class="admin-store-body">
        <div class="admin-section">
          <div class="admin-section-title-row">
            <span class="admin-section-title">매장 정보</span>
            <button type="button" class="admin-btn admin-btn-icon admin-btn-settings" data-store-settings="${store.id}" aria-label="API 환경변수 설정" title="API 환경변수 설정">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            </button>
          </div>
          <div class="admin-form-row">
            <div class="admin-form-field">
              <label>대분류</label>
              <input type="text" data-field="title" value="${(store.title || '').replace(/"/g, '&quot;')}" placeholder="예: 도시락">
            </div>
          </div>
          <input type="hidden" data-field="apiKeyEnvVar" value="${(payment.apiKeyEnvVar || 'TOSS_SECRET_KEY').replace(/"/g, '&quot;')}">
          <input type="hidden" data-field="businessDays" value="${(store.businessDays && Array.isArray(store.businessDays) ? store.businessDays : [0,1,2,3,4,5,6]).join(',')}">
          <input type="hidden" data-field="businessHours" value="${(store.businessHours && Array.isArray(store.businessHours) ? store.businessHours : BUSINESS_HOURS_SLOTS).join(',')}">
        </div>
        <div class="admin-section">
          <div class="admin-section-title">브랜드</div>
          <div class="admin-form-row">
            <div class="admin-form-field">
              <label>브랜드명</label>
              <input type="text" data-field="brand" value="${(store.brand || '').replace(/"/g, '&quot;')}" placeholder="예: OO브랜드">
            </div>
            <div class="admin-form-field" style="flex: 2;">
              <label>매장주소</label>
              <input type="text" data-field="storeAddress" value="${(store.storeAddress || '').replace(/"/g, '&quot;')}" placeholder="예: 서울시 강남구 OO로 123">
            </div>
            <div class="admin-form-field">
              <label>사업자등록번호</label>
              <input type="text" data-field="bizNo" value="${(store.bizNo || '').replace(/"/g, '&quot;')}" placeholder="예: 000-00-00000">
            </div>
          </div>
          <div class="admin-form-row admin-form-row--brand-row2">
            <div class="admin-form-field admin-form-field--representative">
              <label>대표자</label>
              <input type="text" data-field="representative" value="${(store.representative || '').replace(/"/g, '&quot;')}" placeholder="대표자명">
            </div>
            <div class="admin-form-field">
              <label>담당자연락처</label>
              <input type="text" data-field="storeContact" value="${(store.storeContact || '').replace(/"/g, '&quot;')}" placeholder="예: 02-1234-5678">
            </div>
            <div class="admin-form-field admin-form-field--store-contact-email">
              <label>담당자이메일</label>
              <input type="email" data-field="storeContactEmail" value="${(store.storeContactEmail || '').replace(/"/g, '&quot;')}" placeholder="예: contact@example.com">
            </div>
            <div class="admin-form-field">
              <label>suburl</label>
              <input type="text" data-field="suburl" value="${(store.suburl || '').replace(/"/g, '&quot;')}" placeholder="영어 소문자" pattern="[a-z]*" autocomplete="off">
            </div>
          </div>
        </div>
        <div class="admin-section">
          <div class="admin-section-title">메뉴</div>
          <div class="admin-menu-list" data-store-id="${store.id}">
            ${items.map((item, i) => renderMenuItem(store.id, item, i)).join('')}
          </div>
          <button type="button" class="admin-btn admin-btn-secondary admin-btn-add" data-add-menu="${store.id}">+ 메뉴 추가</button>
        </div>
        <div class="admin-save-bar">
          <button type="button" class="admin-btn admin-btn-primary" data-save>저장</button>
        </div>
      </div>
    </div>
  `;
}

function renderMenuItem(storeId, item, index) {
  const imgContent = item.imageUrl
    ? `<img src="${item.imageUrl.replace(/"/g, '&quot;')}" alt="" onerror="this.parentElement.innerHTML='<span class=\\'placeholder\\'>📷</span>'">`
    : '<span class="placeholder">📷</span>';
  return `
    <div class="admin-menu-item" data-menu-index="${index}" data-menu-id="${(item.id || '').replace(/"/g, '&quot;')}">
      <div class="admin-menu-thumb">${imgContent}</div>
      <div class="admin-menu-fields">
        <div class="admin-form-field">
          <label>메뉴명</label>
          <input type="text" data-field="name" value="${(item.name || '').replace(/"/g, '&quot;')}" placeholder="메뉴명">
        </div>
        <div class="admin-form-row">
          <div class="admin-form-field">
            <label>가격 (원)</label>
            <input type="number" data-field="price" value="${item.price || 0}" placeholder="0" min="0">
          </div>
          <div class="admin-form-field admin-form-field-image" style="flex: 2;">
            <label>이미지</label>
            <div class="admin-image-input-row">
              <input type="url" data-field="imageUrl" value="${(item.imageUrl || '').replace(/"/g, '&quot;')}" placeholder="URL 또는 업로드">
              <input type="file" data-upload-input accept="image/jpeg,image/png,image/webp,image/gif" style="display:none">
              <button type="button" class="admin-btn admin-btn-upload" data-upload-btn title="파일 업로드">📤 업로드</button>
            </div>
            <div class="admin-image-rule">${IMAGE_RULE}</div>
          </div>
        </div>
        <div class="admin-form-field">
          <label>설명</label>
          <textarea data-field="description" placeholder="메뉴 설명">${(item.description || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>
        </div>
      </div>
      <div class="admin-menu-actions">
        <button type="button" class="admin-btn admin-btn-danger" data-remove-menu data-store-id="${storeId}" data-index="${index}">삭제</button>
      </div>
    </div>
  `;
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
    const businessDaysInput = storeEl.querySelector('input[data-field="businessDays"]');
    const businessHoursInput = storeEl.querySelector('input[data-field="businessHours"]');
    const businessDaysStr = businessDaysInput?.value?.trim() || '0,1,2,3,4,5,6';
    const businessDays = businessDaysStr.split(',').map((d) => parseInt(d, 10)).filter((n) => !isNaN(n) && n >= 0 && n <= 6);
    const businessHoursStr = businessHoursInput?.value?.trim() || BUSINESS_HOURS_SLOTS.join(',');
    const businessHours = businessHoursStr.split(',').map((s) => s.trim()).filter((s) => BUSINESS_HOURS_SLOTS.includes(s));
    const store = { id: storeId, slug: storeId, title: titleInput?.value?.trim() || storeId, brand: brandInput?.value?.trim() || '', storeAddress: storeAddressInput?.value?.trim() || '', storeContact: storeContactInput?.value?.trim() || '', storeContactEmail: storeContactEmailInput?.value?.trim() || '', representative: representativeInput?.value?.trim() || '', bizNo: bizNoInput?.value?.trim() || '', suburl: (suburlInput?.value?.trim() || '').toLowerCase().replace(/[^a-z]/g, ''), businessDays: businessDays.length ? businessDays.sort((a, b) => a - b) : [0, 1, 2, 3, 4, 5, 6], businessHours: businessHours.length ? businessHours : [...BUSINESS_HOURS_SLOTS], payment: {
      apiKeyEnvVar: apiKeyEnvVarInput?.value?.trim() || 'TOSS_SECRET_KEY',
    } };
    stores.push(store);

    const menuList = storeEl.querySelector('.admin-menu-list');
    const items = [];
    menuList?.querySelectorAll('.admin-menu-item').forEach((itemEl) => {
      const nameInput = itemEl.querySelector('input[data-field="name"]');
      const priceInput = itemEl.querySelector('input[data-field="price"]');
      const descInput = itemEl.querySelector('textarea[data-field="description"]');
      const imageInput = itemEl.querySelector('input[data-field="imageUrl"]');
      const name = nameInput?.value?.trim();
      if (!name) return;
      items.push({
        id: itemEl.dataset.menuId || generateId(storeId),
        name,
        price: parseInt(priceInput?.value || '0', 10) || 0,
        description: descInput?.value?.trim() || '',
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
      <p>${msg}</p>
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
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.dataset.tab;
      tabs.forEach(t => t.classList.remove('active'));
      views.forEach(v => v.classList.remove('active'));
      tab.classList.add('active');
      if (targetTab === 'stores') {
        document.getElementById('storesView').classList.add('active');
        clearPaymentIdleTimer();
      } else if (targetTab === 'payments') {
        document.getElementById('paymentsView').classList.add('active');
        loadPaymentManagement().then(() => startPaymentIdleRefresh());
      }
    });
  });

  document.getElementById('adminPaymentRefreshBtn')?.addEventListener('click', () => {
    const btn = document.getElementById('adminPaymentRefreshBtn');
    if (btn) {
      btn.classList.add('admin-refresh-pressed');
      setTimeout(() => btn.classList.remove('admin-refresh-pressed'), 1000);
    }
    refetchPaymentOrdersAndRender();
  });
}

/** 신청 완료 주문이 주문일+1일 15:00까지 승인/거절되지 않은 경우 true */
function isOverdueForAccept(order) {
  if (order.status !== 'submitted') return false;
  const created = new Date(order.created_at);
  const deadline = new Date(created);
  deadline.setDate(deadline.getDate() + 1);
  deadline.setHours(15, 0, 0, 0);
  return new Date() > deadline;
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

  const newCount = allOrders.filter(o => !cancelled(o) && (o.status === 'submitted' || o.status === 'order_accepted')).length;
  const paymentWaitCount = allOrders.filter(o => !cancelled(o) && o.status === 'payment_link_issued').length;
  const deliveryWaitCount = allOrders.filter(o => !cancelled(o) && o.status === 'payment_completed').length;

  let filtered;
  if (adminPaymentSubFilter === 'new') {
    filtered = allOrders.filter(o => o.status === 'submitted' || o.status === 'order_accepted');
  } else if (adminPaymentSubFilter === 'payment_wait') {
    filtered = allOrders.filter(o => o.status === 'payment_link_issued');
  } else if (adminPaymentSubFilter === 'delivery_wait') {
    filtered = allOrders.filter(o => o.status === 'payment_completed');
  } else {
    filtered = allOrders.slice();
  }

  const sortBy = adminPaymentSortBy;
  const dir = adminPaymentSortDir[sortBy] || 'desc';
  const sorted = sortPaymentOrders(filtered, sortBy, dir);

  const arrow = (key) => (adminPaymentSortDir[key] === 'asc' ? ' ↑' : ' ↓');
  const sortBar = `
    <div class="admin-payment-sort">
      <div class="admin-payment-sort-btns">
        <button type="button" class="admin-payment-sort-btn ${sortBy === 'created_at' ? 'active' : ''}" data-sort="created_at">주문시간${arrow('created_at')}</button>
        <button type="button" class="admin-payment-sort-btn ${sortBy === 'delivery_date' ? 'active' : ''}" data-sort="delivery_date">배송희망일시${arrow('delivery_date')}</button>
      </div>
    </div>
    <div class="admin-payment-subfilter">
      <span class="admin-payment-subfilter-item ${adminPaymentSubFilter === 'all' ? 'active' : ''}" data-subfilter="all" role="button" tabindex="0">전체보기</span>
      <span class="admin-payment-subfilter-item ${adminPaymentSubFilter === 'new' ? 'active' : ''}" data-subfilter="new" role="button" tabindex="0">신규주문 ${newCount}개</span>
      <span class="admin-payment-subfilter-item ${adminPaymentSubFilter === 'payment_wait' ? 'active' : ''}" data-subfilter="payment_wait" role="button" tabindex="0">결제대기 ${paymentWaitCount}개</span>
      <span class="admin-payment-subfilter-item ${adminPaymentSubFilter === 'delivery_wait' ? 'active' : ''}" data-subfilter="delivery_wait" role="button" tabindex="0">배송대기 ${deliveryWaitCount}개</span>
    </div>
  `;

  const ordersHtml = sorted.map(order => {
    const deliveryDate = new Date(order.delivery_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysUntilDelivery = Math.ceil((deliveryDate - today) / (1000 * 60 * 60 * 24));
    const isCancelled = order.status === 'cancelled';
    const isUrgent = !isCancelled && daysUntilDelivery <= 7 && !(order.payment_link && String(order.payment_link).trim());
    const isPaymentDone = order.status === 'payment_completed' || order.status === 'shipping' || order.status === 'delivery_completed';
    const paymentLinkRowDisabled = isCancelled || isPaymentDone || order.status === 'submitted' || !!(order.payment_link && String(order.payment_link).trim());
    const shippingRowDisabled = order.status !== 'payment_completed';
    const deliveryRowDisabled = order.status !== 'shipping';
    const shippingValue = (order.status === 'shipping' || order.status === 'delivery_completed') ? (order.tracking_number || '') : '';
    const overdue = isOverdueForAccept(order);
    const orderIdEl = overdue
      ? `<span class="admin-payment-order-id admin-overdue-flash admin-payment-order-id-link" data-order-detail="${order.id}" data-overdue-flash role="button" tabindex="0"><span class="admin-overdue-id">주문 #${order.id}</span><span class="admin-overdue-msg">주문 신청을 승인해 주세요.</span></span>`
      : `<span class="admin-payment-order-id admin-payment-order-id-link" data-order-detail="${order.id}" role="button" tabindex="0">주문 #${order.id}</span>`;

    return `
      <div class="admin-payment-order ${isCancelled ? 'admin-payment-order-cancelled' : ''}" data-order-id="${order.id}">
        <div class="admin-payment-order-header">
          ${orderIdEl}
          <span class="admin-payment-order-status ${order.status}">${getStatusLabel(order.status, order.cancel_reason)}</span>
        </div>
        <div class="admin-payment-order-info">
          <div>주문시간: ${formatAdminOrderDate(order.created_at)}</div>
          <div>배송희망: ${order.delivery_date} ${order.delivery_time || ''}${isCancelled ? '' : ` <span class="${daysUntilDelivery <= 7 ? 'admin-days-urgent' : ''}">(D-${daysUntilDelivery})</span>`}</div>
          <div>배송주소: ${[(order.delivery_address || '').trim(), (order.detail_address || '').trim()].filter(Boolean).join(' ') || '—'}</div>
          <div>주문자: ${order.depositor || '—'} / ${order.contact || '—'}</div>
          <div>이메일: ${order.user_email || '—'}</div>
          <div>총액: ${formatAdminPrice(order.total_amount)}</div>
        </div>
        <div class="admin-payment-link-row">
          <input 
            type="text" 
            class="admin-payment-link-input ${isUrgent ? 'urgent' : ''}" 
            value="${order.payment_link || ''}" 
            data-order-id="${order.id}"
            placeholder="결제 생성 코드 입력"
            ${paymentLinkRowDisabled ? 'readonly disabled' : ''}
          >
          <button 
            type="button" 
            class="admin-btn admin-btn-primary admin-payment-link-btn" 
            data-save-link="${order.id}"
            ${paymentLinkRowDisabled ? 'disabled' : ''}
          >저장</button>
        </div>
        <div class="admin-payment-link-row">
          <input 
            type="text" 
            class="admin-payment-link-input admin-shipping-input" 
            value="${(shippingValue || '').replace(/"/g, '&quot;')}" 
            data-order-id="${order.id}"
            data-shipping-input="${order.id}"
            placeholder="배송 번호 입력"
            ${shippingRowDisabled ? 'readonly disabled' : ''}
          >
          <button 
            type="button" 
            class="admin-btn admin-btn-primary admin-payment-link-btn" 
            data-save-shipping="${order.id}"
            ${shippingRowDisabled ? 'disabled' : ''}
          >저장</button>
        </div>
        <div class="admin-payment-link-row">
          <input 
            type="text" 
            class="admin-payment-link-input admin-delivery-input" 
            value="${order.status === 'delivery_completed' ? `주문 #${order.id}` : ''}" 
            data-order-id="${order.id}"
            data-delivery-input="${order.id}"
            placeholder="배송 완료 코드 입력"
            ${deliveryRowDisabled ? 'readonly disabled' : ''}
          >
          <button 
            type="button" 
            class="admin-btn admin-btn-primary admin-payment-link-btn" 
            data-save-delivery="${order.id}"
            ${deliveryRowDisabled ? 'disabled' : ''}
          >저장</button>
        </div>
        <div class="admin-payment-order-delete-row">
          ${order.status !== 'cancelled' && (order.status === 'submitted' || order.status === 'order_accepted' || order.status === 'payment_link_issued') ? `<button type="button" class="admin-payment-cancel-btn" data-cancel-order="${order.id}">취소</button>` : ''}
          <button type="button" class="admin-payment-delete-btn" data-delete-order="${order.id}">삭제</button>
        </div>
      </div>
    `;
  }).join('');

  const showLoadMore = adminPaymentSubFilter === 'all' && adminPaymentOrders.length < adminPaymentTotal;
  const loadMoreHtml = showLoadMore
    ? `<div class="admin-payment-load-more-wrap"><button type="button" class="admin-btn admin-payment-load-more-btn" data-payment-load-more>더 보기</button></div>`
    : '';
  content.innerHTML = sortBar + ordersHtml + loadMoreHtml;

  adminPaymentFlashIntervals.forEach(id => clearInterval(id));
  adminPaymentFlashIntervals = [];
  content.querySelectorAll('[data-overdue-flash]').forEach(el => {
    const id = setInterval(() => {
      el.classList.toggle('admin-overdue-show-msg');
    }, 1500);
    adminPaymentFlashIntervals.push(id);
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
      const order = adminPaymentOrders.find(o => o.id === orderId);
      if (order) openAdminOrderDetail(order);
    });
  });

  content.querySelector('[data-payment-load-more]')?.addEventListener('click', () => loadMorePaymentOrders());

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
        const token = await getToken();
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
      const trackingNumber = input?.value?.trim() || '';

      const digitsOnly = /^\d{9,11}$/;
      if (!digitsOnly.test(trackingNumber)) {
        alert('배송 번호 입력 오류');
        return;
      }

      btn.disabled = true;
      btn.textContent = '저장 중...';

      try {
        const token = await getToken();
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
        const token = await getToken();
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
        const token = await getToken();
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
        const token = await getToken();
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

const PAYMENT_PAGE_SIZE = 25;

async function loadPaymentManagement() {
  const content = document.getElementById('adminPaymentContent');
  content.innerHTML = '<div class="admin-loading">로딩 중...</div>';

  try {
    const token = await getToken();
    const res = await fetchWithTimeout(`${API_BASE}/api/admin/orders?limit=${PAYMENT_PAGE_SIZE}&offset=0`, {
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
          const slug = s.slug || s.id;
          adminStoresMap[slug] = s.title || slug;
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
    content.innerHTML = `<div class="admin-loading admin-error"><p>${e.message || '오류가 발생했습니다.'}</p></div>`;
  }
}

async function loadMorePaymentOrders() {
  const btn = document.querySelector('[data-payment-load-more]');
  if (btn) btn.disabled = true;
  try {
    const token = await getToken();
    const offset = adminPaymentOrders.length;
    const res = await fetchWithTimeout(`${API_BASE}/api/admin/orders?limit=${PAYMENT_PAGE_SIZE}&offset=${offset}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) return;
    const { orders } = await res.json();
    if (Array.isArray(orders) && orders.length) {
      adminPaymentOrders = adminPaymentOrders.concat(orders);
      renderPaymentList();
    }
  } catch (_) {}
  if (btn) btn.disabled = false;
}

async function refetchPaymentOrdersAndRender() {
  const content = document.getElementById('adminPaymentContent');
  try {
    const token = await getToken();
    const currentLen = adminPaymentOrders.length;
    const limit = Math.max(PAYMENT_PAGE_SIZE, currentLen);
    const res = await fetchWithTimeout(`${API_BASE}/api/admin/orders?limit=${limit}&offset=0`, {
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

function renderAdminOrderDetailHtml(order) {
  const orderItems = order.order_items || [];
  const byCategory = {};
  for (const oi of orderItems) {
    const itemId = oi.id || '';
    const slug = (itemId.split('-')[0] || 'default');
    const item = { name: oi.name || '', price: Number(oi.price) || 0 };
    const qty = Number(oi.quantity) || 0;
    if (qty <= 0) continue;
    if (!byCategory[slug]) byCategory[slug] = [];
    byCategory[slug].push({ item, qty });
  }
  const categoryOrder = adminStoreOrder.length ? adminStoreOrder : Object.keys(byCategory).sort();
  for (const slug of Object.keys(byCategory)) {
    byCategory[slug].sort((a, b) => (a.item.name || '').localeCompare(b.item.name || '', 'ko'));
  }
  const categoryTotals = {};
  for (const slug of Object.keys(byCategory)) {
    categoryTotals[slug] = byCategory[slug].reduce((sum, { item, qty }) => sum + item.price * qty, 0);
  }
  const renderItem = ({ item, qty }) => `
    <div class="admin-order-detail-item">
      <div class="cart-item-info">
        <div class="cart-item-name">${(item.name || '').replace(/</g, '&lt;')}</div>
        <div class="cart-item-price">${formatAdminPrice(item.price)} × ${qty}</div>
      </div>
    </div>
  `;
  return categoryOrder
    .filter(slug => byCategory[slug]?.length)
    .map(slug => {
      const title = adminStoresMap[slug] || slug;
      const catTotal = categoryTotals[slug] || 0;
      const itemsHtml = byCategory[slug].map(renderItem).join('');
      return `
        <div class="cart-category-group">
          <div class="cart-category-header">
            <span class="cart-category-title">${(title || '').replace(/</g, '&lt;')}</span>
            <span class="cart-category-total met">${formatAdminPrice(catTotal)}</span>
          </div>
          ${itemsHtml}
        </div>
      `;
    })
    .join('');
}

function openAdminOrderDetail(order) {
  const content = document.getElementById('adminOrderDetailContent');
  const totalEl = document.getElementById('adminOrderDetailTotal');
  const pdfBtn = document.getElementById('adminOrderDetailPdfBtn');
  const overlay = document.getElementById('adminOrderDetailOverlay');
  const panel = overlay?.querySelector('.admin-order-detail-panel');
  if (!content || !overlay) return;
  const html = renderAdminOrderDetailHtml(order);
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
      const token = await getToken();
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
  
  setupTabs();
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
    const businessDaysContainer = document.getElementById('adminApiSettingsBusinessDays');
    const businessHoursContainer = document.getElementById('adminApiSettingsBusinessHours');
    const storeId = modal?.dataset?.currentStoreId;
    if (!storeId) return;
    const storeEl = Array.from(document.querySelectorAll('.admin-store')).find((el) => el.dataset.storeId === storeId);
    const apiKeyInput = storeEl?.querySelector('input[data-field="apiKeyEnvVar"]');
    const businessDaysInput = storeEl?.querySelector('input[data-field="businessDays"]');
    const businessHoursInput = storeEl?.querySelector('input[data-field="businessHours"]');
    if (apiKeyInput) apiKeyInput.value = (modalInput?.value || '').trim() || 'TOSS_SECRET_KEY';
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
      const panelMap = { 'payment-env': 'adminSettingsPanelPaymentEnv', 'business-days': 'adminSettingsPanelBusinessDays', 'business-hours': 'adminSettingsPanelBusinessHours' };
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
            ${stores.map((s) => `<button type="button" class="admin-btn admin-btn-index" data-goto-store="${s.id}">${s.title || s.id}</button>`).join('')}
          </div>
        </div>`
      : '';
    content.innerHTML = `
      ${indexHtml}
      <div class="admin-stores-list" id="adminStoresList">
        ${stores.map((s) => renderStore(s, menus[s.id] || [])).join('')}
      </div>
      <button type="button" class="admin-btn admin-btn-secondary admin-btn-add-store" data-add-store>+ 카테고리 추가</button>
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
        const businessDaysInput = storeEl?.querySelector('input[data-field="businessDays"]');
        const businessHoursInput = storeEl?.querySelector('input[data-field="businessHours"]');
        const modal = document.getElementById('adminApiSettingsModal');
        const modalInput = document.getElementById('adminApiSettingsEnvVar');
        const modalTitle = document.getElementById('adminApiSettingsStoreTitle');
        const businessDaysContainer = document.getElementById('adminApiSettingsBusinessDays');
        const businessHoursContainer = document.getElementById('adminApiSettingsBusinessHours');
        if (storeId && apiKeyInput && modal && modalInput) {
          modal.dataset.currentStoreId = storeId;
          modalTitle.textContent = storeEl.querySelector('.admin-store-title')?.textContent || storeId;
          modalInput.value = apiKeyInput.value || 'TOSS_SECRET_KEY';
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
          payment: { apiKeyEnvVar: 'TOSS_SECRET_KEY' },
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
      if (e.target.closest('[data-add-menu]')) {
        const storeId = e.target.closest('[data-add-menu]').dataset.addMenu;
        const list = content.querySelector(`.admin-menu-list[data-store-id="${storeId}"]`);
        const newItem = { id: generateId(storeId), name: '', price: 0, description: '', imageUrl: '' };
        const div = document.createElement('div');
        div.innerHTML = renderMenuItem(storeId, newItem, list.children.length);
        const itemEl = div.firstElementChild;
        itemEl.dataset.menuId = newItem.id;
        list.appendChild(itemEl);
      }
      if (e.target.closest('[data-remove-menu]')) {
        const btn = e.target.closest('[data-remove-menu]');
        const itemEl = btn?.closest('.admin-menu-item');
        const menuId = itemEl?.dataset?.menuId;
        if (menuId) {
          try {
            const token = await getToken();
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
        itemEl?.remove();
      }
      if (e.target.closest('[data-save]')) {
        handleSave();
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
          thumb.innerHTML = `<img src="${url.replace(/"/g, '&quot;')}" alt="" onerror="this.parentElement.innerHTML='<span class=\\'placeholder\\'>📷</span>'">`;
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

async function handleSave() {
  hideError();
  try {
    const { stores, menus } = collectData();
    await saveStores(stores, menus);
    alert('저장되었습니다.');
  } catch (err) {
    showError(err.message);
  }
}

init();
