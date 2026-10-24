const { Pool, types } = require('pg');

// DATE 타입(OID 1082)을 로컬 타임존 변환 없이 원본 'YYYY-MM-DD' 문자열로 파싱
// (KST UTC+9 등에서 toJSON() 시 전날 15:00:00Z로 변환되어 하루 밀리는 현상 방지)
types.setTypeParser(1082, (val) => val);

// AWS RDS PostgreSQL 풀
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// AWS RDS 유휴 클라이언트 연결 끊김 예외 처리 (서버 프로세스 비정상 종료 및 502 방지)
pool.on('error', (err) => {
  console.error('⚠️ [AWS RDS] 유휴 클라이언트 연결 예외 (자동 복구):', err.message);
});

// RDS에 테이블 자동 생성 (posts, user_profiles, user_medications 등)
async function initDB() {
  if (!process.env.DATABASE_URL) {
    console.warn('⚠️  DATABASE_URL 미설정: DB 초기화를 건너뜁니다.');
    return;
  }
  const query = `
    CREATE TABLE IF NOT EXISTS posts (
      id SERIAL PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL,
      user_email VARCHAR(255) NOT NULL,
      title VARCHAR(255) NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_profiles (
      id UUID PRIMARY KEY,
      email VARCHAR(255),
      provider VARCHAR(50) DEFAULT 'local',
      provider_id VARCHAR(255),
      user_name VARCHAR(100) NOT NULL DEFAULT '소요 여행자',
      birth_date DATE NOT NULL DEFAULT '1970-01-01',
      age INTEGER NOT NULL DEFAULT 50,
      chronic_conditions TEXT[] NOT NULL DEFAULT '{}',
      allergies TEXT[] NOT NULL DEFAULT '{}',
      barrier_free_required BOOLEAN NOT NULL DEFAULT false,
      walk_fitness_level VARCHAR(50) NOT NULL DEFAULT '초급(완만)',
      required_infra TEXT NOT NULL DEFAULT '기본',
      has_medication BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- 기존 테이블 마이그레이션 호환 (컬럼 누락 시 자동 추가)
    ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS email VARCHAR(255);
    ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS provider VARCHAR(50) DEFAULT 'local';
    ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS provider_id VARCHAR(255);
    ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS login_id VARCHAR(100);
    ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);


    CREATE TABLE IF NOT EXISTS user_medications (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      ingredient_name VARCHAR(255),
      timing VARCHAR(100),
      caution_note TEXT,
      dur_warning_tags TEXT,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `;
  try {
    await pool.query(query);
    console.log('✅ [AWS RDS] 필수 데이터베이스 테이블 준비 완료 (posts, user_profiles, user_medications)');
  } catch (err) {
    console.error('❌ [AWS RDS] 테이블 생성 오류:', err.message);
  }
}

module.exports = { pool, initDB };
