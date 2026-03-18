/**
 * 주문 내역 표시 공통 로직 (메일, Admin 팝업, PDF, 앱)
 * - 상품 id에서 매장 slug 추출
 * - 매장 목록에서 slug → 브랜드명 맵 생성
 */

/**
 * 상품 id에서 매장 slug 추출
 * 형식: {storeSlug}-{menuId}. menuId에 하이픈 포함 가능 (generateId가 storeId-timestamp-random 생성)
 * @param {string} itemId - 상품 id (예: store-mma43xv8-lz3k2m-abc1)
 * @param {object[]|string[]} [storesOrSlugs] - 매장 배열 또는 slug 문자열 배열. 있으면 longest-prefix 매칭으로 정확한 slug 반환
 */
function getSlugFromItemId(itemId, storesOrSlugs) {
  const id = String(itemId || '').trim();
  if (!id) return 'default';

  if (storesOrSlugs && (Array.isArray(storesOrSlugs) && storesOrSlugs.length > 0)) {
    const slugs = storesOrSlugs.every((x) => typeof x === 'string')
      ? [...new Set(storesOrSlugs)].filter(Boolean)
      : [...new Set((storesOrSlugs || []).map((s) => (s.slug || s.id || '').toString()).filter(Boolean))];
    slugs.sort((a, b) => b.length - a.length);
    const idLower = id.toLowerCase();
    for (const slug of slugs) {
      const s = slug.toLowerCase();
      if (idLower === s || idLower.startsWith(s + '-')) return s;
    }
  }

  const parts = id.split('-');
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
