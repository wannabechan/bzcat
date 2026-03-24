/**
 * 토스 결제위젯 전용 페이지 (payment.html)
 */

(function () {
  const TOKEN_KEY = 'bzcat_token';

  window.addEventListener('pageshow', function (event) {
    if (event.persisted) {
      window.location.reload();
    }
  });

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
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

  /** 토스 SDK가 던지는 PublicError 등에서 사용자/지원용 문구 추출 */
  function formatWidgetPaymentError(err) {
    if (!err) return '결제 요청에 실패했습니다. 다시 시도해 주세요.';
    var code = err.code != null ? String(err.code) : '';
    var msg =
      (typeof err.message === 'string' && err.message.trim()) ||
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
    const token = getToken();

    if (!orderId) {
      showError('주문 번호가 없습니다.');
      return;
    }
    if (!token) {
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
        headers: { Authorization: 'Bearer ' + token },
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

    var clientKey = (config && config.tossWidgetClientKey) ? String(config.tossWidgetClientKey).trim() : '';
    if (!clientKey) {
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
      var amt = Number(orderData.amount);
      span.textContent = Number.isFinite(amt) ? amt.toLocaleString() + '원' : '';
      summaryEl.appendChild(strong);
      summaryEl.appendChild(span);
    }

    var tossPayments = TossPayments(clientKey);
    var widgets = tossPayments.widgets({ customerKey: getOrCreateCustomerKey() });

    await widgets.setAmount({
      currency: 'KRW',
      value: orderData.amount,
    });

    await widgets.renderPaymentMethods({
      selector: '#payment-method',
      variantKey: 'DEFAULT',
    });

    var agreementOk = false;
    try {
      var agreementWidget = await widgets.renderAgreement({
        selector: '#agreement',
      });
      if (agreementWidget && typeof agreementWidget.on === 'function') {
        agreementWidget.on('agreementStatusChange', function (agreementStatus) {
          agreementOk = !!(agreementStatus && agreementStatus.agreedRequiredTerms);
          if (btnPay) btnPay.disabled = !agreementOk;
        });
      } else {
        agreementOk = true;
        if (btnPay) btnPay.disabled = false;
      }
    } catch (agrErr) {
      console.error('renderAgreement:', agrErr);
      showError('약관 영역을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
      return;
    }

    var origin = window.location.origin;
    // successUrl·failUrl에는 쿼리를 붙이지 않음. 토스가 인증 후 orderId·amount·paymentKey 등을 붙임.
    // 기존 ?orderId= 를 미리 넣으면 URL 검증 실패(IncorrectSuccessUrlFormat 등)가 날 수 있음.
    var successUrl = origin + '/api/payment/success';
    var failUrl = origin + '/api/payment/fail';

    if (btnPay) {
      btnPay.addEventListener('click', async function () {
        if (!agreementOk) return;
        try {
          await widgets.requestPayment({
            orderId: String(orderData.orderId),
            orderName: String(orderData.orderName),
            successUrl: successUrl,
            failUrl: failUrl,
            // PC 기본 iframe이면 리다이렉트 결과 페이지로 이동이 막힐 수 있어 전체 창(self)으로 통일
            windowTarget: 'self',
            customerEmail: orderData.customerEmail || undefined,
            customerName: orderData.customerName || undefined,
            customerMobilePhone: orderData.customerMobilePhone
              ? digitsOnly(orderData.customerMobilePhone)
              : undefined,
          });
        } catch (payErr) {
          console.error('requestPayment', payErr);
          alert(formatWidgetPaymentError(payErr));
        }
      });
    }

    if (btnCancel) {
      btnCancel.addEventListener('click', function () {
        goBackToOrders();
      });
    }
  }

  init();
})();
