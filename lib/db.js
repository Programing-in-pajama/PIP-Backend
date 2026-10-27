const { Pool, types } = require('pg');

// DATE 타입(OID 1082)을 로컬 타임존 변환 없이 원본 'YYYY-MM-DD' 문자열로 파싱
// (KST UTC+9 등에서 toJSON() 시 전날 15:00:00Z로 변환되어 하루 밀리는 현상 방지)
types.setTypeParser(1082, (val) => val);

// Supabase PostgreSQL 풀
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Supabase PostgreSQL 유휴 클라이언트 연결 끊김 예외 처리 (서버 프로세스 비정상 종료 및 502 방지)
pool.on('error', (err) => {
  console.error('⚠️ [Supabase DB] 유휴 클라이언트 연결 예외 (자동 복구):', err.message);
});

// Supabase DB에 테이블 자동 생성 (posts, user_profiles, user_medications 등)
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

    CREATE TABLE IF NOT EXISTS pin_folders (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
      folder_name VARCHAR(100) NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS saved_routes (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
      folder_id UUID REFERENCES pin_folders(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      start_place_name VARCHAR(255),
      start_lat DOUBLE PRECISION,
      start_lng DOUBLE PRECISION,
      dest_place_name VARCHAR(255),
      dest_lat DOUBLE PRECISION,
      dest_lng DOUBLE PRECISION,
      has_restaurant BOOLEAN DEFAULT false,
      duration_minutes INTEGER DEFAULT 25,
      distance_meters INTEGER DEFAULT 800,
      route_geojson TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `;
  try {
    await pool.query(query);
    console.log('✅ [Supabase DB] 필수 테이블 준비 완료 (posts, user_profiles, user_medications, pin_folders, saved_routes)');

    // 기존 테이블의 외래키에 ON DELETE CASCADE 제약조건 동기화 및 고아 데이터 자동 정리
    try {
      await pool.query(`
        -- 고아 데이터(삭제된 유저/폴더에 속한 산책로 잔여물) 자동 정리
        DELETE FROM saved_routes WHERE user_id NOT IN (SELECT id FROM user_profiles);
        DELETE FROM pin_folders WHERE user_id NOT IN (SELECT id FROM user_profiles);
        DELETE FROM saved_routes WHERE folder_id IS NOT NULL AND folder_id NOT IN (SELECT id FROM pin_folders);

        -- pin_folders 외래키 ON DELETE CASCADE 적용
        ALTER TABLE pin_folders DROP CONSTRAINT IF EXISTS pin_folders_user_id_fkey;
        ALTER TABLE pin_folders ADD CONSTRAINT pin_folders_user_id_fkey FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE;

        -- saved_routes 외래키 ON DELETE CASCADE 적용
        ALTER TABLE saved_routes DROP CONSTRAINT IF EXISTS saved_routes_user_id_fkey;
        ALTER TABLE saved_routes ADD CONSTRAINT saved_routes_user_id_fkey FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE;

        ALTER TABLE saved_routes DROP CONSTRAINT IF EXISTS saved_routes_folder_id_fkey;
        ALTER TABLE saved_routes ADD CONSTRAINT saved_routes_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES pin_folders(id) ON DELETE CASCADE;
      `);
      console.log('✅ [Supabase DB] ON DELETE CASCADE 외래키 연쇄삭제 제약조건 동기화 완료');
    } catch (fkErr) {
      console.warn('⚠️ [Supabase DB] 외래키 제약조건 동기화 알림 (이미 적용됨 또는 진행 중):', fkErr.message);
    }
  } catch (err) {
    console.error('❌ [Supabase DB] 테이블 생성 오류:', err.message);
  }
}

module.exports = { pool, initDB };
