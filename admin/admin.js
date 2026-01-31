/**
 * Admin 페이지 - 매장·메뉴·결제정보 관리
 */

const TOKEN_KEY = 'bzcat_token';
const API_BASE = '';

// 이미지 규칙: 1:1 비율, 권장 400x400px
const IMAGE_RULE = '가로·세로 1:1 비율, 권장 400×400px';

async function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

async function checkAdmin() {
  const token = await getToken();
  if (!token) return false;

  try {
    const res = await fetch(`${API_BASE}/api/auth/session`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) return false;
    const data = await res.json();
    const email = (data.user?.email || '').toLowerCase();
    return data.user?.level === 'admin' || email === 'bzcatmanager@gmail.com';
  } catch {
    return false;
  }
}

async function fetchStores() {
  const token = await getToken();
  const res = await fetch(`${API_BASE}/api/admin/stores`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || '데이터를 불러올 수 없습니다.');
  }
  return res.json();
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

function renderStore(store, menus) {
  const payment = store.payment || { accountHolder: '', bankName: '', accountNumber: '' };
  const items = menus || [];

  return `
    <div class="admin-store" data-store-id="${store.id}">
      <div class="admin-store-header">
        <span class="admin-store-title">${store.title || store.id}</span>
      </div>
      <div class="admin-store-body">
        <div class="admin-section">
          <div class="admin-section-title">매장 정보</div>
          <div class="admin-form-row">
            <div class="admin-form-field">
              <label>매장명</label>
              <input type="text" data-field="title" value="${(store.title || '').replace(/"/g, '&quot;')}" placeholder="예: 도시락">
            </div>
          </div>
        </div>
        <div class="admin-section">
          <div class="admin-section-title">결제 정보</div>
          <div class="admin-form-row">
            <div class="admin-form-field">
              <label>예금주</label>
              <input type="text" data-field="accountHolder" value="${(payment.accountHolder || '').replace(/"/g, '&quot;')}" placeholder="예: (주)케이터링서비스">
            </div>
            <div class="admin-form-field">
              <label>은행</label>
              <input type="text" data-field="bankName" value="${(payment.bankName || '').replace(/"/g, '&quot;')}" placeholder="예: 신한은행">
            </div>
            <div class="admin-form-field">
              <label>계좌번호</label>
              <input type="text" data-field="accountNumber" value="${(payment.accountNumber || '').replace(/"/g, '&quot;')}" placeholder="예: 110-123-456789">
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

  document.querySelectorAll('.admin-store').forEach((storeEl) => {
    const storeId = storeEl.dataset.storeId;
    const titleInput = storeEl.querySelector('input[data-field="title"]');
    const accountHolderInput = storeEl.querySelector('input[data-field="accountHolder"]');
    const bankNameInput = storeEl.querySelector('input[data-field="bankName"]');
    const accountNumberInput = storeEl.querySelector('input[data-field="accountNumber"]');

    const store = { id: storeId, slug: storeId, title: titleInput?.value?.trim() || storeId, payment: {
      accountHolder: accountHolderInput?.value?.trim() || '',
      bankName: bankNameInput?.value?.trim() || '',
      accountNumber: accountNumberInput?.value?.trim() || '',
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

async function init() {
  const isAdmin = await checkAdmin();
  if (!isAdmin) {
    window.location.href = '/';
    return;
  }

  try {
    const { stores, menus } = await fetchStores();
    const content = document.getElementById('adminContent');
    content.innerHTML = stores.map((s) => renderStore(s, menus[s.id])).join('');

    content.addEventListener('click', (e) => {
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
    showError(err.message || '로딩 실패');
    document.getElementById('adminContent').innerHTML = '<p>다시 시도해 주세요.</p>';
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
