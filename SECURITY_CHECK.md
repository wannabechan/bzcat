# 보안 점검 요약 (코드 위험 요소)

**아래 항목들은 코드 수정으로 반영 완료됨.**

---

## 높음 (우선 조치 권장) ✅ 반영됨

### 1. JWT 시크릿 fallback (`api/_utils.js`)
- **변경**: fallback 제거. `JWT_SECRET`이 없거나 16자 미만이면 앱 기동 시 에러 발생.
- **로컬 개발**: `.env.local`에 `JWT_SECRET=16자이상비밀값` 설정 필요.

---

## 중간 (가능하면 수정) ✅ 반영됨

### 2. XSS – 메뉴 이름/설명 미이스케이프 (`app.js`)
- **변경**: `escapeHtml()` 유틸 추가 후, 메뉴 카드에서 `item.name`, `item.description`, `item.id` 출력 시 이스케이프 적용.

### 3. 개발용 코드 노출 (`auth.js`)
- **변경**: `devCode`를 `innerHTML`에 넣지 않고, `textContent`와 `createElement`로만 표시하도록 수정.

### 4. 결제 시크릿 선택 (구: 매장별 env 이름)
- **현재**: 서버는 `PAYKEY_BZCAT_WIDGET_SECRET`(및 구 `PAYKEY_BZCAT`)만 사용. 어드민 매장별 결제 env 입력은 제거됨.
- **직연동 결제**: 클라이언트는 `PAYKEY_BZCAT_API_CLIENT`, 승인/취소는 `PAYKEY_BZCAT_API_SECRET`과 위젯 시크릿 조합(아래 최근 점검 참고).

---

## 낮음 / 참고

### 5. 토큰 저장 위치 (`auth.js`, `admin/admin.js`)
- **현재**: JWT를 `localStorage`에 저장.
- **위험**: XSS가 발생하면 스크립트가 토큰을 읽어 탈취 가능.
- **권장**: 가능하면 HttpOnly 쿠키로 이전 검토. 당장은 XSS 방지(위 2, 3)가 선행.

### 6. `innerHTML` 사용처
- **app.js**: 메뉴 그리드, 장바구니, 주문 요약, 프로필 주문 카드 등에서 `innerHTML` 사용. 사용자/API 입력이 들어가는 부분은 이스케이프 필요(위 2 참고).
- **admin/admin.js**: 관리자 전용 화면; 입력값에 `replace(/"/g, '&quot;')` 등 일부 이스케이프 있음. `store.id`, `item.id` 등이 HTML 속성에 들어가므로 `"` 외에 `<`, `>` 등도 제한하거나 이스케이프하면 더 안전.

### 7. 리다이렉트
- 결제 성공/실패 리다이렉트는 `getAppOrigin(req)` 기반으로 동일 오리진으로만 이동 → 오픈 리다이렉트 위험 낮음.

### 8. 환경 변수 / 비밀값
- `.env`, `.env.local` 등이 `.gitignore`에 포함되어 있어 코드에 직접 노출되지 않음. 비밀값은 모두 `process.env` 사용.

### 9. Cron 인증 (`api/cron/auto-cancel-orders.js`, `api/cron/alimtalk-*.js`)
- `CRON_SECRET`으로 **Authorization: Bearer &lt;시크릿&gt;** 헤더만 검증. 쿼리스트링(`?secret=`)은 **사용하지 않음** (URL/리퍼러/로그에 시크릿이 남지 않도록 코드에서 제거됨).
- `CRON_SECRET`이 비어 있으면 모든 요청 거절. 프로덕션에서 강한 시크릿 설정 필요.

### 10. 주문 생성 입력 검증 (`api/orders/create.js`)
- `orderItems`: 배열 여부, 길이 1~100 제한, 각 항목에 `id`/`name`/`price`/`quantity` 필수. `quantity`는 1~999 정수, `price`는 0 이상 유한수만 허용.
- 비정상 body로 인한 과다 주문·메모리 사용 완화.

---

## 정리

| 항목               | 심각도 | 조치                          |
|--------------------|--------|-------------------------------|
| JWT fallback       | 높음   | production 외 환경에서도 시크릿 필수 또는 fallback 제거 |
| 메뉴 name/desc XSS | 중간   | HTML 이스케이프 적용          |
| auth devCode       | 중간   | textContent 또는 이스케이프   |
| 결제 시크릿       | —      | 매장별 env 선택 제거. 서버는 `PAYKEY_BZCAT_WIDGET_SECRET` 등 고정 키만 사용 |
| localStorage 토큰 | 낮음   | 장기적으로 HttpOnly 쿠키 검토 |

