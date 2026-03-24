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

  function resolveDirectEasyPay(selectedPm) {
    if (!selectedPm || typeof selectedPm !== 'object') return '';
    var fields = [
      selectedPm.code,
      selectedPm.easyPay,
      selectedPm.easyPayCode,
      selectedPm.methodKey,
      selectedPm.key,
      selectedPm.name,
    ];
    for (var i = 0; i < fields.length; i++) {
      var raw = fields[i];
      if (raw == null) continue;
      var normalized = String(raw).trim().toUpperCase().replace(/\s+/g, '');
      if (normalized === 'NAVERPAY' || normalized === '네이버페이') return 'NAVERPAY';
      if (normalized === 'KAKAOPAY' || normalized === '카카오페이') return 'KAKAOPAY';
      if (normalized === 'TOSSPAY' || normalized === '토스페이') return 'TOSSPAY';
    }
    return '';
  }

  /** 토스 약관: 렌더 직후 체크는 보이는데 agreementStatusChange가 안 오는 경우가 있어, SDK/지연/DOM으로 보완 */
  function syncAgreementInitialState(agreementWidget, btnPayEl, setAgreementOk) {
    if (!agreementWidget || typeof setAgreementOk !== 'function') return;

    function applyAgreementStatus(agreementStatus) {
      var ok = !!(agreementStatus && agreementStatus.agreedRequiredTerms);
      setAgreementOk(ok);
      if (btnPayEl) btnPayEl.disabled = !ok;
    }

    if (typeof agreementWidget.on === 'function') {
      agreementWidget.on('agreementStatusChange', applyAgreementStatus);
    } else {
      setAgreementOk(true);
      if (btnPayEl) btnPayEl.disabled = false;
      return;
    }

    function trySdkStatus() {
      var fn = agreementWidget.getAgreementStatus;
      if (typeof fn !== 'function') return;
      Promise.resolve(fn.call(agreementWidget))
        .then(applyAgreementStatus)
        .catch(function () {});
    }

    trySdkStatus();
    setTimeout(trySdkStatus, 0);
    setTimeout(trySdkStatus, 100);
    setTimeout(trySdkStatus, 300);

    setTimeout(function domFallbackIfStillDisabled() {
      if (!btnPayEl || !btnPayEl.disabled) return;
      var root = document.getElementById('agreement');
      if (!root) return;
      var boxes = root.querySelectorAll('input[type="checkbox"]');
      if (!boxes.length) return;
      var allChecked = true;
      for (var i = 0; i < boxes.length; i++) {
        if (!boxes[i].checked) {
          allChecked = false;
          break;
        }
      }
      if (allChecked) {
        applyAgreementStatus({ agreedRequiredTerms: true });
      }
    }, 50);
  }

  /** 토스 SDK가 던지는 PublicError 등에서 사용자/지원용 문구 추출 */
  function formatWidgetPaymentError(err) {
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
    var apiClientKey = (config && config.tossApiClientKey) ? String(config.tossApiClientKey).trim() : '';
    var variantPayment = (config && config.tossWidgetVariantPayment)
      ? String(config.tossWidgetVariantPayment).trim()
      : 'DEFAULT';
    if (!variantPayment) variantPayment = 'DEFAULT';

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

    var tossPayments;
    var widgets;
    var paymentMethodWidget;
    var directPayment = null;
    var agreementOk = false;
    var customerKey = getOrCreateCustomerKey();
    try {
      tossPayments = TossPayments(clientKey);
      widgets = tossPayments.widgets({ customerKey: customerKey });

      await widgets.setAmount({
        currency: 'KRW',
        value: payAmount,
      });

      paymentMethodWidget = await widgets.renderPaymentMethods({
        selector: '#payment-method',
        variantKey: variantPayment,
      });

      var agreementWidget = await widgets.renderAgreement({
        selector: '#agreement',
      });
      if (agreementWidget) {
        syncAgreementInitialState(agreementWidget, btnPay, function (ok) {
          agreementOk = ok;
        });
      } else {
        agreementOk = true;
        if (btnPay) btnPay.disabled = false;
      }
    } catch (widgetErr) {
      console.error('payment widget init:', widgetErr);
      showError('결제 화면을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
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
          var selectedPm = null;
          try {
            if (paymentMethodWidget && typeof paymentMethodWidget.getSelectedPaymentMethod === 'function') {
              selectedPm = await paymentMethodWidget.getSelectedPaymentMethod();
            }
          } catch (selErr) {
            console.warn('getSelectedPaymentMethod', selErr);
          }
          var code =
            selectedPm && selectedPm.code != null ? String(selectedPm.code).trim() : '';
          if (!code) {
            alert('결제 수단을 선택해 주세요.');
            return;
          }
          var directEasyPay = resolveDirectEasyPay(selectedPm);
          if (directEasyPay) {
            if (!apiClientKey) {
              alert('직연동 간편결제 설정이 필요합니다. 관리자에게 문의해 주세요.');
              return;
            }
            if (!directPayment) {
              try {
                directPayment = TossPayments(apiClientKey).payment({ customerKey: customerKey });
              } catch (initDirectErr) {
                console.error('direct payment init:', initDirectErr);
                alert('직연동 결제 모듈을 초기화하지 못했습니다. 설정을 확인해 주세요.');
                return;
              }
            }
            await directPayment.requestPayment({
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
                flowMode: 'DIRECT',
                easyPay: directEasyPay,
              },
            });
            return;
          }
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
