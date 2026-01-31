/**
 * POST /api/orders/create
 * 주문 생성
 */

const { verifyToken, apiResponse } = require('../_utils');
const { createOrder } = require('../_redis');

module.exports = async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return apiResponse(res, 200, {});
  }

  if (req.method !== 'POST') {
    return apiResponse(res, 405, { error: 'Method not allowed' });
  }

  try {
    // 인증 확인
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return apiResponse(res, 401, { error: '로그인이 필요합니다.' });
    }

    const token = authHeader.substring(7);
    const user = verifyToken(token);

    if (!user) {
      return apiResponse(res, 401, { error: '유효하지 않은 토큰입니다.' });
    }

    const {
      depositor,
      contact,
      expenseType,
      expenseDoc,
      deliveryDate,
      deliveryTime,
      deliveryAddress,
      detailAddress,
      orderItems,
      totalAmount,
    } = req.body;

    // 필수 필드 검증
    if (!depositor || !contact || !deliveryDate || !deliveryTime || !deliveryAddress || !orderItems || !totalAmount) {
      return apiResponse(res, 400, { error: '필수 정보를 모두 입력해 주세요.' });
    }

    // 최소 주문 금액 검증
    if (totalAmount < 300000) {
      return apiResponse(res, 400, { error: '최소 주문 금액은 300,000원입니다.' });
    }

    // 주문 생성 (Redis)
    const order = await createOrder({
      user_email: user.email,
      depositor,
      contact,
      expense_type: expenseType || 'none',
      expense_doc: expenseDoc || null,
      delivery_date: deliveryDate,
      delivery_time: deliveryTime,
      delivery_address: deliveryAddress,
      detail_address: detailAddress || null,
      order_items: orderItems,
      total_amount: totalAmount,
    });

    return apiResponse(res, 201, {
      success: true,
      message: '주문이 접수되었습니다.',
      order: {
        id: order.id,
        createdAt: order.created_at,
      },
    });

  } catch (error) {
    console.error('Create order error:', error);
    return apiResponse(res, 500, { error: '서버 오류가 발생했습니다.' });
  }
};
