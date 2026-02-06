/**
 * Admin 페이지 - 매장·메뉴·결제정보 관리
 */

const TOKEN_KEY = 'bzcat_token';
const API_BASE = '';
const FETCH_TIMEOUT_MS = 15000;

let adminPaymentOrders = [];
let adminPaymentSortBy = 'created_at'; // 'created_at' | 'delivery_date'
let adminPaymentShowAll = false; // false: 취소 제외, true: 전체(취소 포함)
let adminStoresMap = {};
let adminStoreOrder = []; // slug order for order detail

// 이미지 규칙: 1:1 비율, 권장 400x400px
const IMAGE_RULE = '가로·세로 1:1 비율, 권장 400×400px';

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
    const email = (data.user?.email || '').toLowerCase();
    const isAdmin = data.user?.level === 'admin' || email === 'bzcatmanager@gmail.com';
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
          <div class="admin-section-title">매장 정보</div>
          <div class="admin-form-row">
            <div class="admin-form-field">
              <label>대분류</label>
              <input type="text" data-field="title" value="${(store.title || '').replace(/"/g, '&quot;')}" placeholder="예: 도시락">
            </div>
          </div>
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
              <label>담당자연락처</label>
              <input type="text" data-field="storeContact" value="${(store.storeContact || '').replace(/"/g, '&quot;')}" placeholder="예: 02-1234-5678">
            </div>
          </div>
        </div>
        <div class="admin-section">
          <div class="admin-section-title">API키 환경변수</div>
          <div class="admin-form-row">
            <div class="admin-form-field" style="flex: 1;">
              <label>환경변수 명칭</label>
              <input type="text" data-field="apiKeyEnvVar" value="${(payment.apiKeyEnvVar || 'TOSS_SECRET_KEY').replace(/"/g, '&quot;')}" placeholder="예: TOSS_SECRET_KEY">
            </div>
          </div>
          <p class="admin-form-hint">Vercel(또는 배포 환경)의 환경변수에 위 명칭으로 토스페이먼츠 시크릿 키를 설정하세요. 키 값은 화면에 입력하지 마세요.</p>
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
    const apiKeyEnvVarInput = storeEl.querySelector('input[data-field="apiKeyEnvVar"]');

    const store = { id: storeId, slug: storeId, title: titleInput?.value?.trim() || storeId, brand: brandInput?.value?.trim() || '', storeAddress: storeAddressInput?.value?.trim() || '', storeContact: storeContactInput?.value?.trim() || '', payment: {
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
      } else if (targetTab === 'payments') {
        document.getElementById('paymentsView').classList.add('active');
        loadPaymentManagement();
      }
    });
  });
}

function sortPaymentOrders(orders, sortBy) {
  const copy = orders.slice();
  if (sortBy === 'created_at') {
    copy.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  } else {
    copy.sort((a, b) => {
      const da = (a.delivery_date || '') + ' ' + (a.delivery_time || '00:00');
      const db = (b.delivery_date || '') + ' ' + (b.delivery_time || '00:00');
      return new Date(da) - new Date(db);
    });
  }
  return copy;
}

