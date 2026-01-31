/**
 * 단체 케이터링 주문 앱
 * - 카테고리 선택 → 메뉴 담기 → 장바구니 → 계좌송금 안내
 */

// 메뉴 데이터
const MENU_DATA = {
  bento: {
    title: '도시락',
    items: [
      { id: 'bento-1', name: '삼겹살 덮밥', price: 100000, description: '구운 삼겹살과 야채가 듬뿍 들어간 든든한 덮밥입니다.' },
      { id: 'bento-2', name: '불고기 덮밥', price: 8000, description: '달콤한 양념에 재운 불고기가 가득한 인기 메뉴입니다.' },
      { id: 'bento-3', name: '치킨까스 도시락', price: 7500, description: '바삭한 치킨 커틀릿과 신선한 채소가 들어있습니다.' },
      { id: 'bento-4', name: '제육덮밥', price: 7500, description: '매콤한 제육볶음이 올라간 밥입니다.' },
      { id: 'bento-5', name: '김치찌개 정식', price: 7000, description: '얼큰한 김치찌개와 밥, 반찬이 포함된 정식입니다.' },
      { id: 'bento-6', name: '연어덮밥', price: 9000, description: '신선한 연어와 아보카도가 올라간 프리미엄 덮밥입니다.' },
    ],
  },
  side: {
    title: '반찬',
    items: [
      { id: 'side-1', name: '김치 (소)', price: 2000, description: '직접 담근 맛있는 배추김치 소량입니다.' },
      { id: 'side-2', name: '김치 (대)', price: 4000, description: '직접 담근 맛있는 배추김치 대량입니다.' },
      { id: 'side-3', name: '계란말이', price: 3000, description: '부드럽고 폭신한 계란말이입니다.' },
      { id: 'side-4', name: '감자조림', price: 2500, description: '달콤 짭조름한 간장 감자조림입니다.' },
      { id: 'side-5', name: '멸치볶음', price: 2500, description: '고소한 멸치 볶음 반찬입니다.' },
      { id: 'side-6', name: '잡채', price: 3500, description: '당면과 각종 야채가 들어간 잡채입니다.' },
    ],
  },
  salad: {
    title: '샐러드',
    items: [
      { id: 'salad-1', name: '코울슬로', price: 3000, description: '상큼한 양배추 샐러드입니다.' },
      { id: 'salad-2', name: '양념감자', price: 3500, description: '매콤달콤한 양념 감자 샐러드입니다.' },
      { id: 'salad-3', name: '그린샐러드', price: 4000, description: '신선한 채소만으로 구성된 샐러드입니다.' },
      { id: 'salad-4', name: '콥샐러드', price: 4500, description: '닭가슴살, 베이컨, 아보카도가 들어간 샐러드입니다.' },
      { id: 'salad-5', name: '시저샐러드', price: 5000, description: '크루통과 파마산 치즈가 들어간 시저 샐러드입니다.' },
    ],
  },
  beverage: {
    title: '음료',
    items: [
      { id: 'beverage-1', name: '생수 500ml', price: 500, description: '개인용 생수 한 병입니다.' },
      { id: 'beverage-2', name: '생수 2L', price: 1500, description: '단체용 대용량 생수입니다.' },
      { id: 'beverage-3', name: '콜라', price: 1000, description: '시원한 탄산음료 콜라입니다.' },
      { id: 'beverage-4', name: '사이다', price: 1000, description: '시원한 탄산음료 사이다입니다.' },
      { id: 'beverage-5', name: '아이스티', price: 1500, description: '복숭아 맛 아이스티입니다.' },
      { id: 'beverage-6', name: '주스', price: 1500, description: '신선한 과일 주스입니다.' },
    ],
  },
  dessert: {
    title: '디저트',
    items: [
      { id: 'dessert-1', name: '과일', price: 2000, description: '신선한 제철 과일 모음입니다.' },
      { id: 'dessert-2', name: '요거트', price: 1500, description: '부드러운 플레인 요거트입니다.' },
      { id: 'dessert-3', name: '케이크', price: 3500, description: '달콤한 미니 케이크입니다.' },
      { id: 'dessert-4', name: '쿠키', price: 1000, description: '바삭한 수제 쿠키입니다.' },
    ],
  },
};

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
const checkoutDeadline = document.getElementById('checkoutDeadline');
const inputDepositor = document.getElementById('inputDepositor');
const inputContact = document.getElementById('inputContact');
const expenseRadios = document.querySelectorAll('input[name="expenseDoc"]');
const inputExpenseDoc = document.getElementById('inputExpenseDoc');
const checkoutForm = document.getElementById('checkoutForm');
const checkoutStep1 = document.getElementById('checkoutStep1');
const checkoutStep2 = document.getElementById('checkoutStep2');
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
const checkoutBack = document.getElementById('checkoutBack');
const btnCopyAccount = document.getElementById('btnCopyAccount');

