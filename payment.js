/**
 * 토스 API 개별 연동 결제 페이지 (payment.html)
 */

(function () {
  const TOKEN_KEY = 'bzcat_token';

  /** 체크아웃 전용 페이지: 브라우저 뒤로 가기 시 중간 히스토리 대신 홈(취소 URL)으로 보냄 */
  (function setupPaymentBackGuard() {
    try {
      history.pushState({ bzcatPaymentGuard: true }, '', window.location.href);
    } catch (_) {}
    function onPopState() {
      window.removeEventListener('popstate', onPopState);
      window.location.replace('/?payment=cancel');
    }
    window.addEventListener('popstate', onPopState);
  })();

  window.addEventListener('pageshow', function (event) {
    if (event.persisted) {
      window.location.reload();
    }
  });

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function paymentAuthHeaders() {
    var t = getToken();
    var h = {};
    if (t) h['Authorization'] = 'Bearer ' + t;
    return h;
  }

  async function ensurePaymentSession() {
    var initial = getToken();
    var r = await fetch('/api/auth/session', {
      credentials: 'include',
      headers: paymentAuthHeaders(),
    });
    if (!r.ok && initial) {
      r = await fetch('/api/auth/session', {
        credentials: 'include',
        headers: {},
      });
      if (r.ok) {
        try {
          localStorage.removeItem(TOKEN_KEY);
        } catch (_) {}
      }
    }
    return r.ok;
  }

  function showError(message) {
    const loading = document.getElementById('paymentLoading');
    const err = document.getElementById('paymentError');
    const main = document.getElementById('paymentMain');
    const errText = document.getElementById('paymentErrorText');
    if (loading) loading.style.display = 'none';
    if (main) main.style.display = 'none';
    if (errText) errText.textContent = message || '오류가 발생했습니다.';
    if (err) err.style.display = 'block';
  }

  function goBackToOrders() {
    window.location.href = '/?payment=cancel';
  }

  function getOrCreateCustomerKey() {
    try {
      var k = sessionStorage.getItem('bzcat_toss_customer_key');
      if (k && typeof k === 'string' && k.length >= 2) return k;
      k = crypto.randomUUID();
      sessionStorage.setItem('bzcat_toss_customer_key', k);
      return k;
    } catch (_) {
      return 'bzcat-' + String(Date.now()) + '-' + Math.random().toString(36).slice(2, 12);
    }
  }

  function digitsOnly(s) {
    return String(s || '').replace(/\D/g, '');
  }

  function buildApiClientKey(rawKey) {
    var key = String(rawKey || '').trim();
    if (!key) return '';
    if (key.startsWith('live_ck_') || key.startsWith('test_ck_')) return key;
    if (key.startsWith('live_sk_')) return 'live_ck_' + key.slice('live_sk_'.length);
    if (key.startsWith('test_sk_')) return 'test_ck_' + key.slice('test_sk_'.length);
    // 결제위젯 키(gck/gsk)는 API 개별 연동 SDK에서 사용할 수 없음
    if (key.startsWith('live_gck_') || key.startsWith('test_gck_') || key.startsWith('live_gsk_') || key.startsWith('test_gsk_')) return '';
    return '';
  }

  /** 토스 SDK 오류에서 사용자/지원용 문구 추출 */
  function formatPaymentError(err) {
    if (!err) return '결제 요청에 실패했습니다. 다시 시도해 주세요.';
    var nested = err.error && typeof err.error === 'object' ? err.error : null;
    var code =
      err.code != null
        ? String(err.code)
        : nested && nested.code != null
          ? String(nested.code)
          : '';
    var msg =
      (typeof err.message === 'string' && err.message.trim()) ||
      (nested && typeof nested.message === 'string' && nested.message.trim()) ||
      (typeof err.reason === 'string' && err.reason.trim()) ||
      '';
    if (msg && code) return msg + '\n(' + code + ')';
    if (msg) return msg;
    if (code) return '결제 요청에 실패했습니다. (' + code + ')';
    try {
      return '결제 요청에 실패했습니다.\n' + String(err);
    } catch (_) {
      return '결제 요청에 실패했습니다. 다시 시도해 주세요.';
    }
  }

  document.getElementById('paymentErrorBack')?.addEventListener('click', goBackToOrders);
  document.getElementById('paymentHomeLink')?.addEventListener('click', function (e) {
    e.preventDefault();
    goBackToOrders();
  });

  async function init() {
    const params = new URLSearchParams(window.location.search);
    const orderId = (params.get('orderId') || '').trim();

    if (!orderId) {
      showError('주문 번호가 없습니다.');
      return;
    }
    if (!(await ensurePaymentSession())) {
      window.location.replace('/?payment=cancel');
      return;
    }

    if (typeof TossPayments !== 'function') {
      showError('결제 모듈을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
      return;
    }

    var configRes;
    var orderRes;
    try {
      configRes = await fetch('/api/config');
      orderRes = await fetch('/api/payment/widget-order?orderId=' + encodeURIComponent(orderId), {
        credentials: 'include',
        headers: paymentAuthHeaders(),
      });
    } catch (err) {
      console.error(err);
      showError('네트워크 오류가 발생했습니다.');
      return;
    }

    var config = {};
    try {
      config = await configRes.json();
    } catch (_) {}

    var apiClientKey = buildApiClientKey((config && config.tossApiClientKey) ? String(config.tossApiClientKey).trim() : '');
    if (!apiClientKey) {
      showError('결제(클라이언트 키) 설정이 되어 있지 않습니다. 관리자에게 문의해 주세요.');
      return;
    }

    var orderData = {};
    try {
      orderData = await orderRes.json();
    } catch (_) {}

    if (!orderRes.ok) {
      showError((orderData && orderData.error) || '주문 정보를 불러올 수 없습니다.');
      return;
    }

    var payAmount = Math.floor(Number(orderData.amount));
    if (!Number.isFinite(payAmount) || payAmount < 100) {
      showError('유효한 결제 금액이 아닙니다.');
      return;
    }

    var loading = document.getElementById('paymentLoading');
    var main = document.getElementById('paymentMain');
    var summaryEl = document.getElementById('paymentOrderSummary');
    var btnPay = document.getElementById('btnPaymentSubmit');
    var btnCancel = document.getElementById('btnPaymentCancel');

    if (loading) loading.style.display = 'none';
    if (main) main.style.display = 'block';

    if (summaryEl) {
      summaryEl.textContent = '';
      var strong = document.createElement('strong');
      strong.textContent = '주문 #' + String(orderData.orderId);
      var span = document.createElement('span');
      span.className = 'payment-widget-amount';
      span.textContent = payAmount.toLocaleString() + '원';
      summaryEl.appendChild(strong);
      summaryEl.appendChild(span);
    }

    var customerKey = getOrCreateCustomerKey();

    var origin = window.location.origin;
    // successUrl·failUrl에는 쿼리를 붙이지 않음. 토스가 인증 후 orderId·amount·paymentKey 등을 붙임.
    // 기존 ?orderId= 를 미리 넣으면 URL 검증 실패(IncorrectSuccessUrlFormat 등)가 날 수 있음.
    var successUrl = origin + '/api/payment/success';
    var failUrl = origin + '/api/payment/fail';

    var requested = false;
    async function requestPaymentNow() {
      if (requested) return;
      requested = true;
      if (btnPay) btnPay.disabled = true;
      try {
        var tossPayments = TossPayments(apiClientKey);
        var paymentClient = tossPayments.payment({ customerKey: customerKey });
        await paymentClient.requestPayment({
          method: 'CARD',
          amount: { currency: 'KRW', value: payAmount },
          orderId: String(orderData.orderId),
          orderName: String(orderData.orderName),
          successUrl: successUrl,
          failUrl: failUrl,
          windowTarget: 'self',
          customerEmail: orderData.customerEmail || undefined,
          customerName: orderData.customerName || undefined,
          customerMobilePhone: orderData.customerMobilePhone
            ? digitsOnly(orderData.customerMobilePhone)
            : undefined,
          card: {
            flowMode: 'DEFAULT',
          },
        });
      } catch (payErr) {
        console.error('requestPayment', payErr);
        requested = false;
        if (btnPay) btnPay.disabled = false;
        alert(formatPaymentError(payErr));
      }
    }

    if (btnPay) {
      btnPay.disabled = false;
      btnPay.addEventListener('click', requestPaymentNow);
    }
    // 내 주문에서 결제 클릭 시 중간 단계 없이 즉시 결제창으로 이동
    requestPaymentNow();

    if (btnCancel) {
      btnCancel.addEventListener('click', function () {
        goBackToOrders();
      });
    }
  }

  init();
})();
