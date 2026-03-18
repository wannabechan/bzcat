/**
 * 주문 내역 표시 공통 로직 (메일, Admin 팝업, PDF, 앱)
 * - 상품 id에서 매장 slug 추출
 * - 매장 목록에서 slug → 브랜드명 맵 생성
 */

/**
 * 상품 id에서 매장 slug 추출
 * 형식: {storeSlug}-{menuId}. storeSlug에 하이픈 포함 가능 (예: store-mma43xv8-1 → store-mma43xv8)
 */
function getSlugFromItemId(itemId) {
  const parts = String(itemId || '').split('-');
  if (parts.length <= 1) return (parts[0] || 'default').toLowerCase();
  return parts.slice(0, -1).join('-').toLowerCase();
}

/**
 * 매장 표시명: 어드민 매장 정보의 '브랜드명' 우선, 없으면 title → id → slug
 */
function getStoreDisplayName(store) {
  if (!store) return '';
  return (store.brand || store.title || store.id || store.slug || '').toString().trim() || '';
}

/**
 * stores 배열로 slug → 브랜드명(표시명) 맵 생성.
 * 주문 내역에서 "매장명"으로 쓸 때 사용 (메일, PDF, Admin 팝업)
 */
function buildSlugToBrandName(stores) {
  const map = {};
  for (const s of stores || []) {
    const slug = (s.slug || s.id || '').toString();
    const name = getStoreDisplayName(s) || slug;
    if (slug) {
      map[slug] = name;
      map[slug.toLowerCase()] = name;
    }
  }
  return map;
}

module.exports = {
  getSlugFromItemId,
  getStoreDisplayName,
  buildSlugToBrandName,
};
