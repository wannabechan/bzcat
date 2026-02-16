/**
 * 주문 접수 목록 - 매장 담당자 전용 (담당자 이메일로 등록된 매장의 주문만 표시)
 */

const TOKEN_KEY = 'bzcat_token';
const API_BASE = '';

let storeOrdersData = [];
let storeOrdersStores = [];
let storeOrdersStoreOrder = [];
let storeOrdersSortBy = 'created_at';
let storeOrdersSortDir = { created_at: 'desc', delivery_date: 'desc' };
let storeOrdersSubFilter = 'all';
let storeOrdersFlashIntervals = [];

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
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
  return `${y}. ${m}. ${day} ${h}:${min}`;
}

function formatAdminPrice(price) {
  return Number(price || 0).toLocaleString() + '원';
}

/** 신청 완료인데 아직 매장에서 수령/거부를 하지 않은 주문이면 true (목록 연체 강조용) */
function isOverdueForAccept(order) {
  return order.status === 'submitted';
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

function renderOrderDetailHtml(order) {
  const stores = storeOrdersStores || [];
  const slugToTitle = {};
  for (const s of stores) {
    const id = (s.id || s.slug || '').toString().toLowerCase();
    if (id) slugToTitle[id] = s.title || s.id || s.slug || id;
  }
  const orderItems = order.order_items || [];
  const byCategory = {};
  for (const oi of orderItems) {
    const itemId = oi.id || '';
    const slug = (itemId.split('-')[0] || 'default').toLowerCase();
    const item = { name: oi.name || '', price: Number(oi.price) || 0 };
    const qty = Number(oi.quantity) || 0;
    if (qty <= 0) continue;
    if (!byCategory[slug]) byCategory[slug] = [];
    byCategory[slug].push({ item, qty });
  }
  const orderedSlugs = storeOrdersStoreOrder.length
    ? storeOrdersStoreOrder.filter(slug => byCategory[slug])
    : [];
  const restSlugs = Object.keys(byCategory).filter(slug => !orderedSlugs.includes(slug)).sort();
  const categoryOrder = [...orderedSlugs, ...restSlugs];
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
      const title = slugToTitle[slug] || slug;
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

/**
 * @param {object} order
 * @param {{ showButtons?: boolean }} [opts] - showButtons: true면 주문 수령하기 + 거부 3개 노출, false면 주문 정보만
 */
function renderOrderAcceptBlock(order, opts = {}) {
  const showButtons = opts.showButtons !== false;
  const orderDate = order.created_at ? formatAdminOrderDate(order.created_at) : '—';
  const deliveryHope = [order.delivery_date, order.delivery_time].filter(Boolean).join(' ') || '—';
  const address = (order.delivery_address || '').trim() || '—';
  const esc = (s) => (s || '').toString().replace(/</g, '&lt;');
  const buttonsHtml = showButtons
    ? `
      <button type="button" class="store-orders-accept-btn" data-accept-order="${order.id}">주문 수령하기</button>
      <div class="store-orders-reject-links">
        <span class="store-orders-reject-link" data-order-id="${esc(order.id)}" data-reject-reason="schedule" role="button" tabindex="0">거부:스케줄문제</span><span class="store-orders-reject-sep">&nbsp;&nbsp;|&nbsp;&nbsp;</span><span class="store-orders-reject-link" data-order-id="${esc(order.id)}" data-reject-reason="cooking" role="button" tabindex="0">거부:조리문제</span><span class="store-orders-reject-sep">&nbsp;&nbsp;|&nbsp;&nbsp;</span><span class="store-orders-reject-link" data-order-id="${esc(order.id)}" data-reject-reason="other" role="button" tabindex="0">거부:기타</span>
      </div>`
    : '';
  return `
    <div class="store-orders-accept-block">
      <h4 class="store-orders-accept-title">주문 정보</h4>
      <div class="store-orders-accept-info">
        <div class="store-orders-info-row"><span class="store-orders-info-label">주문번호</span><span class="store-orders-info-value">#${esc(order.id)}</span></div>
        <div class="store-orders-info-row"><span class="store-orders-info-label">주문일시</span><span class="store-orders-info-value">${orderDate}</span></div>
        <div class="store-orders-info-row"><span class="store-orders-info-label">주문자명</span><span class="store-orders-info-value">${esc(order.depositor) || '—'}</span></div>
        <div class="store-orders-info-row"><span class="store-orders-info-label">배송 희망일</span><span class="store-orders-info-value">${esc(deliveryHope)}</span></div>
        <div class="store-orders-info-row"><span class="store-orders-info-label">배송 주소</span><span class="store-orders-info-value">${esc(address)}</span></div>
      </div>
      ${buttonsHtml}
    </div>
  `;
}

function openOrderDetail(order) {
  const content = document.getElementById('storeOrderDetailContent');
  const totalEl = document.getElementById('storeOrderDetailTotal');
  const overlay = document.getElementById('storeOrderDetailOverlay');
  const panel = overlay?.querySelector('.admin-order-detail-panel');
  if (!content || !overlay) return;
  const html = renderOrderDetailHtml(order);
  const showAcceptButtons = order.status === 'submitted';
  const acceptBlock = renderOrderAcceptBlock(order, { showButtons: showAcceptButtons });
  content.innerHTML = `<div class="order-detail-list order-detail-cart-style">${html}</div>${acceptBlock}`;
  if (totalEl) totalEl.textContent = formatAdminPrice(order.total_amount || 0);
  if (panel) panel.classList.toggle('admin-order-detail-cancelled', order.status === 'cancelled');

  const acceptBtn = content.querySelector('.store-orders-accept-btn');
  if (acceptBtn) {
    acceptBtn.addEventListener('click', async () => {
      const orderId = acceptBtn.dataset.acceptOrder;
      if (!orderId) return;
      acceptBtn.disabled = true;
      acceptBtn.textContent = '처리 중...';
      try {
        const token = getToken();
        const res = await fetch(`${API_BASE}/api/manager/accept-order`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ orderId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          alert(data.error || '처리에 실패했습니다.');
          acceptBtn.disabled = false;
          acceptBtn.textContent = '주문 수령하기';
          return;
        }
        const o = storeOrdersData.find(x => x.id === orderId);
        if (o) o.status = 'order_accepted';
        closeOrderDetail();
        renderList();
        alert('주문을 수령했습니다.');
      } catch (e) {
        alert('네트워크 오류가 발생했습니다.');
        acceptBtn.disabled = false;
        acceptBtn.textContent = '주문 수령하기';
      }
    });
  }

  content.querySelectorAll('.store-orders-reject-link[data-order-id][data-reject-reason]').forEach((el) => {
    const orderId = el.dataset.orderId;
    const reason = (el.dataset.rejectReason || '').trim();
    if (!orderId || !reason) return;
    const handleReject = async () => {
      if (!confirm('이 주문을 거부(취소)하시겠습니까?')) return;
      el.style.pointerEvents = 'none';
      const origText = el.textContent;
      el.textContent = '처리 중...';
      try {
        const token = getToken();
        const res = await fetch(`${API_BASE}/api/manager/reject-order`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ orderId, reason }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          alert(data.error || '거부 처리에 실패했습니다.');
          el.style.pointerEvents = '';
          el.textContent = origText;
          return;
        }
        const o = storeOrdersData.find((x) => x.id === orderId);
        if (o) {
          o.status = 'cancelled';
          o.cancel_reason = { schedule: '매장일정이슈', cooking: '매장준비이슈', other: '매장운영이슈' }[reason];
        }
        closeOrderDetail();
        renderList();
        alert('주문이 거부(취소)되었습니다.');
      } catch (e) {
        alert('네트워크 오류가 발생했습니다.');
        el.style.pointerEvents = '';
        el.textContent = origText;
      }
    };
    el.addEventListener('click', handleReject);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleReject(); } });
  });

  overlay.classList.add('visible');
  overlay.setAttribute('aria-hidden', 'false');
}

