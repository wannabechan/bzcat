# 단체 케이터링 주문

단체 케이터링 주문을 위한 웹페이지입니다.

## 기능

- **카테고리 선택**: 도시락, 반찬, 샐러드, 음료, 디저트
- **메뉴 담기**: 수량 조절 후 장바구니에 담기
- **장바구니**: 담은 메뉴 확인, 수량 변경, 삭제
- **결제 안내**: 계좌송금 정보 표시 (결제 모듈 미연동)

## 로컬 실행

```bash
# Python 3
python -m http.server 8080

# 또는 Node.js (npx)
npx serve .
```

브라우저에서 http://localhost:8080 접속

## Vercel 배포

### 1. GitHub에 푸시

```bash
git init
git add .
git commit -m "Initial commit: catering order page"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/bzcat.git
git push -u origin main
```

### 2. Vercel 연결

1. [vercel.com](https://vercel.com) 로그인
2. **Add New** → **Project** 선택
3. GitHub 저장소 `bzcat` 선택 후 **Import**
4. **Framework Preset**: Other
5. **Build Command**: (비워두기)
6. **Output Directory**: (비워두기 - 루트가 정적 파일)
7. **Deploy** 클릭

배포 후 Vercel이 제공하는 URL에서 테스트할 수 있습니다.
