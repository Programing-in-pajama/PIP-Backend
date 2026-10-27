const express = require('express');
const { supabase } = require('../lib/supabase');
const { pool } = require('../lib/db');

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

// GET /api/test/db-summary — 데이터베이스 연결 정보 및 현재 저장된 데이터 요약
router.get('/db-summary', async (req, res) => {
  try {
    let host = 'unconfigured';
    let dbName = 'unconfigured';
    if (process.env.DATABASE_URL) {
      try {
        const u = new URL(process.env.DATABASE_URL);
        host = u.hostname;
        dbName = u.pathname.replace(/^\//, '');
      } catch {
        host = 'invalid-url';
      }
    }

    const tablesRes = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);

    const summary = {};
    for (const row of tablesRes.rows) {
      const tName = row.table_name;
      try {
        const countRes = await pool.query(`SELECT COUNT(*) FROM "${tName}"`);
        const rowsRes = await pool.query(`SELECT * FROM "${tName}" LIMIT 50`);
        summary[tName] = {
          count: parseInt(countRes.rows[0].count, 10),
          rows: rowsRes.rows
        };
      } catch (e) {
        summary[tName] = { error: e.message };
      }
    }

    return res.json({
      success: true,
      databaseInfo: {
        host,
        dbName,
        isAwsRds: host.includes('rds.amazonaws.com'),
        isSupabase: host.includes('supabase.co') || host.includes('pooler.supabase.com'),
      },
      tables: summary
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
