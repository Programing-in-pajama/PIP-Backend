# SOYO 백엔드 (PIP-Backend)

맞춤형 식이 및 산책 코스 추천 웰니스 플랫폼 **소요(SOYO)**의 RESTful API 서버 레포지토리입니다.  
Node.js와 Express 기반으로 구축되었으며, PostgreSQL 데이터베이스, Supabase Auth, 식품의약품안전처 DUR 및 식품 영양성분 DB, 보행자 라우팅 엔진 연동을 제공합니다.

- 프론트엔드 레포지토리: https://github.com/Programing-in-pajama/PIP-Frontend
- 프론트엔드 배포 서비스: https://main.d3p7uoybais0cu.amplifyapp.com/
- 기본 서비스 포트: 8080

---

## 1. 기술 스택

| 구분 | 기술 및 라이브러리 | 설명 |
|---|---|---|
| Runtime / Framework | Node.js (v20+), Express 4 | 비동기 이벤트 기반 RESTful API 서버 구축 |
| Database | PostgreSQL 15, AWS RDS / Supabase | 사용자 계정, 프로필, 복약 정보 및 핀 영구 보관 (`pg` 커넥션 풀링) |
| Authentication | Supabase Auth, HMAC-SHA256 JWT | 이메일/비밀번호 인증, 소셜 OAuth 연동 및 JWT 이중 검증 |
| Mail Service | Nodemailer | 회원가입 및 계정 찾기용 6자리 인증코드 SMTP 전송 |
| Routing / Geo API | OSRM, Tmap Pedestrian Route API | 실보행 보행자 전용 도로망 폴리라인 생성 및 도보 소요 시간 연산 |
| External Healthcare Data | 식약처 DUR API, 식품 영양성분 DB | 약물 성분 중복 검사, 안심식당 메뉴 영양 평가 (3색 안심 신호등) |

---

## 2. 주요 기능 및 API 명세

### 2.1 인증 및 계정 관리 (`/api/auth`)
- `POST /api/auth/signup`: 신규 회원가입 및 초기 계정 생성
- `POST /api/auth/login`: 아이디/비밀번호 검증 및 서비스 JWT 토큰 발급
- `POST /api/auth/send-verification`: 이메일 인증번호(6자리) 발송
- `POST /api/auth/verify-code`: 전송된 이메일 인증번호 일치 확인
- `POST /api/auth/find-id`: 가입 이메일 기반 아이디 확인
- `POST /api/auth/reset-password`: 본인 확인 후 비밀번호 재설정
- `POST /api/auth/kakao`, `POST /api/auth/google`: OAuth 인가 코드를 통한 소셜 로그인 세션 동기화

### 2.2 사용자 프로필 및 건강 정보 (`/api/user`)
- `GET /api/user/profile`: 사용자 이름, 생년월일, 알레르기, 기저질환, 복용 약물 목록 조회
- `PUT /api/user/profile`: 회원정보 및 만성질환 선택 내역 수정 (`ON CONFLICT DO UPDATE`)
- `POST /api/user/profile`: 최초 온보딩 건강 프로필 등록

### 2.3 복용 약물 및 식약처 DUR 연계 (`/api/medications`)
- `GET /api/medications/search`: 식약처 의약품 DB 기반 약물명 자동완성 및 주의사항 조회
- `POST /api/medications`: 사용자 복용 약물 등록
- `POST /api/medications/check-duplicate`: 등록 약물 간 동일 성분 중복 복용 위험도 분석

### 2.4 추천 산책로 및 보행 내비게이션 (`/api/routes`)
- `POST /api/routes/recommend`: 사용자 현재 위치, 목표 시간(10/25/60분), 식당 포함 여부, 질환 코드를 결합한 맞춤 코스 추천
- `POST /api/routes/pedestrian-path`: 출발지-경유 식당-도착지 간 실보행 도로망 고밀도 폴리라인 생성
- `POST /api/routes/walk-record`: 산책 완보 후 실제 이동 거리, 소요 시간, 체감 난이도 기록 저장

### 2.5 안심 식당 영양 분석 (`/api/nutrition`)
- `GET /api/nutrition/restaurant/:id`: 코스 경유 식당의 대표 메뉴 및 식품 영양성분(칼로리, 당류, 나트륨) 조회
- `POST /api/nutrition/evaluate`: 사용자 기저질환(당뇨, 고혈압 등) 임계치 기반 3색 안심 신호등 판정