function closeOrderDetail() {
  const overlay = document.getElementById('storeOrderDetailOverlay');
  if (overlay) {
    overlay.classList.remove('visible');
    overlay.setAttribute('aria-hidden', 'true');
  }
}

function renderList() {
  const content = document.getElementById('storeOrdersContent');
  const allOrders = storeOrdersData;
  const cancelled = (o) => o.status === 'cancelled';

  const newCount = allOrders.filter(o => !cancelled(o) && (o.status === 'submitted' || o.status === 'order_accepted')).length;
  const paymentWaitCount = allOrders.filter(o => !cancelled(o) && o.status === 'payment_link_issued').length;
  const deliveryWaitCount = allOrders.filter(o => !cancelled(o) && o.status === 'payment_completed').length;

  let filtered;
  if (storeOrdersSubFilter === 'new') {
    filtered = allOrders.filter(o => o.status === 'submitted' || o.status === 'order_accepted');
  } else if (storeOrdersSubFilter === 'payment_wait') {
    filtered = allOrders.filter(o => o.status === 'payment_link_issued');
  } else if (storeOrdersSubFilter === 'delivery_wait') {
    filtered = allOrders.filter(o => o.status === 'payment_completed');
  } else {
    filtered = allOrders.slice();
  }

  const sortBy = storeOrdersSortBy;
  const dir = storeOrdersSortDir[sortBy] || 'desc';
  const sorted = sortPaymentOrders(filtered, sortBy, dir);

  const arrow = (key) => (storeOrdersSortDir[key] === 'asc' ? ' ↑' : ' ↓');
  const sortBar = `
    <div class="admin-payment-sort">
      <div class="admin-payment-sort-btns">
        <button type="button" class="admin-payment-sort-btn ${sortBy === 'created_at' ? 'active' : ''}" data-sort="created_at">주문시간${arrow('created_at')}</button>
        <button type="button" class="admin-payment-sort-btn ${sortBy === 'delivery_date' ? 'active' : ''}" data-sort="delivery_date">배송희망일시${arrow('delivery_date')}</button>
      </div>
    </div>
    <div class="admin-payment-subfilter">
      <span class="admin-payment-subfilter-item ${storeOrdersSubFilter === 'all' ? 'active' : ''}" data-subfilter="all" role="button" tabindex="0">전체보기</span>
      <span class="admin-payment-subfilter-item ${storeOrdersSubFilter === 'new' ? 'active' : ''}" data-subfilter="new" role="button" tabindex="0">신규주문 ${newCount}개</span>
      <span class="admin-payment-subfilter-item ${storeOrdersSubFilter === 'payment_wait' ? 'active' : ''}" data-subfilter="payment_wait" role="button" tabindex="0">결제대기 ${paymentWaitCount}개</span>
      <span class="admin-payment-subfilter-item ${storeOrdersSubFilter === 'delivery_wait' ? 'active' : ''}" data-subfilter="delivery_wait" role="button" tabindex="0">배송대기 ${deliveryWaitCount}개</span>
    </div>
  `;

  const ordersHtml = sorted.map(order => {
    const deliveryDate = new Date(order.delivery_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysUntilDelivery = Math.ceil((deliveryDate - today) / (1000 * 60 * 60 * 24));
    const isCancelled = order.status === 'cancelled';
    const overdue = isOverdueForAccept(order);
    const orderIdEl = overdue
      ? `<span class="admin-payment-order-id store-orders-overdue-flash admin-payment-order-id-link" data-order-detail="${order.id}" data-overdue-flash role="button" tabindex="0"><span class="store-orders-overdue-id">주문 #${order.id}</span><span class="store-orders-overdue-msg">주문 신청을 승인해 주세요.</span></span>`
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
          <div>주문자: ${order.depositor || '—'} / ${order.contact || '—'}</div>
          <div>이메일: ${order.user_email || '—'}</div>
          <div>총액: ${formatAdminPrice(order.total_amount)}</div>
        </div>
      </div>
    `;
  }).join('');

  content.innerHTML = sortBar + ordersHtml;

  storeOrdersFlashIntervals.forEach(id => clearInterval(id));
  storeOrdersFlashIntervals = [];
  content.querySelectorAll('[data-overdue-flash]').forEach(el => {
    const id = setInterval(() => {
      el.classList.toggle('store-orders-overdue-show-msg');
    }, 1500);
    storeOrdersFlashIntervals.push(id);
  });

  content.querySelectorAll('[data-sort]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.sort;
      if (storeOrdersSortBy === key) {
        storeOrdersSortDir[key] = storeOrdersSortDir[key] === 'asc' ? 'desc' : 'asc';
      } else {
        storeOrdersSortBy = key;
      }
      renderList();
    });
  });

  content.querySelectorAll('[data-subfilter]').forEach(el => {
    const handler = () => {
      storeOrdersSubFilter = el.dataset.subfilter;
      renderList();
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
      const order = storeOrdersData.find(o => o.id === orderId);
      if (order) openOrderDetail(order);
    });
  });
}

function showStoreOrdersError(msg) {
  const content = document.getElementById('storeOrdersContent');
  if (!content) return;
  content.innerHTML = `
    <div class="admin-loading admin-error">
      <p>${(msg || '접근할 수 없습니다.').replace(/</g, '&lt;')}</p>
      <p style="margin-top:12px;font-size:0.875rem;color:var(--color-text-secondary);">
        매장 담당자 이메일로 로그인한 경우에만 주문 접수 목록을 볼 수 있습니다.
      </p>
      <p style="margin-top:8px;font-size:0.875rem;"><a href="/">메인으로 돌아가기</a></p>
    </div>
  `;
}

async function loadStoreOrders() {
  const content = document.getElementById('storeOrdersContent');
  const token = getToken();
  if (!token) {
    showStoreOrdersError('로그인이 필요합니다.');
    return;
  }

  try {
    const sessionRes = await fetch(`${API_BASE}/api/auth/session`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!sessionRes.ok) {
      showStoreOrdersError('세션 확인에 실패했습니다. 다시 로그인해 주세요.');
      return;
    }
    const sessionData = await sessionRes.json();
    const user = sessionData.user;
    if (!user || !user.isStoreManager) {
      showStoreOrdersError('담당자로 등록된 매장이 없습니다. 매장·메뉴 관리에서 담당자 이메일이 설정된 매장만 접근할 수 있습니다.');
      return;
    }

    const res = await fetch(`${API_BASE}/api/manager/orders`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        showStoreOrdersError('접근 권한이 없습니다.');
        return;
      }
      content.innerHTML = '<div class="admin-loading">주문 목록을 불러올 수 없습니다.</div>';
      return;
    }

    const data = await res.json();
    storeOrdersData = data.orders || [];
    storeOrdersStores = data.stores || [];
    storeOrdersStoreOrder = storeOrdersStores.map(s => (s.slug || s.id || '').toString().toLowerCase()).filter(Boolean);

    if (storeOrdersData.length === 0) {
      content.innerHTML = '<div class="admin-loading">주문 내역이 없습니다.</div>';
      return;
    }

    renderList();
  } catch (e) {
    content.innerHTML = '<div class="admin-loading admin-error">오류가 발생했습니다. 네트워크를 확인해 주세요.</div>';
  }
}

document.getElementById('storeOrderDetailClose')?.addEventListener('click', closeOrderDetail);
document.getElementById('storeOrderDetailOverlay')?.addEventListener('click', (e) => {
  if (e.target.id === 'storeOrderDetailOverlay') closeOrderDetail();
});

loadStoreOrders();
