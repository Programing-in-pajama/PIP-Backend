if (typeof global.WebSocket === 'undefined') {
  global.WebSocket = class DummyWebSocket {};
}
const { createClient } = require('@supabase/supabase-js');

// Supabase 클라이언트 (환경 변수가 없으면 null → 인증 API만 비활성화)
const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)
  : null;
if (!supabase) console.warn('⚠️  SUPABASE_URL/SUPABASE_ANON_KEY 미설정: 인증이 필요한 API는 503을 반환합니다.');

module.exports = { supabase };
