# SOYO API 명세

> 프론트엔드와 백엔드의 **약속**입니다. API를 추가하거나 바꿀 때는 **코드보다 이 문서를 먼저 고치고**, 단톡방에 알려주세요.
> 그래야 프론트는 목(mock) 데이터로, 백엔드는 실제 구현으로 동시에 개발할 수 있습니다.

## 공통 규칙
- 기본 주소: 로컬 `http://localhost:8080` / 배포 `https://program-in-pazama.onrender.com`
- 요청·응답 본문은 JSON
- 로그인이 필요한 API는 헤더에 `Authorization: Bearer <Supabase access_token>`
- **에러 응답은 항상** `{ "error": "사람이 읽을 수 있는 메시지" }`

| 상태 코드 | 의미 |
|---|---|
| 200 / 201 | 성공 / 생성 성공 |
| 400 | 요청 값이 잘못됨 (빈 제목 등) |
| 401 | 토큰 없음 |
| 403 | 토큰이 잘못되었거나 만료됨 |
| 500 | 서버 내부 오류 |
| 503 | 서버에 DB/Supabase 설정이 없음 (로컬 개발 중 흔함) |

---

## GET /api/test — 연결 테스트
응답 `200`
```json
{
  "status": "ok",
  "message": "SOYO 백엔드 연결 성공",
  "timestamp": "2026-10-07T00:00:00.000Z",
  "services": { "database": true, "supabase": true }
}
```


## POST /api/auth/naver — 네이버 소셜 로그인 및 회원가입
네이버 인가코드(`code`)와 `state`를 전달받아 네이버 토큰 및 프로필을 조회하고, DB 등록/조회 후 서비스 JWT 토큰을 발급합니다.
🔒 로그인 불필요 (OAuth 2.0 인가 코드 교환)

요청
```json
{
  "code": "네이버가_발급한_authorization_code",
  "state": "CSRF_방지용_랜덤_state"
}
```

응답 `200`
```json
{
  "success": true,
  "isNewUser": false,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "c1f7a0b1-...",
    "userName": "홍길동",
    "email": "user@naver.com",
    "birthDate": "1990-05-15",
    "age": 36,
    "provider": "naver"
  }
}
```
> **참고**: `isNewUser: true`인 경우 신규 유저이므로 프론트엔드에서 건강 프로필 추가 입력 화면(`SignupFlow - Step 2`)으로 유도합니다.

에러
- `400`: `code` 또는 `state` 누락, 네이버 토큰 발급 실패, 네이버 프로필 조회 실패
- `500`: 서버 내부 오류

---

## 새 API 추가 양식 (복사해서 사용)
```
## METHOD /api/경로 — 한 줄 설명
🔒 로그인 필요 여부
담당: 이름

요청: { ... }
응답 2xx: { ... }
에러: 400 ..., 404 ...
```

