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

### 4. 관리자 입력 – env 변수 이름 (`api/payment/create.js`, `api/payment/success.js`)
- **변경**: `ALLOWED_TOSS_ENV_NAMES = ['TOSS_SECRET_KEY', 'TOSS_SECRET_KEY_TEST']` 화이트리스트 추가. 목록에 없는 이름이면 `TOSS_SECRET_KEY`로 fallback.

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

### 9. Cron 인증 (`api/cron/auto-cancel-orders.js`)
- `CRON_SECRET`으로 Bearer/query 검증. `CRON_SECRET`이 비어 있으면 모든 요청 거절되므로, 프로덕션에서만 강한 시크릿 설정하면 됨.

---

## 정리

| 항목               | 심각도 | 조치                          |
|--------------------|--------|-------------------------------|
| JWT fallback       | 높음   | production 외 환경에서도 시크릿 필수 또는 fallback 제거 |
| 메뉴 name/desc XSS | 중간   | HTML 이스케이프 적용          |
| auth devCode       | 중간   | textContent 또는 이스케이프   |
| apiKeyEnvVar       | 중간   | 허용 env 이름 화이트리스트   |
| localStorage 토큰 | 낮음   | 장기적으로 HttpOnly 쿠키 검토 |

위 항목부터 순서대로 반영하면 위험 요소가 크게 줄어듭니다.
