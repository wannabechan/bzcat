# BzCat 배포 가이드

## 1단계: Vercel Postgres 생성

1. Vercel Dashboard 접속
2. 프로젝트 선택 → Storage → Create Database
3. Postgres 선택 → 생성
4. 로컬 개발용 환경 변수 다운로드:
   ```bash
   vercel env pull .env.local
   ```

## 2단계: 데이터베이스 스키마 설정

### 방법 1: Vercel Dashboard에서 직접 실행

1. Vercel Dashboard → Storage → Postgres → Query
2. `db/schema.sql` 파일 내용을 복사하여 붙여넣기
3. Execute 클릭

### 방법 2: 로컬에서 스크립트 실행

```bash
npm install
npm run setup-db
```

## 3단계: Resend API 키 발급

1. https://resend.com 가입
2. API Keys → Create API Key
3. 키 복사 (나중에 다시 볼 수 없으므로 안전하게 보관)

## 4단계: 환경 변수 설정

Vercel Dashboard → 프로젝트 → Settings → Environment Variables

다음 변수를 추가:

```
JWT_SECRET=<강력한-랜덤-문자열-64자-이상>
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxx
```

JWT_SECRET 생성 예시:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

## 5단계: 코드 수정 (프로덕션 준비)

`api/auth/send-code.js` 파일에서 이메일 발송 주소 변경:

```javascript
from: 'BzCat <noreply@yourdomain.com>', // 실제 도메인으로 변경
```

## 6단계: GitHub에 Push

```bash
git add .
git commit -m "Add backend API and database"
git push origin main
```

## 7단계: 자동 배포 확인

Vercel이 자동으로 배포를 시작합니다:
- Vercel Dashboard → Deployments에서 진행 상황 확인
- 배포 완료 후 URL 확인

## 8단계: 테스트

1. 배포된 URL 접속
2. 이메일로 로그인 시도
3. 인증 코드 수신 확인 (실제 이메일)
4. 주문 테스트

## 문제 해결

### 이메일이 발송되지 않는 경우

1. Resend API 키 확인
2. Vercel Logs에서 오류 확인:
   ```
   Vercel Dashboard → Deployments → [최신 배포] → Functions 탭
   ```
3. 개발 모드에서는 `devCode`로 테스트 가능 (이메일 발송 없이)

### 데이터베이스 연결 오류

1. Vercel Postgres가 프로젝트에 연결되어 있는지 확인
2. 환경 변수가 자동으로 주입되었는지 확인:
   ```
   Settings → Environment Variables → Postgres 관련 변수들
   ```

### JWT 오류

1. `JWT_SECRET`이 환경 변수에 설정되어 있는지 확인
2. 모든 환경(Production, Preview, Development)에 설정되어 있는지 확인

## 프로덕션 체크리스트

- [ ] Vercel Postgres 생성 및 스키마 초기화
- [ ] Resend API 키 발급 및 설정
- [ ] JWT_SECRET 생성 및 설정
- [ ] 이메일 발송 주소를 실제 도메인으로 변경
- [ ] GitHub 연결 및 자동 배포 설정
- [ ] 로그인 테스트 (실제 이메일 수신 확인)
- [ ] 주문 생성 테스트
- [ ] 에러 로그 확인

## 다음 단계

- [ ] 관리자 페이지 구축 (주문 목록 조회)
- [ ] 주문 상태 관리 (확정, 완료, 취소)
- [ ] 이메일 알림 (주문 확정, 배송 안내)
- [ ] Manager 레벨 이메일 목록 관리
