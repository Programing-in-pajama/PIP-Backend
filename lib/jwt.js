const crypto = require('crypto');

const DEFAULT_SECRET = 'soyo_team_pip_jwt_secret_key_2026_secure!';

function getSecret() {
  return process.env.JWT_SECRET || DEFAULT_SECRET;
}

function base64UrlEncode(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) {
    str += '=';
  }
  return Buffer.from(str, 'base64').toString('utf8');
}

/**
 * HS256 표준 JWT 토큰 서명 함수
 * @param {object} payload - 토큰에 담길 데이터 (예: { id, email, userName, provider })
 * @param {object} options - 옵션 (expiresIn: 초 단위, 기본값 7일)
 * @returns {string} 서명된 JWT 토큰
 */
function sign(payload, options = {}) {
  const secret = getSecret();
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };

  const now = Math.floor(Date.now() / 1000);
  const expiresIn = options.expiresIn || 7 * 24 * 60 * 60; // 기본 7일

  const fullPayload = {
    ...payload,
    iat: now,
    exp: now + expiresIn
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));

  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

/**
 * HS256 표준 JWT 토큰 검증 함수
 * @param {string} token - 검증할 JWT 토큰
 * @returns {object} 복호화된 페이로드 객체
 */
function verify(token) {
  const secret = getSecret();
  if (!token || typeof token !== 'string') {
    throw new Error('토큰이 제공되지 않았습니다.');
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('JWT 형식이 올바르지 않습니다.');
  }

  const [encodedHeader, encodedPayload, signature] = parts;

  // 헤더 및 서명 알고리즘 검증
  let header;
  try {
    header = JSON.parse(base64UrlDecode(encodedHeader));
  } catch (e) {
    throw new Error('헤더 파싱에 실패했습니다.');
  }

  if (header.alg !== 'HS256') {
    throw new Error(`지원하지 않는 알고리즘입니다: ${header.alg}`);
  }

  // HMAC-SHA256 서명 일치 확인 (타이밍 공격 방지를 위한 timingSafeEqual 사용)
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  const sigBuffer = Buffer.from(signature);
  const expectedSigBuffer = Buffer.from(expectedSignature);

  if (sigBuffer.length !== expectedSigBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedSigBuffer)) {
    throw new Error('토큰 서명이 유효하지 않습니다.');
  }

  // 페이로드 파싱 및 만료시간 검증
  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload));
  } catch (e) {
    throw new Error('페이로드 파싱에 실패했습니다.');
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) {
    throw new Error('토큰이 만료되었습니다.');
  }

  return payload;
}

module.exports = {
  sign,
  verify
};
