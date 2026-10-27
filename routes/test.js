const express = require('express');
const { supabase } = require('../lib/supabase');

const router = express.Router();

// GET /api/test — 프론트엔드 연결 테스트용 헬스체크
router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'SOYO 백엔드 연결 성공',
    timestamp: new Date().toISOString(),
    services: {
      database: Boolean(process.env.DATABASE_URL),
      supabase: Boolean(supabase)
    }
  });
});

module.exports = router;
