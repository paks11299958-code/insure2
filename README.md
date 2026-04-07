# 보험 중복보장 AI 분석기

> **insure.dbzone.kr** — AI가 보험 문서를 읽고 중복 보장 항목을 찾아 보고서를 생성합니다.

PDF · JPG · PNG · TXT 파일 업로드 → Claude AI 분석 → 중복 항목 + 절감액 보고서

---

## 배포 (Vercel)

### 1. 이 저장소 Fork 또는 Clone

```bash
git clone https://github.com/YOUR_ID/insure-analyzer.git
cd insure-analyzer
```

### 2. Vercel에 배포

1. [vercel.com](https://vercel.com) → **New Project** → 이 저장소 선택 → **Deploy**

### 3. 환경변수 설정

Vercel 대시보드 → **Settings → Environment Variables**

| 변수명 | 값 |
|--------|-----|
| `ANTHROPIC_API_KEY` | `sk-ant-api03-...` |
| `RATE_LIMIT_PER_HOUR` | `20` |

설정 후 **Redeploy** 클릭

### 4. 도메인 연결 (insure.dbzone.kr)

Vercel → **Settings → Domains** → `insure.dbzone.kr` 추가

도메인 DNS 설정 (dbzone.kr 관리 패널):
```
타입: CNAME
호스트: insure  
값: cname.vercel-dns.com
```

---

## 로컬 개발

```bash
# 1. 의존성 설치
npm install

# 2. 환경변수 설정
cp .env.local.example .env.local
# .env.local 열어서 API 키 입력

# 3. 실행
npm run dev
# → http://localhost:3000
```

API 키 발급: [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)

---

## 기술 스택

- **Next.js 14** (App Router)
- **Claude claude-sonnet-4-20250514** (PDF Vision + 중복 분석)
- **Vercel** (배포)
