/**
 * 정산 시 주문당 배송비 공제액.
 * 배송 번호 저장 시 기록된 actual_delivery_fee가 있으면 우선, 없으면 매장 설정 deliveryFee(레거시).
 */
function settlementDeliveryFeeForOrder(order, store) {
  const v = Number(order.actual_delivery_fee);
  if (Number.isFinite(v) && v >= 0) return Math.floor(v);
  const d = Number(store?.deliveryFee);
  return Number.isFinite(d) && d >= 0 ? Math.floor(d) : 50000;
}

module.exports = { settlementDeliveryFeeForOrder };
