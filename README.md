# BzCat - 비즈니스 케이터링 주문 시스템

단체 케이터링 주문을 위한 웹 애플리케이션입니다.

## 기능

- **이메일 기반 로그인**: 6자리 인증 코드로 간편 로그인
- **메뉴 선택**: 카테고리별 메뉴 조회 및 장바구니 담기
- **주문 관리**: 배송 정보 입력 및 주문 제출
- **사용자 레벨**: admin(관리자) / manager / user

## 기술 스택

### 프론트엔드
- HTML, CSS, JavaScript (Vanilla)
- 반응형 디자인 (모바일 우선)

### 백엔드
- Vercel Serverless Functions
- Vercel Postgres (데이터베이스)
- JWT 인증

### 이메일
- Resend API

## 로컬 개발 환경 설정

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경 변수 설정

`.env.local` 파일을 생성하고 다음 환경 변수를 설정합니다:

```env
# Vercel Postgres (Vercel 프로젝트 연결 후 자동 주입)
POSTGRES_URL=
POSTGRES_PRISMA_URL=
POSTGRES_URL_NON_POOLING=
POSTGRES_USER=
POSTGRES_HOST=
POSTGRES_PASSWORD=
POSTGRES_DATABASE=

# JWT Secret (강력한 랜덤 문자열로 변경)
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# Resend API Key (https://resend.com 에서 발급)
RESEND_API_KEY=re_your_api_key_here
```

### 3. 데이터베이스 설정

Vercel Postgres를 생성하고 스키마를 초기화합니다:

```bash
# Vercel Postgres 생성 (Vercel Dashboard에서)
# 프로젝트에 Postgres 스토리지 추가

# 로컬에 환경 변수 가져오기
vercel env pull .env.local

# 데이터베이스 스키마 초기화
npm run setup-db
```

### 4. 개발 서버 실행

```bash
npm run dev
```

브라우저에서 `http://localhost:3000` 접속

## Vercel 배포

### 1. GitHub 연결

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin <your-github-repo-url>
git push -u origin main
```

### 2. Vercel 배포

```bash
vercel
```

또는 Vercel Dashboard에서 GitHub 저장소를 연결합니다.

### 3. 환경 변수 설정

Vercel Dashboard → 프로젝트 → Settings → Environment Variables에서 다음을 설정:

- `JWT_SECRET`: 강력한 랜덤 문자열
- `RESEND_API_KEY`: Resend API 키
- Vercel Postgres는 자동으로 연결됨

### 4. 데이터베이스 초기화

Vercel Dashboard → 프로젝트 → Storage → Postgres → Query에서 `db/schema.sql` 내용을 실행합니다.

## Resend 이메일 설정

1. https://resend.com 가입
2. API Key 생성
3. 도메인 추가 및 DNS 설정 (선택사항, 프로덕션 권장)
4. `api/auth/send-code.js`의 `from` 주소를 실제 도메인으로 변경

## API 엔드포인트

### 인증
- `POST /api/auth/send-code` - 인증 코드 발송
- `POST /api/auth/verify-code` - 코드 검증 및 로그인
- `GET /api/auth/session` - 세션 확인

### 주문
- `POST /api/orders/create` - 주문 생성

## 보안

- JWT 토큰으로 인증 관리
- 환경 변수로 민감 정보 보호
- CORS 설정
- SQL Injection 방지 (Parameterized queries)
- 인증 코드 만료 시간 설정 (10분)

## 관리자 계정

- 이메일: `bzcatmanager@gmail.com`
- 레벨: `admin`
- 초기 데이터에 자동 생성됨

## 라이선스

Private