위 항목부터 순서대로 반영하면 위험 요소가 크게 줄어듭니다.

---

## 최근 점검 (보안 강화 & 코드 최적화)

### 보안
- **Cron 인증**: 3개 크론 엔드포인트에서 `req.query?.secret` 폴백 제거. **Authorization: Bearer &lt;CRON_SECRET&gt;** 헤더만 허용하여 URL/리퍼러/로그에 시크릿이 노출되지 않도록 수정.
- **PDF 다운로드**: `api/orders/pdf.js`에서 `Content-Disposition` filename을 `order.id` 기반으로 정규화(영문/숫자/하이픈·언더스코어만 허용)하여 헤더 인젝션 가능성 제거. `orderId` 쿼리 검증(trim, 빈 문자열 거부) 보강.

### 최적화
- **admin/admin.js**: `getToken()`을 async에서 동기 함수로 변경. `localStorage.getItem`만 사용하므로 Promise 불필요. 호출부 14곳에서 `await getToken()` → `getToken()`으로 변경.

---

## 2026 보안 점검 및 최적화

### 보안·안정성
- **결제 취소 API** (`api/orders/cancel.js`): `payment_completed` 시 토스 결제 취소 호출에 **위젯 시크릿(`gsk`) 실패 시 `PAYKEY_BZCAT_API_SECRET` 재시도** 추가. 직연동 간편결제(`ck` 경로)로 결제된 건의 취소가 위젯 키만으로는 `UNAUTHORIZED_KEY`가 나올 수 있어, 승인 API(`success.js`)와 동일한 키 매칭 전략을 맞춤.
- **요청 본문**: `req.body`가 객체가 아닐 때를 대비해 빈 객체로 처리 후 `orderId` 파싱.
- **인증**: 동일 파일에서 수동 Bearer 파싱 대신 `requireAuth(req, res)` 사용으로 일관성 유지.

### 참고 (추가 조치 없음)
- **`/api/config`**: `tossWidgetClientKey`, `tossApiClientKey`는 공개 클라이언트 키이므로 응답 포함이 정상. 시크릿은 절대 노출하지 않음.
- **프로덕션 CORS**: `APP_ORIGIN` 미설정 시 `Access-Control-Allow-Origin`이 빈 값에 가깝게 동작할 수 있으므로 배포 시 반드시 설정 권장.

---

## 2025 보안 점검 및 최적화

### 보안 강화 (반영됨)

1. **주문 생성 입력 검증 강화** (`api/orders/create.js`)
    - **req.body**를 객체 여부 확인 후 사용. 문자열 필드는 `trim()` 후 길이 제한 적용.
    - **길이 제한**: 주문자명 50자, 연락처 50자, 배송희망일 10자, 배송희망시간 20자, 배송주소 500자, 상세주소 300자, 경비유형 20자, 경비증빙 500자.
    - **orderItems**: 각 항목의 `id`/`name` 200자로 slice 후 저장. 과다 입력·저장 남용 방지.
    - **총 금액**: `Number.isFinite` 검증 및 최대 1억 원 제한. 비정상 금액·오버플로우 방지.

2. **이미지 업로드** (`api/admin/upload-image.js`)
    - MIME 타입 화이트리스트(JPEG, PNG, WebP, GIF), 4MB 제한 이미 적용됨. 유지.

3. **Cron / 결제**
    - Cron은 `Authorization: Bearer <CRON_SECRET>` 만 사용. PDF filename 정규화 등 기존 조치 유지.

### 코드 최적화 (반영됨)

1. **공통 인증 헬퍼** (`api/_utils.js`)
    - `requireAuth(req, res, { resolveLevel?: boolean })` 추가. Bearer 검증 후 사용자 반환, 실패 시 401 전송 후 null 반환.
    - `api/admin/order.js`에서 `requireAuth` 사용으로 인증 블록 단순화. 다른 API에서도 동일 패턴 적용 가능.

2. **주문 생성**
    - 문자열 trim 및 길이 제한으로 저장 데이터 정규화. `total_amount`는 검증된 숫자(`orderTotal`)만 저장.

### 참고 (추가 조치 없음)

- **XSS**: 사용자/API 입력이 들어가는 HTML은 `escapeHtml()` 적용됨. 이미지 `onerror` 등은 고정 문자열만 사용.
- **토큰**: JWT는 localStorage 저장. XSS 차단이 우선. 장기적으로 HttpOnly 쿠키 검토 가능.
- **innerHTML**: admin/app/store-orders에서 사용. 동적 값은 escapeHtml 처리 후 삽입하는 패턴 유지.
