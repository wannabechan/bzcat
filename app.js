/**
 * 단체 케이터링 주문 앱
 * - 카테고리 선택 → 메뉴 담기 → 장바구니 → 계좌송금 안내
 */

// 메뉴 데이터 (API에서 로드, 실패 시 폴백)
const MENU_DATA_FALLBACK = {
  bento: { title: '도시락', items: [{ id: 'bento-1', name: '삼겹살 덮밥', price: 100000, description: '메뉴를 불러오는 중입니다.', imageUrl: '' }], payment: { accountHolder: '(주)케이터링서비스', bankName: '신한은행', accountNumber: '110-123-456789' } },
  side: { title: '반찬', items: [], payment: { accountHolder: '(주)케이터링서비스', bankName: '신한은행', accountNumber: '110-123-456789' } },
  salad: { title: '샐러드', items: [], payment: { accountHolder: '(주)케이터링서비스', bankName: '신한은행', accountNumber: '110-123-456789' } },
  beverage: { title: '음료', items: [], payment: { accountHolder: '(주)케이터링서비스', bankName: '신한은행', accountNumber: '110-123-456789' } },
  dessert: { title: '디저트', items: [], payment: { accountHolder: '(주)케이터링서비스', bankName: '신한은행', accountNumber: '110-123-456789' } },
};

let MENU_DATA = { ...MENU_DATA_FALLBACK };

async function loadMenuData() {
  try {
    const res = await fetch('/api/menu-data');
    if (res.ok) {
      const data = await res.json();
      MENU_DATA = data;
      return true;
    }
  } catch (e) {
    console.warn('Menu data load failed:', e);
  }
  return false;
}

// 장바구니 상태: { [itemId]: quantity }
let cart = {};
// 메뉴 카드에 설정한 담을 수량 (담기 버튼으로 이만큼 담음)
let pendingQty = {};

// DOM 요소
const categoryTabs = document.getElementById('categoryTabs');
const menuSectionTitle = document.getElementById('menuSectionTitle');
const menuGrid = document.getElementById('menuGrid');
const cartToggle = document.getElementById('cartToggle');
const cartCount = document.getElementById('cartCount');
const cartOverlay = document.getElementById('cartOverlay');
const cartDrawer = document.getElementById('cartDrawer');
const cartClose = document.getElementById('cartClose');
const cartEmpty = document.getElementById('cartEmpty');
const cartItems = document.getElementById('cartItems');
const cartFooter = document.getElementById('cartFooter');
const cartTotal = document.getElementById('cartTotal');
const cartMinOrderNotice = document.getElementById('cartMinOrderNotice');
const btnCheckout = document.getElementById('btnCheckout');
const checkoutModal = document.getElementById('checkoutModal');
const checkoutClose = document.getElementById('checkoutClose');
const checkoutAmount = document.getElementById('checkoutAmount');
const checkoutOrderTime = document.getElementById('checkoutOrderTime');
const inputDepositor = document.getElementById('inputDepositor');
const inputContact = document.getElementById('inputContact');
const checkoutForm = document.getElementById('checkoutForm');
const checkoutStep1 = document.getElementById('checkoutStep1');
const inputDeliveryDate = document.getElementById('inputDeliveryDate');
const inputDeliveryTime = document.getElementById('inputDeliveryTime');
const inputDeliveryAddress = document.getElementById('inputDeliveryAddress');
const detailAddressRow = document.getElementById('detailAddressRow');
const inputDetailAddress = document.getElementById('inputDetailAddress');
const btnOrderSubmit = document.getElementById('btnOrderSubmit');
const btnOrderDetail = document.getElementById('btnOrderDetail');
const orderDetailOverlay = document.getElementById('orderDetailOverlay');
const orderDetailContent = document.getElementById('orderDetailContent');
const orderDetailClose = document.getElementById('orderDetailClose');
const profileToggle = document.getElementById('profileToggle');
const profileOverlay = document.getElementById('profileOverlay');
const profileDrawer = document.getElementById('profileDrawer');
const profileClose = document.getElementById('profileClose');
const profileEmpty = document.getElementById('profileEmpty');
const profileOrders = document.getElementById('profileOrders');

let profileOrdersData = {};

const ORDER_STATUS_STEPS = [
  { key: 'submitted', label: '주문 신청 완료' },
  { key: 'payment_link_issued', label: '결제 링크 발급' },
  { key: 'payment_completed', label: '결제 완료' },
  { key: 'delivery_completed', label: '배송 완료' },
];

