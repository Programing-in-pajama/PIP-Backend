const { supabase } = require('../lib/supabase');
const jwt = require('../lib/jwt');

// 토큰 인증 미들웨어: 통과하면 req.user 에 로그인한 유저 정보가 담김
// (네이버 소셜 로그인/서비스 자체 발급 JWT 및 Supabase Access Token 모두 지원)
async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: '인증 토큰이 누락되었습니다.' });
  }

  // 1. 서비스 자체 발급 JWT 토큰(네이버 소셜 로그인 등) 검증 시도
  try {
    const decoded = jwt.verify(token);
    if (decoded && decoded.id) {
      req.user = {
        id: decoded.id,
        email: decoded.email,
        userName: decoded.userName,
        provider: decoded.provider || 'local'
      };
      return next();
    }
  } catch (jwtErr) {
    // 자체 JWT 서명이 아니거나 만료된 경우 Supabase Auth 토큰 검증으로 fallback
  }

  // 2. Supabase Auth 발급 토큰 검증 시도
  if (supabase) {
    try {
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (!error && user) {
        req.user = user;
        return next();
      }
    } catch (sbErr) {
      // Supabase 검증 실패
    }
  }

  return res.status(403).json({
    error: '유효하지 않거나 만료된 토큰입니다.'
  });
}

module.exports = { authenticateToken };