const ACCOUNT_NUMBER = '110-123-456789';

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
function getCartTotalAmount() {
  let total = 0;
  for (const [itemId, qty] of Object.entries(cart)) {
    const item = findMenuItem(itemId);
    if (item) total += item.price * qty;
  }
  return total;
}

// 메뉴 아이템 찾기
function findMenuItem(itemId) {
  for (const cat of Object.values(MENU_DATA)) {
    const found = cat.items.find((i) => i.id === itemId);
    if (found) return found;
  }
  return null;
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

// 메뉴 카드 렌더
function renderMenuCards() {
  const category = document.querySelector('.category-tab.active')?.dataset.category || 'bento';
  const data = MENU_DATA[category];
  if (!data) return;

  menuSectionTitle.textContent = data.title;
  const emoji = getCategoryEmoji(category);

  menuGrid.innerHTML = data.items
    .map((item) => {
      const qty = pendingQty[item.id] || 0;
      const addDisabled = qty === 0;
      return `
        <article class="menu-card" data-id="${item.id}">
          <div class="menu-card-image-wrapper">
            <div class="menu-card-image">${emoji}</div>
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
  const belowMin = total < 300000;
  btnCheckout.classList.toggle('below-minimum', belowMin);

  cartItems.innerHTML = entries
    .map(([itemId, qty]) => {
      const item = findMenuItem(itemId);
      if (!item) return '';
      return `
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
  return entries
    .map(([id, qty]) => {
      const item = findMenuItem(id);
      if (!item) return '';
      return `<li><span>${item.name} × ${qty}</span><span>${formatPrice(item.price * qty)}</span></li>`;
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
  checkoutDeadline.textContent = `※ 주문 신청 후, 24시간 이내 (${formatDeadlineShort(deadlineTime)} 까지) 입금 부탁드립니다.`;
  checkoutAmount.textContent = formatPrice(total);

  orderDetailContent.innerHTML = `<ul class="order-detail-list">${renderOrderSummaryList(entries)}</ul>`;

  checkoutStep1.style.display = '';
  checkoutStep2.style.display = 'none';
  checkoutForm.classList.remove('form-step2');
  checkoutBack.style.display = 'none';
  document.getElementById('checkoutNotice1').textContent = '※ 입금자명, 연락처를 정확히 입력해 주세요.';
  btnOrderSubmit.textContent = '배송 정보 입력';
  inputDepositor.value = '';
  inputContact.value = '';
  document.querySelector('input[name="expenseDoc"][value="none"]').checked = true;
  inputExpenseDoc.value = '';
  inputExpenseDoc.placeholder = '';
  inputExpenseDoc.disabled = true;
  inputDeliveryDate.value = '';
  inputDeliveryTime.value = '';
  inputDeliveryAddress.value = '';
  detailAddressRow.style.display = 'none';
  inputDetailAddress.value = '';
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

function closeCheckoutModal() {
  checkoutModal.classList.remove('visible');
  checkoutModal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

// 계좌번호 복사
function copyAccountNumber() {
  navigator.clipboard
    .writeText(ACCOUNT_NUMBER)
    .then(() => {
      const text = btnCopyAccount.textContent;
      btnCopyAccount.textContent = '복사됨';
      setTimeout(() => (btnCopyAccount.textContent = text), 1500);
    })
    .catch(() => {
      btnCopyAccount.textContent = '복사 실패';
      setTimeout(() => (btnCopyAccount.textContent = '복사'), 1500);
    });
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
  btnCheckout.addEventListener('click', (e) => {
    const total = getCartTotalAmount();
    if (total < 300000) {
      cartMinOrderNotice.classList.add('notice-alert');
      setTimeout(() => cartMinOrderNotice.classList.remove('notice-alert'), 3000);
      return;
    }
    closeCart();
    openCheckoutModal();
  });
  checkoutClose.addEventListener('click', closeCheckoutModal);
  checkoutModal.addEventListener('click', (e) => {
    if (e.target === checkoutModal) closeCheckoutModal();
  });
  btnCopyAccount.addEventListener('click', copyAccountNumber);

  function updateExpenseInputState() {
    const selected = document.querySelector('input[name="expenseDoc"]:checked');
    if (selected?.value === 'none') {
      inputExpenseDoc.disabled = true;
      inputExpenseDoc.value = '';
      inputExpenseDoc.placeholder = '';
    } else if (selected?.value === 'cash') {
      inputExpenseDoc.disabled = false;
      inputExpenseDoc.placeholder = '신청자 핸드폰 번호';
    } else if (selected?.value === 'business') {
      inputExpenseDoc.disabled = false;
      inputExpenseDoc.placeholder = '사업자등록번호';
    }
    updateOrderSubmitButton();
  }
  function updateOrderSubmitButton() {
    const isStep1 = checkoutStep1.style.display !== 'none';
    if (isStep1) {
      const hasName = (inputDepositor.value || '').trim().length > 0;
      const hasContact = (inputContact.value || '').trim().length > 0;
      const selected = document.querySelector('input[name="expenseDoc"]:checked');
      const needsExpenseInput = selected?.value === 'cash' || selected?.value === 'business';
      const hasExpenseInput = !needsExpenseInput || (inputExpenseDoc.value || '').trim().length > 0;
      btnOrderSubmit.disabled = !(hasName && hasContact && hasExpenseInput);
    } else {
      const hasDate = (inputDeliveryDate.value || '').trim().length > 0;
      const hasTime = (inputDeliveryTime.value || '').trim().length > 0;
      const hasAddress = (inputDeliveryAddress.value || '').trim().length > 0;
      const detailRowVisible = detailAddressRow.style.display !== 'none';
      const hasDetailAddress = !detailRowVisible || (inputDetailAddress.value || '').trim().length > 0;
      btnOrderSubmit.disabled = !(hasDate && hasTime && hasAddress && hasDetailAddress);
    }
  }
  expenseRadios.forEach((r) => r.addEventListener('change', updateExpenseInputState));
  inputDepositor.addEventListener('input', updateOrderSubmitButton);
  inputDepositor.addEventListener('change', updateOrderSubmitButton);
  inputContact.addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '');
    updateOrderSubmitButton();
  });
  inputContact.addEventListener('change', updateOrderSubmitButton);
  inputExpenseDoc.addEventListener('input', updateOrderSubmitButton);
  inputExpenseDoc.addEventListener('change', updateOrderSubmitButton);
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

  checkoutBack.addEventListener('click', () => {
    checkoutStep1.style.display = '';
    checkoutStep2.style.display = 'none';
    checkoutForm.classList.remove('form-step2');
    checkoutBack.style.display = 'none';
    document.getElementById('checkoutNotice1').textContent = '※ 입금자명, 연락처를 정확히 입력해 주세요.';
    btnOrderSubmit.textContent = '배송 정보 입력';
    updateOrderSubmitButton();
  });
  btnOrderDetail.addEventListener('click', openOrderDetailOverlay);
  orderDetailClose.addEventListener('click', closeOrderDetailOverlay);
  orderDetailOverlay.addEventListener('click', (e) => {
    if (e.target === orderDetailOverlay) closeOrderDetailOverlay();
  });

  btnOrderSubmit.addEventListener('click', () => {
    const isStep1 = checkoutStep1.style.display !== 'none';
    if (isStep1) {
      checkoutStep1.style.display = 'none';
      checkoutStep2.style.display = '';
      checkoutForm.classList.add('form-step2');
      checkoutBack.style.display = 'flex';
      document.getElementById('checkoutNotice1').textContent = '※ 배송 희망 날짜는 6일후 ~ 45일후 기간 내에서만 선택 가능합니다.';
      inputDeliveryDate.min = getMinDeliveryDate();
      inputDeliveryDate.max = getMaxDeliveryDate();
      btnOrderSubmit.textContent = '주문 신청';
      updateOrderSubmitButton();
    } else {
      alert('주문이 접수되었습니다. 확인 후 곧 안내 회신드리겠습니다. 고맙습니다');
      cart = {};
      pendingQty = {};
      updateCartCount();
      renderCartItems();
      renderMenuCards();
      closeCheckoutModal();
    }
  });

  // ESC 키로 모달/오버레이 닫기
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (orderDetailOverlay.classList.contains('visible')) {
        closeOrderDetailOverlay();
      } else {
        closeCart();
        closeCheckoutModal();
      }
    }
  });

  renderMenuCards();
  renderCartItems();
  updateCartCount();
}

init();