// 유틸: 금액 포맷
function formatPrice(price) {
  return price.toLocaleString() + '원';
}

// 유틸: 주문시간 포맷 (yy년 mm월 dd일 hh시 mm분)
function formatOrderTime(date) {
  const y = String(date.getFullYear()).slice(-2);
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}년 ${m}월 ${d}일 ${h}시 ${min}분`;
}

// 유틸: ISO 날짜를 간단 포맷 (yy.mm.dd)
function formatOrderDate(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  const y = String(d.getFullYear()).slice(-2);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}.${m}.${day}`;
}

// 유틸: 입금기한 표시용 (mm월 dd일 hh시 mm분)
function formatDeadlineShort(date) {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${m}월 ${d}일 ${h}시 ${min}분`;
}

// 유틸: 아이콘 이모지 (플레이스홀더)
function getCategoryEmoji(category) {
  const emojis = { bento: '🍱', side: '🥗', salad: '🥬', beverage: '🥤', dessert: '🍰' };
  return emojis[category] || '📦';
}

// 카테고리 총 개수
function getCartTotalCount() {
  return Object.values(cart).reduce((sum, qty) => sum + qty, 0);
}

// 장바구니 총 금액
function calculateTotal() {
  let total = 0;
  for (const [itemId, qty] of Object.entries(cart)) {
    const item = findItemById(itemId);
    if (item) total += item.price * qty;
  }
  return total;
}

function getCartTotalAmount() {
  return calculateTotal();
}

// 메뉴 아이템 찾기
function findItemById(itemId) {
  for (const cat of Object.values(MENU_DATA)) {
    const found = cat.items?.find((i) => i.id === itemId);
    if (found) return found;
  }
  return null;
}

function getCategoryForItem(itemId) {
  for (const [slug, data] of Object.entries(MENU_DATA)) {
    if (data.items?.some((i) => i.id === itemId)) return slug;
  }
  return itemId.split('-')[0];
}

// 장바구니에 포함된 첫 매장의 결제정보
function getPaymentForCart() {
  const itemIds = Object.keys(cart).filter((id) => cart[id] > 0);
  const firstId = itemIds[0];
  if (!firstId) return MENU_DATA.bento?.payment || MENU_DATA_FALLBACK.bento.payment;
  const storeSlug = firstId.split('-')[0];
  const storeData = MENU_DATA[storeSlug];
  return storeData?.payment || MENU_DATA.bento?.payment || MENU_DATA_FALLBACK.bento.payment;
}

function findMenuItem(itemId) {
  return findItemById(itemId);
}

// 카트 버튼 카운트 갱신
function updateCartCount() {
  const count = getCartTotalCount();
  cartCount.textContent = count;
  cartCount.style.display = count > 0 ? 'flex' : 'none';
}

// 카드에서 설정한 수량만 변경 (담기 전)
function setPendingQty(itemId, delta) {
  const current = pendingQty[itemId] || 0;
  const next = Math.max(0, current + delta);
  if (next === 0) delete pendingQty[itemId];
  else pendingQty[itemId] = next;
  renderMenuCards();
}

// 장바구니 수량 변경 (장바구니 내 +/- 버튼용)
function updateCartQty(itemId, delta) {
  const current = cart[itemId] || 0;
  const next = Math.max(0, current + delta);
  if (next === 0) delete cart[itemId];
  else cart[itemId] = next;
  updateCartCount();
  renderMenuCards();
  renderCartItems();
}

// 담기: 카드에 설정한 수량만큼 장바구니에 추가
function addToCartFromPending(itemId) {
  const qty = pendingQty[itemId] || 0;
  if (qty <= 0) return;
  cart[itemId] = (cart[itemId] || 0) + qty;
  delete pendingQty[itemId];
  updateCartCount();
  renderMenuCards();
  renderCartItems();
}

// 카테고리 탭 렌더 (API 데이터 기반)
function renderCategoryTabs() {
  const slugs = Object.keys(MENU_DATA);
  if (slugs.length === 0) {
    categoryTabs.innerHTML = '<p class="category-empty">등록된 카테고리가 없습니다.</p>';
    menuSectionTitle.textContent = '';
    menuGrid.innerHTML = '';
    return;
  }
  const firstSlug = slugs[0];
  categoryTabs.innerHTML = slugs
    .map((slug) => {
      const title = MENU_DATA[slug]?.title || slug;
      const active = slug === firstSlug ? ' active' : '';
      return `<button class="category-tab${active}" data-category="${slug}">${title}</button>`;
    })
    .join('');
}

// 메뉴 카드 렌더
function renderMenuCards() {
  const slugs = Object.keys(MENU_DATA);
  const category = document.querySelector('.category-tab.active')?.dataset.category || slugs[0];
  const data = MENU_DATA[category];
  if (!data) {
    menuSectionTitle.textContent = slugs.length ? '카테고리를 선택하세요' : '';
    menuGrid.innerHTML = '';
    return;
  }

  menuSectionTitle.textContent = data.title;
  const emoji = getCategoryEmoji(category);

  const items = data.items || [];
  menuGrid.innerHTML = items
    .map((item) => {
      const qty = pendingQty[item.id] || 0;
      const addDisabled = qty === 0;
      const imgContent = item.imageUrl
        ? `<div class="menu-card-image"><img src="${item.imageUrl.replace(/"/g, '&quot;')}" alt="" class="menu-card-img" onerror="this.outerHTML='<span class=\\'menu-card-emoji\\'>${emoji}</span>'"></div>`
        : `<div class="menu-card-image">${emoji}</div>`;
      return `
        <article class="menu-card" data-id="${item.id}">
          <div class="menu-card-image-wrapper">
            ${imgContent}
            <button class="menu-info-btn" data-id="${item.id}" aria-label="상세 정보">
              <i>i</i>
            </button>
            <div class="menu-info-overlay" data-id="${item.id}">
              <p>${item.description || '상세 설명이 없습니다.'}</p>
            </div>
          </div>
          <div class="menu-card-body">
            <h3 class="menu-card-name">${item.name}</h3>
            <p class="menu-card-price">${formatPrice(item.price)}</p>
            <div class="menu-card-actions">
              <div class="menu-qty-controls">
                <button class="menu-qty-btn" data-action="decrease" data-id="${item.id}" ${qty === 0 ? 'disabled' : ''}>−</button>
                <span class="menu-qty-value">${qty}</span>
                <button class="menu-qty-btn" data-action="increase" data-id="${item.id}">+</button>
              </div>
              <button class="menu-add-btn" data-id="${item.id}" ${addDisabled ? 'disabled' : ''} aria-label="장바구니 담기">
                <svg class="menu-add-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
                  <line x1="3" y1="6" x2="21" y2="6"/>
                  <path d="M16 10a4 4 0 0 1-8 0"/>
                </svg>
              </button>
            </div>
          </div>
        </article>
      `;
    })
    .join('');

  menuGrid.querySelectorAll('.menu-qty-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      setPendingQty(id, action === 'increase' ? 1 : -1);
    });
  });

  menuGrid.querySelectorAll('.menu-add-btn').forEach((btn) => {
    btn.addEventListener('click', () => addToCartFromPending(btn.dataset.id));
  });

  // 정보 버튼 클릭 이벤트
  menuGrid.querySelectorAll('.menu-info-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const overlay = menuGrid.querySelector(`.menu-info-overlay[data-id="${id}"]`);
      const wasActive = overlay.classList.contains('active');
      
      // 다른 모든 오버레이 닫기
      menuGrid.querySelectorAll('.menu-info-overlay').forEach((o) => o.classList.remove('active'));
      
      // 현재 오버레이 토글
      if (!wasActive) overlay.classList.add('active');
    });
  });

  // 오버레이 클릭하면 닫기
  menuGrid.querySelectorAll('.menu-info-overlay').forEach((overlay) => {
    overlay.addEventListener('click', () => {
      overlay.classList.remove('active');
    });
  });
}