### 2.6 핀 보관함 및 폴더 관리 (`/api/pins`)
- `GET /api/pins/folders`: 사용자별 핀 보관함 폴더 목록 조회
- `POST /api/pins/folders`: 새 핀 보관함 폴더 생성
- `DELETE /api/pins/folders/:id`: 보관함 폴더 및 하위 핀 삭제
- `GET /api/pins`: 특정 폴더 또는 전체 저장 핀 목록 조회
- `POST /api/pins`: 추천 코스를 지정 폴더에 북마크 저장
- `DELETE /api/pins/:id`: 개별 핀 저장 해제

---

## 3. 디렉터리 구조

```
PIP-Backend/
  docs/
    API.md              통합 REST API 상세 규격서
    GUIDE.md            협업 가이드 및 개발 안내
  lib/
    db.js               PostgreSQL 풀 및 스키마 Auto-Migration
    jwt.js              자체 HMAC-SHA256 JWT 서명 및 검증 모듈
    mail.js             Nodemailer SMTP 이메일 발송 유틸
  middleware/
    auth.js             authenticateToken (서비스 JWT & Supabase 토큰 이중 검증)
    validator.js        요청 데이터 유효성 검사 미들웨어
  routes/
    auth.js             인증, 소셜 로그인, 비밀번호 찾기 라우터
    medications.js      의약품 검색 및 DUR 성분 중복 분석 라우터
    nutrition.js        식품 영양성분 평가 라우터
    pedestrian.js       보행자 경로 엔진 및 맞춤 코스 추천 라우터
    pins.js             핀 보관함 및 폴더 관리 라우터
    posts.js            게시글 API 라우터
    test.js             서버 연결 헬스체크 라우터 (/api/test)
    user.js             회원 프로필 및 건강정보 동기화 라우터
  api-test.http         VS Code REST Client 전용 API 호출 테스트 파일
  index.js              Express 진입점 및 전역 미들웨어 설정
  package.json          의존성 및 실행 스크립트 정의
```

---

## 4. 로컬 개발 환경 설정

### 4.1 요구 사항
- Node.js 20.0.0 이상
- npm 9.0.0 이상
- PostgreSQL 15+ 또는 Supabase/AWS RDS 데이터베이스

### 4.2 설치 및 실행
```bash
# 1. 레포지토리 클론
git clone https://github.com/Programing-in-pajama/PIP-Backend.git
cd PIP-Backend

# 2. 패키지 설치
npm install

# 3. 환경 변수 설정
cp .env.example .env

# 4. 개발 서버 실행
npm run dev
```

서버 구동 후 브라우저 또는 터미널에서 `http://localhost:8080/api/test` 접속 시 `{"status":"ok"}` 응답이 반환되면 정상 구동된 것입니다.

---

## 5. 환경 변수 (.env) 설정 가이드

```env
PORT=8080
DATABASE_URL=postgresql://<username>:<password>@<host>:5432/<database>?sslmode=require
JWT_SECRET=<your-jwt-secret>
SUPABASE_URL=https://<your-project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
EMAIL_USER=<your-smtp-email>
EMAIL_PASS=<your-smtp-password>
CORS_ORIGINS=https://main.d3p7uoybais0cu.amplifyapp.com,http://localhost:5173
```

---

## 6. API 테스트 가이드

VS Code의 **REST Client** 확장을 설치한 후, 루트 디렉터리의 `api-test.http` 파일을 열어 각 엔드포인트 상단의 `Send Request` 링크를 클릭하면 실서버 또는 로컬 서버로 요청을 즉시 테스트할 수 있습니다.

---

## 7. 협업 및 기여 가이드라인

1. **브랜치 전략**: `main` 브랜치에 직접 푸시하지 않고, 작업 단위별 브랜치(`feat/기능명`, `fix/버그명`)를 생성하여 작업 후 PR을 통해 병합합니다.
2. **데이터베이스 무결성**: DDL(테이블 생성/수정/삭제) 작업이 필요한 경우, 사전에 팀과 스키마 변경 사항을 공유하고 승인을 거칩니다.
3. **API 명세 동기화**: 프론트엔드 연동 필드 규약이 변경될 경우 `docs/API.md` 문서를 먼저 갱신하고 프론트엔드 팀과 동기화합니다.