function renderPaymentList() {
  const content = document.getElementById('adminPaymentContent');
  const filtered = adminPaymentShowAll ? adminPaymentOrders : adminPaymentOrders.filter(o => o.status !== 'cancelled');
  const sortBy = adminPaymentShowAll ? 'created_at' : adminPaymentSortBy;
  const sorted = sortPaymentOrders(filtered, sortBy);

  const sortBar = `
    <div class="admin-payment-sort">
      <span class="admin-payment-sort-label">정렬 기준</span>
      <div class="admin-payment-sort-btns">
        <button type="button" class="admin-payment-sort-btn ${sortBy === 'created_at' ? 'active' : ''}" data-sort="created_at" ${adminPaymentShowAll ? 'disabled' : ''}>주문시간</button>
        <button type="button" class="admin-payment-sort-btn ${sortBy === 'delivery_date' ? 'active' : ''}" data-sort="delivery_date" ${adminPaymentShowAll ? 'disabled' : ''}>배송희망일시</button>
      </div>
      <button type="button" class="admin-payment-toggle-btn" data-toggle-filter>${adminPaymentShowAll ? '취소 주문 제외' : '전체 보기'}</button>
    </div>
  `;

  const ordersHtml = sorted.map(order => {
    const deliveryDate = new Date(order.delivery_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysUntilDelivery = Math.ceil((deliveryDate - today) / (1000 * 60 * 60 * 24));
    const isUrgent = daysUntilDelivery <= 6 && !order.payment_link;
    const isCancelled = order.status === 'cancelled';

    return `
      <div class="admin-payment-order ${isCancelled ? 'admin-payment-order-cancelled' : ''}" data-order-id="${order.id}">
        <div class="admin-payment-order-header">
          <span class="admin-payment-order-id admin-payment-order-id-link" data-order-detail="${order.id}" role="button" tabindex="0">주문 #${order.id}</span>
          <span class="admin-payment-order-status ${order.status}">${getStatusLabel(order.status)}</span>
        </div>
        <div class="admin-payment-order-info">
          <div>주문시간: ${formatAdminOrderDate(order.created_at)}</div>
          <div>배송희망: ${order.delivery_date} ${order.delivery_time || ''}</div>
          <div>주문자: ${order.depositor || '—'} / ${order.contact || '—'}</div>
          <div>총액: ${formatAdminPrice(order.total_amount)}</div>
        </div>
        <div class="admin-payment-link-row">
          <input 
            type="url" 
            class="admin-payment-link-input ${isUrgent ? 'urgent' : ''}" 
            value="${order.payment_link || ''}" 
            placeholder="결제 링크 URL 입력"
            data-order-id="${order.id}"
            ${isCancelled ? 'readonly disabled' : ''}
          >
          <button 
            type="button" 
            class="admin-btn admin-btn-primary admin-payment-link-btn" 
            data-save-link="${order.id}"
            ${isCancelled ? 'disabled' : ''}
          >저장</button>
        </div>
      </div>
    `;
  }).join('');

  content.innerHTML = sortBar + ordersHtml;

  content.querySelectorAll('[data-sort]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (adminPaymentShowAll) return;
      adminPaymentSortBy = btn.dataset.sort;
      renderPaymentList();
    });
  });

  content.querySelector('[data-toggle-filter]')?.addEventListener('click', () => {
    adminPaymentShowAll = !adminPaymentShowAll;
    renderPaymentList();
  });

  content.querySelectorAll('[data-order-detail]').forEach(el => {
    el.addEventListener('click', () => {
      const orderId = el.dataset.orderDetail;
      const order = adminPaymentOrders.find(o => o.id === orderId);
      if (order) openAdminOrderDetail(order);
    });
  });

  content.querySelectorAll('[data-save-link]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const orderId = btn.dataset.saveLink;
      const input = content.querySelector(`.admin-payment-link-input[data-order-id="${orderId}"]`);
      const paymentLink = input?.value?.trim() || '';

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
            order.status = 'submitted';
          } else if (paymentLink.trim() && order.status === 'submitted') {
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
}

async function loadPaymentManagement() {
  const content = document.getElementById('adminPaymentContent');
  content.innerHTML = '<div class="admin-loading">로딩 중...</div>';

  try {
    const token = await getToken();
    const res = await fetchWithTimeout(`${API_BASE}/api/admin/orders`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || '주문 목록을 불러올 수 없습니다.');
    }

    const { orders } = await res.json();
    adminPaymentOrders = orders || [];

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

    if (adminPaymentOrders.length === 0) {
      content.innerHTML = '<div class="admin-loading">주문 내역이 없습니다</div>';
      return;
    }

    renderPaymentList();
  } catch (e) {
    content.innerHTML = `<div class="admin-loading admin-error"><p>${e.message || '오류가 발생했습니다.'}</p></div>`;
  }
}

function getStatusLabel(status) {
  const labels = {
    submitted: '신청 완료',
    payment_link_issued: '결제 링크 발급',
    payment_completed: '결제 완료',
    delivery_completed: '배송 완료',
    cancelled: '주문 취소',
  };
  return labels[status] || status;
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
    if (order.pdf_url) {
      pdfBtn.href = order.pdf_url;
      pdfBtn.style.display = '';
    } else {
      pdfBtn.href = '#';
      pdfBtn.style.display = 'none';
    }
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

    content.addEventListener('click', (e) => {
      if (e.target.closest('[data-scroll-top]')) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
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
        e.target.closest('.admin-menu-item')?.remove();
      }
      if (e.target.closest('[data-save]')) {
        handleSave();
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