// 장바구니 아이템 렌더
function renderCartItems() {
  const entries = Object.entries(cart).filter(([, qty]) => qty > 0);
  const total = getCartTotalAmount();

  if (entries.length === 0) {
    cartEmpty.style.display = 'block';
    cartItems.innerHTML = '';
    cartFooter.style.display = 'none';
    return;
  }

  cartEmpty.style.display = 'none';
  cartFooter.style.display = 'block';
  cartTotal.textContent = formatPrice(total);

  const categoryOrder = Object.keys(MENU_DATA);
  const byCategory = {};
  for (const [itemId, qty] of entries) {
    const item = findMenuItem(itemId);
    if (!item) continue;
    const slug = getCategoryForItem(itemId);
    if (!byCategory[slug]) byCategory[slug] = [];
    byCategory[slug].push({ itemId, qty, item });
  }
  for (const slug of Object.keys(byCategory)) {
    byCategory[slug].sort((a, b) => (a.item.name || '').localeCompare(b.item.name || '', 'ko'));
  }

  const CATEGORY_MIN = 150000;
  const categoryTotals = {};
  for (const slug of Object.keys(byCategory)) {
    categoryTotals[slug] = byCategory[slug].reduce((sum, { item, qty }) => sum + item.price * qty, 0);
  }
  const allCategoriesMeetMin = Object.keys(byCategory).every((slug) => categoryTotals[slug] >= CATEGORY_MIN);
  btnCheckout.classList.toggle('below-minimum', !allCategoriesMeetMin);

  const renderCartItem = ({ itemId, qty, item }) => `
    <div class="cart-item" data-id="${itemId}">
      <div class="cart-item-info">
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-price">${formatPrice(item.price)} × ${qty}</div>
      </div>
      <div class="cart-item-qty">
        <button type="button" data-action="decrease" data-id="${itemId}">−</button>
        <span>${qty}</span>
        <button type="button" data-action="increase" data-id="${itemId}">+</button>
      </div>
      <button class="cart-item-remove" data-id="${itemId}" aria-label="삭제">
        <svg class="icon-trash" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          <line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>
        </svg>
      </button>
    </div>
  `;

  cartItems.innerHTML = categoryOrder
    .filter((slug) => byCategory[slug]?.length)
    .map((slug) => {
      const categoryTitle = MENU_DATA[slug]?.title || slug;
      const catTotal = categoryTotals[slug] || 0;
      const meetMin = catTotal >= CATEGORY_MIN;
      const totalClass = meetMin ? 'cart-category-total met' : 'cart-category-total below';
      const itemsHtml = byCategory[slug].map(renderCartItem).join('');
      return `
        <div class="cart-category-group">
          <div class="cart-category-header">
            <span class="cart-category-title">${categoryTitle}</span>
            <span class="${totalClass}">${formatPrice(catTotal)}</span>
          </div>
          ${itemsHtml}
        </div>
      `;
    })
    .join('');

  cartItems.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      updateCartQty(btn.dataset.id, btn.dataset.action === 'increase' ? 1 : -1);
    });
  });

  cartItems.querySelectorAll('.cart-item-remove').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      updateCartQty(id, -(cart[id] || 0));
    });
  });
}

// 장바구니 열기/닫기
function openCart() {
  cartDrawer.classList.add('open');
  cartOverlay.classList.add('visible');
  cartOverlay.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeCart() {
  cartDrawer.classList.remove('open');
  cartOverlay.classList.remove('visible');
  cartOverlay.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

// 6일 후 ~ 45일 후 날짜 (배송희망날짜용)
function getMinDeliveryDate() {
  const d = new Date();
  d.setDate(d.getDate() + 6);
  return d.toISOString().slice(0, 10);
}
function getMaxDeliveryDate() {
  const d = new Date();
  d.setDate(d.getDate() + 45);
  return d.toISOString().slice(0, 10);
}

function renderOrderSummaryList(entries) {
  const categoryOrder = Object.keys(MENU_DATA);
  const byCategory = {};
  for (const [itemId, qty] of entries) {
    const item = findMenuItem(itemId);
    if (!item) continue;
    const slug = getCategoryForItem(itemId);
    if (!byCategory[slug]) byCategory[slug] = [];
    byCategory[slug].push({ item, qty });
  }
  for (const slug of Object.keys(byCategory)) {
    byCategory[slug].sort((a, b) => (a.item.name || '').localeCompare(b.item.name || '', 'ko'));
  }
  return renderOrderDetailByCategory(byCategory, categoryOrder);
}

function renderOrderSummaryFromOrderItems(orderItems) {
  const categoryOrder = Object.keys(MENU_DATA);
  const byCategory = {};
  for (const oi of orderItems || []) {
    const itemId = oi.id || '';
    const slug = getCategoryForItem(itemId);
    const item = { name: oi.name || '', price: oi.price || 0 };
    const qty = oi.quantity || 0;
    if (!slug || qty <= 0) continue;
    if (!byCategory[slug]) byCategory[slug] = [];
    byCategory[slug].push({ item, qty });
  }
  for (const slug of Object.keys(byCategory)) {
    byCategory[slug].sort((a, b) => (a.item.name || '').localeCompare(b.item.name || '', 'ko'));
  }
  return renderOrderDetailByCategory(byCategory, categoryOrder);
}

function renderOrderDetailByCategory(byCategory, categoryOrder) {
  const categoryTotals = {};
  for (const slug of Object.keys(byCategory)) {
    categoryTotals[slug] = byCategory[slug].reduce((sum, { item, qty }) => sum + item.price * qty, 0);
  }
  const renderDetailItem = ({ item, qty }) => `
    <div class="order-detail-item">
      <div class="cart-item-info">
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-price">${formatPrice(item.price)} × ${qty}</div>
      </div>
    </div>
  `;
  return categoryOrder
    .filter((slug) => byCategory[slug]?.length)
    .map((slug) => {
      const categoryTitle = MENU_DATA[slug]?.title || slug;
      const catTotal = categoryTotals[slug] || 0;
      const itemsHtml = byCategory[slug].map(renderDetailItem).join('');
      return `
        <div class="cart-category-group">
          <div class="cart-category-header">
            <span class="cart-category-title">${categoryTitle}</span>
            <span class="cart-category-total met">${formatPrice(catTotal)}</span>
          </div>
          ${itemsHtml}
        </div>
      `;
    })
    .join('');
}

// 결제 모달 열기
function openCheckoutModal() {
  const total = getCartTotalAmount();
  const entries = Object.entries(cart).filter(([, qty]) => qty > 0);
  const orderTime = new Date();
  const deadlineTime = new Date(orderTime.getTime() + 24 * 60 * 60 * 1000);

  checkoutOrderTime.textContent = formatOrderTime(orderTime);
  checkoutAmount.textContent = formatPrice(total);

  orderDetailContent.innerHTML = `<div class="order-detail-list order-detail-cart-style">${renderOrderSummaryList(entries)}</div>`;

  const orderDetailTotalEl = document.getElementById('orderDetailTotal');
  if (orderDetailTotalEl) orderDetailTotalEl.textContent = formatPrice(total);

  const categoryIds = new Set();
  for (const [itemId] of entries) {
    categoryIds.add(getCategoryForItem(itemId));
  }
  const categoryCountEl = document.getElementById('checkoutCategoryCount');
  if (categoryCountEl) categoryCountEl.textContent = `${categoryIds.size}개 카테고리 주문`;

  inputDepositor.value = '';
  inputContact.value = '';
  inputDeliveryDate.value = '';
  inputDeliveryTime.value = '';
  inputDeliveryAddress.value = '';
  detailAddressRow.style.display = 'none';
  inputDetailAddress.value = '';
  inputDeliveryDate.min = getMinDeliveryDate();
  inputDeliveryDate.max = getMaxDeliveryDate();
  btnOrderSubmit.textContent = '주문 신청';
  btnOrderSubmit.disabled = true;

  checkoutModal.classList.add('visible');
  checkoutModal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function openOrderDetailOverlay() {
  orderDetailOverlay.classList.add('visible');
  orderDetailOverlay.setAttribute('aria-hidden', 'false');
}

function closeOrderDetailOverlay() {
  orderDetailOverlay.classList.remove('visible');
  orderDetailOverlay.setAttribute('aria-hidden', 'true');
}

// 마이프로필: 주문 내역
async function openProfile() {
  profileDrawer.classList.add('open');
  profileOverlay.classList.add('visible');
  profileOverlay.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  await fetchAndRenderProfileOrders();
}

function closeProfile() {
  profileDrawer.classList.remove('open');
  profileOverlay.classList.remove('visible');
  profileOverlay.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

function openProfileOrderDetail(order) {
  const html = renderOrderSummaryFromOrderItems(order.orderItems || []);
  orderDetailContent.innerHTML = `<div class="order-detail-list order-detail-cart-style">${html}</div>`;
  const totalEl = document.getElementById('orderDetailTotal');
  if (totalEl) totalEl.textContent = formatPrice(order.totalAmount || 0);
  orderDetailOverlay.classList.add('visible');
  orderDetailOverlay.setAttribute('aria-hidden', 'false');
}

async function confirmAndCancelOrder(order) {
  if (!confirm('주문을 취소하시겠습니까?')) return;
  const token = window.BzCatAuth?.getToken();
  if (!token) {
    alert('로그인이 만료되었습니다. 다시 로그인해 주세요.');
    window.location.reload();
    return;
  }
  try {
    const res = await fetch('/api/orders/cancel', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ orderId: order.id }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || '주문 취소에 실패했습니다.');
      return;
    }
    alert('주문이 취소되었습니다.');
    await fetchAndRenderProfileOrders();
  } catch (err) {
    console.error('Cancel order error:', err);
    alert('네트워크 오류가 발생했습니다. 다시 시도해 주세요.');
  }
}

async function fetchAndRenderProfileOrders() {
  const token = window.BzCatAuth?.getToken();
  if (!token) {
    profileEmpty.style.display = 'block';
    profileOrders.style.display = 'none';
    profileEmpty.innerHTML = '<p>로그인이 필요합니다</p>';
    return;
  }
  profileEmpty.style.display = 'block';
  profileOrders.style.display = 'none';
  profileEmpty.innerHTML = '<p>로딩 중...</p>';

  try {
    const res = await fetch('/api/orders/my', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();

    if (!res.ok) {
      profileEmpty.innerHTML = `<p>${data.error || '불러오기에 실패했습니다.'}</p>`;
      return;
    }

    const orders = data.orders || [];
    if (orders.length === 0) {
      profileEmpty.style.display = 'block';
      profileOrders.style.display = 'none';
      profileEmpty.innerHTML = '<p>주문 내역이 없습니다</p><p class="profile-empty-hint">주문 신청을 완료하면 여기에서 확인할 수 있습니다</p>';
      return;
    }

    profileEmpty.style.display = 'none';
    profileOrders.style.display = 'block';

    const stepIndex = (key) => ORDER_STATUS_STEPS.findIndex((s) => s.key === key);
    const isCancelled = (status) => status === 'cancelled';
    const canCancel = (status) => !isCancelled(status) && ['submitted', 'payment_link_issued'].includes(status);

    profileOrdersData = {};
    profileOrders.innerHTML = orders
      .map((o) => {
        profileOrdersData[o.id] = o;
        const cancelled = isCancelled(o.status);
        const currentIdx = cancelled ? -1 : stepIndex(o.status);
        const stepsHtml = ORDER_STATUS_STEPS.map((s, i) => {
          let cls = 'step';
          if (cancelled) {
            cls += ' done';
          } else if (i < currentIdx) {
            cls += ' done';
          } else if (i === currentIdx) {
            cls += ' active';
          }
          return `<span class="${cls}">${s.label}</span>`;
        }).join('');
        const showCancelBtn = canCancel(o.status);

        return `
          <div class="profile-order-card" data-order-id="${o.id}">
            <div class="profile-order-card-header">
              <div class="profile-order-header-left">
                <span class="profile-order-id">주문 #${o.id}</span>
                <div class="profile-order-actions">
                  <button type="button" class="profile-btn profile-btn-detail" data-action="detail">주문내역</button>
                  ${showCancelBtn ? `<button type="button" class="profile-btn profile-btn-cancel" data-action="cancel">취소하기</button>` : ''}
                </div>
              </div>
              <span class="profile-order-status ${cancelled ? 'cancelled' : ''}">${o.statusLabel}</span>
            </div>
            <div class="profile-order-date">${formatOrderDate(o.createdAt)}</div>
            <div class="profile-order-status-steps">${stepsHtml}${cancelled ? '<span class="step cancelled">주문 취소</span>' : ''}</div>
            <div class="profile-order-amount">${formatPrice(o.totalAmount || 0)}</div>
          </div>
        `;
      })
      .join('');
  } catch (err) {
    console.error('Profile orders fetch error:', err);
    profileEmpty.style.display = 'block';
    profileOrders.style.display = 'none';
    profileEmpty.innerHTML = '<p>네트워크 오류가 발생했습니다.</p>';
  }
}

function closeCheckoutModal() {
  checkoutModal.classList.remove('visible');
  checkoutModal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

// 카테고리 탭 클릭
function handleCategoryClick(e) {
  const tab = e.target.closest('.category-tab');
  if (!tab) return;
  document.querySelectorAll('.category-tab').forEach((t) => t.classList.remove('active'));
  tab.classList.add('active');
  renderMenuCards();
}

// 이벤트 바인딩
function init() {
  categoryTabs.addEventListener('click', handleCategoryClick);
  cartToggle.addEventListener('click', openCart);
  cartClose.addEventListener('click', closeCart);
  cartOverlay.addEventListener('click', closeCart);

  profileToggle.addEventListener('click', openProfile);
  profileClose.addEventListener('click', closeProfile);
  profileOverlay.addEventListener('click', (e) => {
    if (e.target === profileOverlay) closeProfile();
  });
  profileOrders.addEventListener('click', (e) => {
    const btn = e.target.closest('.profile-btn');
    if (!btn) return;
    const card = btn.closest('.profile-order-card');
    const orderId = card && parseInt(card.dataset.orderId, 10);
    const order = orderId && profileOrdersData[orderId];
    if (!order) return;
    if (btn.dataset.action === 'detail') {
      openProfileOrderDetail(order);
    } else if (btn.dataset.action === 'cancel') {
      confirmAndCancelOrder(order);
    }
  });
  btnCheckout.addEventListener('click', (e) => {
    const entries = Object.entries(cart).filter(([, qty]) => qty > 0);
    const byCategory = {};
    for (const [itemId, qty] of entries) {
      const item = findMenuItem(itemId);
      if (!item) continue;
      const slug = getCategoryForItem(itemId);
      if (!byCategory[slug]) byCategory[slug] = 0;
      byCategory[slug] += item.price * qty;
    }
    const CATEGORY_MIN = 150000;
    const allMeet = Object.keys(byCategory).every((slug) => byCategory[slug] >= CATEGORY_MIN);
    if (!allMeet) {
      cartMinOrderNotice.classList.remove('notice-blink');
      cartMinOrderNotice.offsetHeight;
      cartMinOrderNotice.classList.add('notice-blink');
      setTimeout(() => cartMinOrderNotice.classList.remove('notice-blink'), 1200);
      return;
    }
    closeCart();
    openCheckoutModal();
  });
  checkoutClose.addEventListener('click', closeCheckoutModal);
  checkoutModal.addEventListener('click', (e) => {
    if (e.target === checkoutModal) closeCheckoutModal();
  });
  function updateOrderSubmitButton() {
    const hasName = (inputDepositor.value || '').trim().length > 0;
    const hasContact = (inputContact.value || '').trim().length > 0;
    const hasDate = (inputDeliveryDate.value || '').trim().length > 0;
    const hasTime = (inputDeliveryTime.value || '').trim().length > 0;
    const hasAddress = (inputDeliveryAddress.value || '').trim().length > 0;
    const detailRowVisible = detailAddressRow.style.display !== 'none';
    const hasDetailAddress = !detailRowVisible || (inputDetailAddress.value || '').trim().length > 0;
    btnOrderSubmit.disabled = !(hasName && hasContact && hasDate && hasTime && hasAddress && hasDetailAddress);
  }
  inputDepositor.addEventListener('input', updateOrderSubmitButton);
  inputDepositor.addEventListener('change', updateOrderSubmitButton);
  inputContact.addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '');
    updateOrderSubmitButton();
  });
  inputContact.addEventListener('change', updateOrderSubmitButton);
  inputDeliveryDate.addEventListener('input', updateOrderSubmitButton);
  inputDeliveryDate.addEventListener('change', updateOrderSubmitButton);
  inputDeliveryTime.addEventListener('input', updateOrderSubmitButton);
  inputDeliveryTime.addEventListener('change', updateOrderSubmitButton);
  const postcodeOverlay = document.getElementById('postcodeOverlay');
  const postcodeLayer = document.getElementById('postcodeLayer');
  const postcodeClose = document.getElementById('postcodeClose');

  function openPostcode() {
    if (typeof daum === 'undefined' || !daum.Postcode) {
      inputDeliveryAddress.removeAttribute('readonly');
      inputDeliveryAddress.placeholder = '배송주소 입력 (API 로드 실패)';
      return;
    }
    postcodeLayer.innerHTML = '';
    postcodeOverlay.classList.add('visible');
    postcodeOverlay.setAttribute('aria-hidden', 'false');
    new daum.Postcode({
      oncomplete: function (data) {
        let addr = '';
        if (data.userSelectedType === 'R') {
          addr = data.roadAddress || data.autoRoadAddress || data.address || '';
        } else {
          addr = data.jibunAddress || data.autoJibunAddress || data.address || '';
        }
        if (!addr) addr = data.address || data.roadAddress || data.jibunAddress || '';
        inputDeliveryAddress.value = addr;
        postcodeOverlay.classList.remove('visible');
        postcodeOverlay.setAttribute('aria-hidden', 'true');
        detailAddressRow.style.display = '';
        inputDetailAddress.focus();
        updateOrderSubmitButton();
      },
      onresize: function (size) {
        postcodeLayer.style.height = size.height + 'px';
      },
      width: '100%',
      height: '100%',
    }).embed(postcodeLayer);
  }

  function closePostcode() {
    postcodeOverlay.classList.remove('visible');
    postcodeOverlay.setAttribute('aria-hidden', 'true');
  }

  inputDeliveryAddress.addEventListener('click', openPostcode);
  postcodeClose.addEventListener('click', closePostcode);
  postcodeOverlay.addEventListener('click', (e) => {
    if (e.target === postcodeOverlay) closePostcode();
  });
  inputDeliveryAddress.addEventListener('input', updateOrderSubmitButton);
  inputDeliveryAddress.addEventListener('change', updateOrderSubmitButton);
  inputDetailAddress.addEventListener('input', updateOrderSubmitButton);
  inputDetailAddress.addEventListener('change', updateOrderSubmitButton);

  btnOrderDetail.addEventListener('click', openOrderDetailOverlay);
  orderDetailClose.addEventListener('click', closeOrderDetailOverlay);
  orderDetailOverlay.addEventListener('click', (e) => {
    if (e.target === orderDetailOverlay) closeOrderDetailOverlay();
  });

  btnOrderSubmit.addEventListener('click', async () => {
      const token = window.BzCatAuth?.getToken();
      if (!token) {
        alert('로그인이 만료되었습니다. 다시 로그인해 주세요.');
        window.location.reload();
        return;
      }

      // 주문 데이터 준비
      const orderItems = Object.entries(cart).filter(([, qty]) => qty > 0).map(([itemId, qty]) => {
        const item = findItemById(itemId);
        return {
          id: itemId,
          name: item.name,
          price: item.price,
          quantity: qty,
        };
      });

      const categoryTotals = {};
      for (const { id, price, quantity } of orderItems) {
        const slug = getCategoryForItem(id);
        if (!categoryTotals[slug]) categoryTotals[slug] = 0;
        categoryTotals[slug] += price * quantity;
      }

      const orderData = {
        depositor: inputDepositor.value.trim(),
        contact: inputContact.value.trim(),
        expenseType: 'none',
        expenseDoc: null,
        deliveryDate: inputDeliveryDate.value,
        deliveryTime: inputDeliveryTime.value,
        deliveryAddress: inputDeliveryAddress.value.trim(),
        detailAddress: inputDetailAddress.value.trim() || null,
        orderItems: orderItems,
        totalAmount: calculateTotal(),
        categoryTotals,
      };

      btnOrderSubmit.disabled = true;
      btnOrderSubmit.textContent = '처리 중...';

      try {
        const response = await fetch('/api/orders/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify(orderData),
        });

        const data = await response.json();

        if (!response.ok) {
          alert(data.error || '주문 처리에 실패했습니다.');
          return;
        }

        alert('주문이 접수되었습니다. 확인 후 곧 안내 회신드리겠습니다. 고맙습니다');
        cart = {};
        pendingQty = {};
        updateCartCount();
        renderCartItems();
        renderMenuCards();
        closeCheckoutModal();

      } catch (error) {
        console.error('Order submission error:', error);
        alert('네트워크 오류가 발생했습니다. 다시 시도해 주세요.');
      } finally {
        btnOrderSubmit.disabled = false;
        btnOrderSubmit.textContent = '주문 신청';
      }
  });

  // ESC 키로 모달/오버레이 닫기
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (orderDetailOverlay.classList.contains('visible')) {
        closeOrderDetailOverlay();
      } else if (profileDrawer.classList.contains('open')) {
        closeProfile();
      } else {
        closeCart();
        closeCheckoutModal();
      }
    }
  });

  loadMenuData().then(() => {
    renderCategoryTabs();
    renderMenuCards();
    renderCartItems();
    updateCartCount();
  });
}

init();
