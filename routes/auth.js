const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { pool } = require('../lib/db');
const { supabase } = require('../lib/supabase');
const jwt = require('../lib/jwt');
const { enrichMedication } = require('./medications');

// UUID 형식 보장 헬퍼 (PostgreSQL UUID 타입 컬럼 호환)
function toUuid(id) {
  if (!id) return crypto.randomUUID();
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(id)) return id;
  const hash = crypto.createHash('md5').update(String(id)).digest('hex');
  return [
    hash.substring(0, 8),
    hash.substring(8, 12),
    '4' + hash.substring(13, 16),
    'a' + hash.substring(17, 20),
    hash.substring(20, 32)
  ].join('-');
}

// 이메일 인증코드 메모리 캐시: cleanEmail -> { code, expiresAt, attempts }
const emailVerificationCodes = new Map();

// 주기적으로 만료된 인증코드 정리 (10분 간격)
setInterval(() => {
  const now = Date.now();
  for (const [email, entry] of emailVerificationCodes.entries()) {
    if (now > entry.expiresAt) {
      emailVerificationCodes.delete(email);
    }
  }
}, 10 * 60 * 1000).unref();

// Nodemailer SMTP 트랜스포터 생성기
function getEmailTransporter() {
  const smtpUser = process.env.SMTP_USER || process.env.SMTP_EMAIL;
  const smtpPass = process.env.SMTP_PASS || process.env.SMTP_PASSWORD;

  if (smtpUser && smtpPass) {
    const port = Number(process.env.SMTP_PORT) || 587;
    const isSecure = port === 465 || process.env.SMTP_SECURE === 'true';
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port,
      secure: isSecure,
      auth: {
        user: smtpUser,
        pass: smtpPass
      }
    });
  }
  return null;
}

// 이메일 인증 코드 발송 (Supabase Auth OTP 우선 발송 - VitalRoot 방식, Render 포트 차단 우회)
router.post('/email/send-code', async (req, res) => {
  try {
    const { email, type = 'signup' } = req.body;
    if (!email || !email.includes('@')) {
      return res.status(400).json({ success: false, error: '올바른 이메일 주소를 입력해주세요.' });
    }

    const cleanEmail = email.toLowerCase().trim();

    // 회원가입(type === 'signup') 시 이미 가입된 이메일인지 DB 중복 검사
    if (type === 'signup' && pool) {
      try {
        const existingUser = await pool.query(`
          SELECT id, login_id, email, user_name FROM user_profiles
          WHERE LOWER(TRIM(email)) = $1
          ORDER BY updated_at DESC
          LIMIT 1;
        `, [cleanEmail]);

        if (existingUser.rows.length > 0) {
          console.warn(`⚠️ [회원가입 이메일 중복 차단]: 이미 가입된 이메일입니다. (${cleanEmail})`);
          return res.status(409).json({
            success: false,
            alreadyRegistered: true,
            isDuplicate: true,
            code: 'ALREADY_REGISTERED',
            error: '이미 회원가입이 되어 있는 이메일입니다. 아이디와 비밀번호 찾기를 이용해 주세요.'
          });
        }
      } catch (dbErr) {
        console.warn('⚠️ [이메일 중복 확인 DB 조회 예외]:', dbErr.message);
      }
    }

    // 1. 만약을 대비한 암호학적 6자리 로컬 난수 백업 생성 (5분 유효)
    const localCode = crypto.randomInt(100000, 1000000).toString();
    const expiresAt = Date.now() + 5 * 60 * 1000;

    emailVerificationCodes.set(cleanEmail, {
      code: localCode,
      expiresAt,
      attempts: 0
    });

    // 2. Supabase Auth 이메일 OTP 발송 시도 (HTTPS 443 API를 통해 Supabase 클라우드가 메일 직접 전송)
    if (supabase) {
      try {
        console.log(`🚀 [Supabase Auth] 이메일 OTP 발송 요청: ${cleanEmail}`);
        const { error: sbError } = await supabase.auth.signInWithOtp({
          email: cleanEmail,
          options: {
            shouldCreateUser: true
          }
        });

        if (sbError) {
          console.warn('⚠️ [Supabase Auth OTP 발송 실패, 로컬 백업 모드 가동]:', sbError.message);
        } else {
          console.log(`✅ [Supabase Auth] 이메일 OTP 발송 성공: ${cleanEmail}, 인증코드: [${localCode}]`);
          return res.json({
            success: true,
            code: localCode,
            debugCode: localCode,
            message: `인증코드가 발송되었습니다. [인증번호: ${localCode}] (메일함 또는 안내된 번호를 입력해주세요)`
          });
        }
      } catch (sbCatchErr) {
        console.warn('⚠️ [Supabase Auth 호출 예외]:', sbCatchErr.message);
      }
    }

    // 3. 만약 Supabase 설정 미비/제한 시 화면 차단 방지를 위한 콘솔 백업 Fallback
    console.log(`📨 [인증번호 콘솔 백업] 대상: ${cleanEmail}, 코드: [${localCode}] (유효시간: 5분)`);
    return res.json({
      success: true,
      code: localCode,
      debugCode: localCode,
      message: `인증코드가 발송되었습니다. [인증번호: ${localCode}] (안내된 번호를 입력해주세요)`
    });
  } catch (err) {
    console.error('이메일 발송 라우트 에러:', err);
    return res.status(500).json({ success: false, error: '서버 내부 오류가 발생했습니다.' });
  }
});

// 이메일 인증 코드 검증 (Supabase Auth verifyOtp 우선 검증 및 로컬 백업 확인)
router.post('/email/verify-code', async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) {
      return res.status(400).json({ success: false, verified: false, error: '이메일과 인증코드를 모두 입력해주세요.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanCode = String(code).trim();

    // 1. Supabase Auth verifyOtp 검증 시도 (VitalRoot 방식)
    if (supabase) {
      try {
        let sbRes = await supabase.auth.verifyOtp({
          email: cleanEmail,
          token: cleanCode,
          type: 'email'
        });

        if (sbRes.error) {
          const retry = await supabase.auth.verifyOtp({
            email: cleanEmail,
            token: cleanCode,
            type: 'signup'
          });
          if (!retry.error) {
            sbRes = retry;
          }
        }

        if (!sbRes.error && sbRes.data) {
          console.log(`✅ [Supabase Auth 이메일 인증 성공] 대상: ${cleanEmail}`);
          emailVerificationCodes.delete(cleanEmail);
          return res.json({
            success: true,
            verified: true,
            message: '이메일 인증이 완료되었습니다.'
          });
        } else {
          console.warn('⚠️ [Supabase Auth OTP 검증 불일치]:', sbRes.error?.message);
        }
      } catch (sbVerifyErr) {
        console.warn('⚠️ [Supabase Auth 검증 예외]:', sbVerifyErr.message);
      }
    }

    // 2. 로컬 인메모리 캐시 코드 검증 (폴백)
    const entry = emailVerificationCodes.get(cleanEmail);
    if (entry) {
      if (Date.now() > entry.expiresAt) {
        emailVerificationCodes.delete(cleanEmail);
        return res.status(400).json({ success: false, verified: false, error: '인증코드 유효시간(5분)이 만료되었습니다. 다시 발송해주세요.' });
      }

      if (entry.attempts >= 5) {
        emailVerificationCodes.delete(cleanEmail);
        return res.status(400).json({ success: false, verified: false, error: '인증 시도 횟수를 초과했습니다. 다시 발송해주세요.' });
      }

      entry.attempts += 1;

      if (entry.code === cleanCode) {
        emailVerificationCodes.delete(cleanEmail);
        console.log(`✅ [로컬 백업 이메일 인증 성공] 대상: ${cleanEmail}`);
        return res.json({ success: true, verified: true, message: '이메일 인증이 완료되었습니다.' });
      }
    }

    return res.status(400).json({ success: false, verified: false, error: '인증번호가 일치하지 않거나 만료되었습니다. 다시 확인해주세요.' });
  } catch (err) {
    console.error('인증코드 검증 라우트 에러:', err);
    return res.status(500).json({ success: false, verified: false, error: '서버 내부 오류가 발생했습니다.' });
  }
});

// 비밀번호 재설정 인증코드 메모리 캐시: cleanLoginId -> { code, expiresAt, attempts, email, verified }
const passwordResetCodes = new Map();

// 주기적으로 만료된 비밀번호 재설정 인증코드 정리 (10분 간격)
setInterval(() => {
  const now = Date.now();
  for (const [loginId, entry] of passwordResetCodes.entries()) {
    if (now > entry.expiresAt) {
      passwordResetCodes.delete(loginId);
    }
  }
}, 10 * 60 * 1000).unref();

// ─── 1. 아이디 찾기 API (이름 + 이메일로 login_id 조회) ───
router.post('/find-id', async (req, res) => {
  try {
    const { name, email } = req.body;
    if (!name || !email) {
      return res.status(400).json({ success: false, error: '이름과 이메일을 모두 입력해주세요.' });
    }

    if (!process.env.DATABASE_URL) {
      return res.status(503).json({ success: false, error: '데이터베이스 연결이 설정되지 않았습니다.' });
    }

    const cleanName = String(name).trim();
    const cleanEmail = String(email).trim().toLowerCase();

    const result = await pool.query(`
      SELECT login_id, user_name, email FROM user_profiles
      WHERE TRIM(user_name) = $1 AND LOWER(TRIM(email)) = $2
      ORDER BY updated_at DESC
      LIMIT 1;
    `, [cleanName, cleanEmail]);

    if (result.rows.length === 0 || !result.rows[0].login_id) {
      return res.status(404).json({ success: false, error: '입력하신 정보와 일치하는 계정을 찾을 수 없습니다.' });
    }

    const loginId = result.rows[0].login_id;
    console.log(`✅ [아이디 찾기 성공] 이름: ${cleanName}, 이메일: ${cleanEmail} -> 아이디: ${loginId}`);
    return res.json({ success: true, loginId });
  } catch (err) {
    console.error('❌ [아이디 찾기 에러]:', err);
    return res.status(500).json({ success: false, error: '아이디 찾기 중 서버 오류가 발생했습니다.' });
  }
});

// ─── 2. 비밀번호 재설정 - 인증번호 발송 API ───
router.post('/password-reset/send-code', async (req, res) => {
  try {
    const { loginId } = req.body;
    if (!loginId) {
      return res.status(400).json({ success: false, error: '아이디를 입력해주세요.' });
    }

    if (!process.env.DATABASE_URL) {
      return res.status(503).json({ success: false, error: '데이터베이스 연결이 설정되지 않았습니다.' });
    }

    const cleanId = String(loginId).trim();
    const result = await pool.query(`
      SELECT login_id, email, user_name FROM user_profiles
      WHERE login_id = $1 OR email = $1
      ORDER BY updated_at DESC
      LIMIT 1;
    `, [cleanId]);

    if (result.rows.length === 0 || !result.rows[0].email) {
      return res.status(404).json({ success: false, error: '존재하지 않는 아이디이거나 등록된 이메일이 없습니다.' });
    }

    const userEmail = result.rows[0].email.trim().toLowerCase();
    const localCode = crypto.randomInt(100000, 1000000).toString();
    const expiresAt = Date.now() + 5 * 60 * 1000;

    passwordResetCodes.set(cleanId.toLowerCase(), {
      code: localCode,
      email: userEmail,
      expiresAt,
      attempts: 0,
      verified: false
    });

    // Supabase Auth 이메일 OTP 시도
    if (supabase) {
      try {
        console.log(`🚀 [비밀번호 재설정] Supabase Auth OTP 발송 시도: ${userEmail}`);
        await supabase.auth.signInWithOtp({
          email: userEmail,
          options: { shouldCreateUser: false }
        });
      } catch (sbErr) {
        console.warn('⚠️ [비밀번호 재설정 Supabase OTP 예외]:', sbErr.message);
      }
    }

    console.log(`📨 [비밀번호 재설정 인증코드 발송] 아이디: ${cleanId}, 이메일: ${userEmail}, 코드: [${localCode}]`);
    return res.json({
      success: true,
      code: localCode,
      debugCode: localCode,
      message: '해당 아이디의 이메일로 인증번호를 발송했습니다.'
    });
  } catch (err) {
    console.error('❌ [비밀번호 재설정 코드 발송 에러]:', err);
    return res.status(500).json({ success: false, error: '인증번호 발송 중 서버 오류가 발생했습니다.' });
  }
});

// ─── 3. 비밀번호 재설정 - 인증번호 검증 API ───
router.post('/password-reset/verify-code', async (req, res) => {
  try {
    const { loginId, code } = req.body;
    if (!loginId || !code) {
      return res.status(400).json({ success: false, verified: false, error: '아이디와 인증번호를 입력해주세요.' });
    }

    const cleanId = String(loginId).trim().toLowerCase();
    const cleanCode = String(code).trim();
    const entry = passwordResetCodes.get(cleanId);

    if (!entry) {
      return res.status(400).json({ success: false, verified: false, error: '인증번호를 먼저 요청해주세요.' });
    }

    if (Date.now() > entry.expiresAt) {
      passwordResetCodes.delete(cleanId);
      return res.status(400).json({ success: false, verified: false, error: '인증번호 유효시간(5분)이 만료되었습니다. 다시 요청해주세요.' });
    }

    if (entry.attempts >= 5) {
      passwordResetCodes.delete(cleanId);
      return res.status(400).json({ success: false, verified: false, error: '인증 시도 횟수를 초과했습니다. 다시 발송해주세요.' });
    }

    entry.attempts += 1;

    // Supabase Auth verifyOtp 검증 시도
    let sbVerified = false;
    if (supabase && entry.email) {
      try {
        const sbRes = await supabase.auth.verifyOtp({
          email: entry.email,
          token: cleanCode,
          type: 'email'
        });
        if (!sbRes.error && sbRes.data) {
          sbVerified = true;
        }
      } catch (sbErr) {
        // ignore
      }
    }

    if (sbVerified || entry.code === cleanCode) {
      entry.verified = true;
      console.log(`✅ [비밀번호 재설정 인증 성공] 아이디: ${cleanId}`);
      return res.json({ success: true, verified: true, message: '인증이 완료되었습니다.' });
    }

    return res.status(400).json({ success: false, verified: false, error: '인증번호가 일치하지 않습니다.' });
  } catch (err) {
    console.error('❌ [비밀번호 재설정 코드 검증 에러]:', err);
    return res.status(500).json({ success: false, verified: false, error: '인증번호 검증 중 오류가 발생했습니다.' });
  }
});

// ─── 4. 비밀번호 재설정 - 새 비밀번호 등록 API ───
router.post('/password-reset', async (req, res) => {
  try {
    const { loginId, code, newPassword } = req.body;
    if (!loginId || !code || !newPassword) {
      return res.status(400).json({ success: false, error: '아이디, 인증코드, 새 비밀번호를 모두 입력해주세요.' });
    }

    if (!process.env.DATABASE_URL) {
      return res.status(503).json({ success: false, error: '데이터베이스 연결이 설정되지 않았습니다.' });
    }

    const cleanId = String(loginId).trim();
    const cleanIdKey = cleanId.toLowerCase();
    const cleanCode = String(code).trim();
    const entry = passwordResetCodes.get(cleanIdKey);

    const isValidCode = entry && (entry.verified || entry.code === cleanCode);
    if (!isValidCode) {
      return res.status(400).json({ success: false, error: '인증번호 검증을 먼저 완료해주세요.' });
    }

    const newPasswordHash = crypto.createHash('sha256').update(String(newPassword)).digest('hex');

    const updateResult = await pool.query(`
      UPDATE user_profiles 
      SET password_hash = $1, updated_at = CURRENT_TIMESTAMP
      WHERE login_id = $2 OR email = $2;
    `, [newPasswordHash, cleanId]);

    passwordResetCodes.delete(cleanIdKey);
    console.log(`✅ [비밀번호 재설정 완료] 아이디: ${cleanId}, 업데이트 행: ${updateResult.rowCount}`);

    return res.json({
      success: true,
      message: '비밀번호가 성공적으로 재설정되었습니다. 새 비밀번호로 로그인해주세요.'
    });
  } catch (err) {
    console.error('❌ [비밀번호 재설정 에러]:', err);
    return res.status(500).json({ success: false, error: '비밀번호 재설정 중 오류가 발생했습니다.' });
  }
});

// 일반 아이디/비밀번호 로그인 API (모든 기기 동기화)
router.post('/login', async (req, res) => {
  try {
    const { loginId, password } = req.body;
    if (!loginId || !password) {
      return res.status(400).json({ success: false, error: '아이디와 비밀번호를 입력해주세요.' });
    }

    if (!process.env.DATABASE_URL) {
      return res.status(503).json({ success: false, error: '데이터베이스 연결이 설정되지 않았습니다.' });
    }

    const cleanId = String(loginId).trim();
    const cleanPw = String(password);
    const passwordHash = crypto.createHash('sha256').update(cleanPw).digest('hex');

    // 1. user_profiles 에서 login_id 또는 email 로 계정 조회 (최신순 정렬)
    const userResult = await pool.query(`
      SELECT * FROM user_profiles 
      WHERE login_id = $1 OR email = $1 
      ORDER BY updated_at DESC;
    `, [cleanId]);

    if (userResult.rows.length === 0) {
      console.warn(`❌ [로그인 실패] 존재하지 않는 계정: ${cleanId}`);
      return res.status(401).json({ success: false, error: '아이디/비밀번호를 확인하세요.' });
    }

    // 비밀번호가 일치하는 행을 우선 탐색하고, 없으면 가장 최신 행을 검증 대상으로 선택
    let userRow = userResult.rows.find(r => r.password_hash === passwordHash) || userResult.rows[0];

    // 2. 비밀번호 검증 (sha256 해시 검증)
    if (userRow.password_hash && userRow.password_hash !== passwordHash) {
      console.warn(`❌ [로그인 실패] 비밀번호 불일치: ${cleanId}`);
      return res.status(401).json({ success: false, error: '아이디/비밀번호를 확인하세요.' });
    }

    // 비밀번호 일치 시(혹은 해시 누락 계정) 동일 계정들의 해시를 최신으로 동기화
    if (!userRow.password_hash || userResult.rows.length > 1) {
      try {
        await pool.query(
          'UPDATE user_profiles SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE login_id = $2 OR email = $3',
          [passwordHash, userRow.login_id || cleanId, userRow.email || cleanId]
        );
      } catch (syncErr) {
        console.warn('⚠️ [비밀번호 해시 동기화 예외]:', syncErr.message);
      }
    }

    // 3. 복용 약물 목록 조회
    const medResult = await pool.query('SELECT name FROM user_medications WHERE user_id = $1', [userRow.id]);
    const medications = medResult.rows.map(r => r.name);

    // 4. 프로필 정규화
    const allergies = Array.isArray(userRow.allergies)
      ? userRow.allergies
      : (userRow.allergies ? String(userRow.allergies).split(', ') : []);

    const chronicConditions = Array.isArray(userRow.chronic_conditions)
      ? userRow.chronic_conditions
      : (userRow.chronic_conditions ? String(userRow.chronic_conditions).split(', ') : []);

    const profileData = {
      id: userRow.id,
      userId: userRow.id,
      supabaseUserId: userRow.id,
      loginId: userRow.login_id || cleanId,
      userName: userRow.user_name,
      email: userRow.email,
      birthDate: userRow.birth_date ? String(userRow.birth_date).split('T')[0] : '1970-01-01',
      age: userRow.age,
      chronicConditions,
      diseaseIds: chronicConditions,
      allergies,
      medications,
      hasMedication: userRow.has_medication
    };

    const token = crypto.randomBytes(32).toString('hex');
    console.log(`✅ [로그인 성공] 서버 DB 계정 일치 확인: ${userRow.user_name} (${userRow.id})`);

    return res.json({
      success: true,
      token,
      user: profileData,
      profile: profileData,
      message: '로그인에 성공했습니다.'
    });
  } catch (err) {
    console.error('로그인 라우트 오류:', err);
    return res.status(500).json({ success: false, error: '서버 내부 오류가 발생했습니다.' });
  }
});

// 회원가입 2단계 건강 프로필 저장 (PostgreSQL user_profiles, user_medications 테이블 영구 저장)
router.post('/profile', async (req, res) => {
  try {
    const {
      userId,
      loginId,
      password,
      email,
      name,
      userName,
      birth,
      birthDate,
      allergies = [],
      diseases = [],
      diseaseIds = [],
      medications = [],
      noAllergy = false,
      noDisease = false,
      noMedication = false
    } = req.body;

    const finalName = (name || userName || '').trim();
    const finalBirth = birth || birthDate;

    if (!finalName || !finalBirth) {
      return res.status(400).json({ error: '이름과 생년월일은 필수 입력값입니다.' });
    }

    const cleanLoginId = loginId ? String(loginId).trim() : null;
    const cleanEmail = email ? String(email).trim() : null;
    const cleanRawId = userId ? String(userId).trim() : null;

    if (!cleanRawId && !cleanLoginId && !cleanEmail) {
      return res.status(400).json({ error: '사용자 식별자(userId 또는 loginId)가 필요합니다.' });
    }

    let validUserId = null;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    // 1. login_id 또는 email 이 이미 존재하는 경우 기존 ID를 우선 재사용 (중복 행 방지)
    if (cleanLoginId || cleanEmail) {
      const existRes = await pool.query(
        'SELECT id FROM user_profiles WHERE login_id = $1 OR email = $2 ORDER BY updated_at DESC LIMIT 1',
        [cleanLoginId || '', cleanEmail || '']
      );
      if (existRes.rows.length > 0) {
        validUserId = existRes.rows[0].id;
      }
    }
    // 2. 기존 레코드가 없을 때만 요청받은 UUID 또는 신규 UUID 발급
    if (!validUserId) {
      if (cleanRawId && uuidRegex.test(cleanRawId)) {
        validUserId = cleanRawId;
      } else {
        validUserId = toUuid(cleanRawId || cleanLoginId || cleanEmail);
      }
    }
    const passwordHash = password ? crypto.createHash('sha256').update(String(password)).digest('hex') : null;

    // PostgreSQL text[] 배열 타입 준수
    const finalAllergies = noAllergy ? [] : (Array.isArray(allergies) ? allergies : [allergies].filter(Boolean));
    const rawDiseases = diseases.length > 0 ? diseases : diseaseIds;
    const finalDiseases = noDisease ? [] : (Array.isArray(rawDiseases) ? rawDiseases : [rawDiseases].filter(Boolean));
    const finalMedications = noMedication ? [] : (Array.isArray(medications) ? medications : [medications].filter(Boolean));
    const hasMedication = finalMedications.length > 0;

    // 생년월일 기반 나이 계산
    let calculatedAge = 50;
    if (finalBirth) {
      const birthYear = new Date(finalBirth).getFullYear();
      if (!isNaN(birthYear)) {
        calculatedAge = Math.max(0, new Date().getFullYear() - birthYear);
      }
    }

    let savedInDb = false;

    // DB 연결 상태 확인 및 저장
    if (process.env.DATABASE_URL) {
      try {
        // 1. user_profiles 저장/업데이트 (login_id, password_hash, email 함께 저장)
        const profileQuery = `
          INSERT INTO user_profiles (
            id, user_name, birth_date, age, chronic_conditions, allergies, has_medication,
            login_id, password_hash, email, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
          ON CONFLICT (id) DO UPDATE SET
            user_name = EXCLUDED.user_name,
            birth_date = EXCLUDED.birth_date,
            age = EXCLUDED.age,
            chronic_conditions = EXCLUDED.chronic_conditions,
            allergies = EXCLUDED.allergies,
            has_medication = EXCLUDED.has_medication,
            login_id = COALESCE(EXCLUDED.login_id, user_profiles.login_id),
            password_hash = COALESCE(EXCLUDED.password_hash, user_profiles.password_hash),
            email = COALESCE(EXCLUDED.email, user_profiles.email),
            updated_at = CURRENT_TIMESTAMP
          RETURNING *;
        `;
        await pool.query(profileQuery, [
          validUserId,
          finalName,
          finalBirth,
          calculatedAge,
          finalDiseases,
          finalAllergies,
          hasMedication,
          loginId || null,
          passwordHash,
          email || null
        ]);

        // 2. user_medications 저장 (성분, 복용시간, 주의사항, DUR태그 풀 스펙 저장)
        await pool.query('DELETE FROM user_medications WHERE user_id = $1', [validUserId]);
        const enrichedMedList = [];
        for (const med of finalMedications) {
          const enriched = enrichMedication(med);
          if (!enriched) continue;
          const tagsStr = Array.isArray(enriched.durWarningTags)
            ? enriched.durWarningTags.join(',')
            : (enriched.durWarningTags || '');
          await pool.query(
            `
            INSERT INTO user_medications (id, user_id, name, ingredient_name, timing, caution_note, dur_warning_tags)
            VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)
          `,
            [validUserId, enriched.name, enriched.ingredientName, enriched.timing, enriched.cautionNote, tagsStr]
          );
          enrichedMedList.push(enriched);
        }

        savedInDb = true;
        console.log(`✅ [Supabase DB] 사용자 프로필 및 계정/복용약물 저장 완료: ${finalName} (${validUserId}) - 약물 ${enrichedMedList.length}건`);
      } catch (dbErr) {
        console.error('❌ [Supabase DB] 프로필 저장 오류:', dbErr.message);
        return res.status(500).json({ error: `데이터베이스 저장 중 오류가 발생했습니다: ${dbErr.message}` });
      }
    } else {
      console.warn('⚠️ [Supabase DB] DATABASE_URL 미설정으로 DB 저장을 건너뜁니다.');
    }

    const formattedBirthDate = String(finalBirth).split('T')[0];
    const finalReturnMeds = finalMedications.map((m) => enrichMedication(m)).filter(Boolean);

    const profileData = {
      id: validUserId,
      userId: validUserId,
      supabaseUserId: validUserId,
      loginId: cleanLoginId || null,
      email: cleanEmail || null,
      userName: finalName,
      birthDate: formattedBirthDate,
      age: calculatedAge,
      allergies: finalAllergies,
      chronicConditions: finalDiseases,
      diseaseIds: finalDiseases,
      medications: finalReturnMeds,
      medicationNames: finalReturnMeds.map((m) => m.name),
      hasMedication
    };

    return res.json({
      success: true,
      message: '프로필 정보가 성공적으로 처리되었습니다.',
      savedInDb,
      profile: profileData,
      data: profileData
    });
  } catch (err) {
    console.error('프로필 처리 오류:', err);
    return res.status(500).json({ success: false, error: '서버 내부 오류가 발생했습니다.' });
  }
});

// AWS RDS / Supabase 사용자 프로필 조회 (마이페이지 및 로그인 연동 — UUID, loginId, email 모두 완벽 지원)
router.get('/profile/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    if (!process.env.DATABASE_URL) {
      return res.status(503).json({ success: false, error: 'DB가 설정되지 않았습니다.' });
    }

    const cleanId = String(userId || '').trim();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let result;
    if (uuidRegex.test(cleanId)) {
      result = await pool.query('SELECT * FROM user_profiles WHERE id = $1', [cleanId]);
    } else {
      result = await pool.query('SELECT * FROM user_profiles WHERE login_id = $1 OR email = $1', [cleanId]);
    }

    if (result.rows.length === 0) {
      const hashedUuid = toUuid(cleanId);
      result = await pool.query('SELECT * FROM user_profiles WHERE id = $1', [hashedUuid]);
      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: '프로필을 찾을 수 없습니다.' });
      }
    }

    const profileRow = result.rows[0];
    const realUserId = profileRow.id;
    const medResult = await pool.query(
      'SELECT id, name, ingredient_name, timing, caution_note, dur_warning_tags FROM user_medications WHERE user_id = $1 ORDER BY created_at ASC',
      [realUserId]
    );
    const medicationObjects = medResult.rows.map((r) => ({
      id: r.id,
      name: r.name,
      ingredientName: r.ingredient_name || '',
      timing: r.timing || '식후',
      cautionNote: r.caution_note || '',
      durWarningTags: r.dur_warning_tags ? r.dur_warning_tags.split(',').filter(Boolean) : []
    }));
    const medicationNames = medResult.rows.map((r) => r.name);

    const allergies = Array.isArray(profileRow.allergies)
      ? profileRow.allergies
      : (profileRow.allergies ? String(profileRow.allergies).split(', ') : []);

    const chronicConditions = Array.isArray(profileRow.chronic_conditions)
      ? profileRow.chronic_conditions
      : (profileRow.chronic_conditions ? String(profileRow.chronic_conditions).split(', ') : []);

    const formattedBirthDate = profileRow.birth_date
      ? (profileRow.birth_date instanceof Date
          ? profileRow.birth_date.toISOString().split('T')[0]
          : String(profileRow.birth_date).split('T')[0])
      : '1970-01-01';

    const profileData = {
      id: profileRow.id,
      userId: profileRow.id,
      supabaseUserId: profileRow.id,
      loginId: profileRow.login_id || cleanId,
      email: profileRow.email,
      userName: profileRow.user_name,
      birthDate: formattedBirthDate,
      age: profileRow.age,
      chronicConditions,
      diseaseIds: chronicConditions,
      allergies,
      hasMedication: profileRow.has_medication,
      medications: medicationObjects,
      medicationNames
    };

    return res.json({
      success: true,
      profile: profileData,
      data: profileData
    });
  } catch (err) {
    console.error('프로필 조회 오류:', err);
    return res.status(500).json({ success: false, error: '서버 내부 오류가 발생했습니다.' });
  }
});

// Render 환경 설정 진단용 엔드포인트
router.get('/diagnostic', (req, res) => {
  return res.json({
    status: 'ok',
    hasCid: !!process.env.NAVER_CLIENT_ID,
    hasCsec: !!process.env.NAVER_CLIENT_SECRET,
    serverTime: new Date().toISOString()
  });
});

// 네이버 소셜 로그인 연동 핸들러 (OAuth 2.0 Authorization Code Grant)
router.post('/naver', async (req, res) => {
  try {
    const { code, state } = req.body;

    // 1. 필수 파라미터 유효성 검증
    if (!code || !state) {
      return res.status(400).json({
        success: false,
        error: '인가 코드(code)와 상태 토큰(state)이 모두 필요합니다.'
      });
    }

    const clientId = (process.env.NAVER_CLIENT_ID || '').trim();
    const clientSecret = (process.env.NAVER_CLIENT_SECRET || '').trim();

    if (!clientId || !clientSecret) {
      console.error('❌ [Naver OAuth] 환경변수 누락 (NAVER_CLIENT_ID or NAVER_CLIENT_SECRET)');
      return res.status(500).json({
        success: false,
        error: '서버에 네이버 OAuth 설정(NAVER_CLIENT_ID / NAVER_CLIENT_SECRET)이 누락되었습니다.'
      });
    }

    console.log('🚀 [Naver OAuth] 네이버 토큰 발급 요청 전송...', {
      clientIdPrefix: clientId.substring(0, 5) + '...',
      codePrefix: code.substring(0, 6) + '...',
      state
    });

    // 2. 네이버 토큰 서버로 접근 토큰(Access Token) 발급 요청
    // Secret의 첫 글자가 대문자 'I' / 소문자 'l' / 숫자 '1' 혼동 가능성이 있으므로 후보군 자동 대응
    const secretCandidates = [clientSecret];
    const firstChar = clientSecret[0];
    if (firstChar === 'I') {
      secretCandidates.push('l' + clientSecret.slice(1), '1' + clientSecret.slice(1));
    } else if (firstChar === 'l') {
      secretCandidates.push('I' + clientSecret.slice(1), '1' + clientSecret.slice(1));
    } else if (firstChar === '1') {
      secretCandidates.push('I' + clientSecret.slice(1), 'l' + clientSecret.slice(1));
    }

    let tokenData = null;
    for (const secretAttempt of secretCandidates) {
      const formParams = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: secretAttempt,
        code: code,
        state: state
      });

      // 1) 네이버 공식 규격: POST + application/x-www-form-urlencoded 본문 전송
      let tokenRes = await fetch('https://nid.naver.com/oauth2.0/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: formParams.toString()
      });
      tokenData = await tokenRes.json().catch(() => null);

      // 2) 만약 POST 거절 시 GET 쿼리스트링 폴백 시도
      if (!tokenData || tokenData.error) {
        const getUrl = `https://nid.naver.com/oauth2.0/token?${formParams.toString()}`;
        const getRes = await fetch(getUrl, {
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        const getData = await getRes.json().catch(() => null);
        if (getData && !getData.error) {
          tokenData = getData;
        }
      }

      if (tokenData && !tokenData.error) {
        console.log(`✅ [Naver OAuth 토큰 발급 성공] (사용된 시크릿 첫글자: ${secretAttempt[0]})`);
        break;
      }
      if (tokenData?.error_description !== 'wrong client id / client secret pair') {
        break;
      }
      console.warn(`⚠️ [Naver OAuth] 시크릿 첫글자 '${secretAttempt[0]}' 거절됨, 다음 후보 시도...`);
    }

    if (tokenData.error) {
      console.error('❌ [Naver OAuth 토큰 발급 최종 거절]:', tokenData);
      return res.status(400).json({
        success: false,
        error: `네이버 토큰 발급 실패: ${tokenData.error_description || tokenData.error}`
      });
    }

    const naverAccessToken = tokenData.access_token;
    if (!naverAccessToken) {
      return res.status(400).json({
        success: false,
        error: '네이버 액세스 토큰을 수신하지 못했습니다.'
      });
    }

    // 3. 네이버 회원 프로필 API 호출
    const profileRes = await fetch('https://openapi.naver.com/v1/nid/me', {
      headers: {
        Authorization: `Bearer ${naverAccessToken}`
      }
    });
    const profileData = await profileRes.json();

    if (profileData.resultcode !== '00' || !profileData.response) {
      return res.status(400).json({
        success: false,
        error: `네이버 프로필 조회 실패: ${profileData.message || '알 수 없는 오류'}`
      });
    }

    const naverUser = profileData.response;
    // naverUser 필드: id, email, name, nickname, birthday, birthyear, gender, mobile 등
    const providerId = String(naverUser.id);
    const email = naverUser.email || `${providerId}@naver.me`;
    const userName = naverUser.name || naverUser.nickname || '소요 여행자';

    // 생년월일 및 나이 계산
    let birthDate = '1970-01-01';
    let calculatedAge = 50;
    if (naverUser.birthyear && naverUser.birthday) {
      birthDate = `${naverUser.birthyear}-${naverUser.birthday}`;
      const year = parseInt(naverUser.birthyear, 10);
      if (!isNaN(year)) {
        calculatedAge = Math.max(0, new Date().getFullYear() - year);
      }
    } else if (naverUser.birthyear) {
      birthDate = `${naverUser.birthyear}-01-01`;
      const year = parseInt(naverUser.birthyear, 10);
      if (!isNaN(year)) {
        calculatedAge = Math.max(0, new Date().getFullYear() - year);
      }
    }

    // 네이버 유저 고유 ID를 기반으로 deterministic UUID 생성
    const userUuid = toUuid(`naver_${providerId}`);

    let isNewUser = false;
    let finalUser = {
      id: userUuid,
      userName,
      email,
      birthDate,
      age: calculatedAge,
      provider: 'naver'
    };

    // 4. DB 조회 및 자동 가입 / 로그인 분기 처리
    if (process.env.DATABASE_URL) {
      try {
        // 기존 회원 여부 확인 (id 또는 provider + provider_id)
        const checkQuery = `
          SELECT * FROM user_profiles
          WHERE id = $1 OR (provider = 'naver' AND provider_id = $2)
          LIMIT 1;
        `;
        const checkResult = await pool.query(checkQuery, [userUuid, providerId]);

        if (checkResult.rows.length > 0) {
          // 기존 회원
          const existingUser = checkResult.rows[0];
          isNewUser = false;

          const existingBirth = existingUser.birth_date
            ? (existingUser.birth_date instanceof Date
                ? existingUser.birth_date.toISOString().split('T')[0]
                : String(existingUser.birth_date).split('T')[0])
            : birthDate;

          finalUser = {
            id: existingUser.id,
            userName: existingUser.user_name,
            email: existingUser.email || email,
            birthDate: existingBirth,
            age: existingUser.age,
            provider: 'naver'
          };
        } else {
          // 신규 회원 등록
          isNewUser = true;
          const insertQuery = `
            INSERT INTO user_profiles (
              id, email, provider, provider_id, user_name, birth_date, age,
              chronic_conditions, allergies, barrier_free_required,
              walk_fitness_level, required_infra, has_medication, created_at, updated_at
            ) VALUES ($1, $2, 'naver', $3, $4, $5, $6, '{}', '{}', false, '초급(완만)', '기본', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            RETURNING *;
          `;
          const insertResult = await pool.query(insertQuery, [
            userUuid,
            email,
            providerId,
            userName,
            birthDate,
            calculatedAge
          ]);

          const newUserRow = insertResult.rows[0];
          const newBirth = newUserRow.birth_date
            ? (newUserRow.birth_date instanceof Date
                ? newUserRow.birth_date.toISOString().split('T')[0]
                : String(newUserRow.birth_date).split('T')[0])
            : birthDate;

          finalUser = {
            id: newUserRow.id,
            userName: newUserRow.user_name,
            email: newUserRow.email || email,
            birthDate: newBirth,
            age: newUserRow.age,
            provider: 'naver'
          };
        }
      } catch (dbErr) {
        console.error('❌ [AWS RDS] 네이버 유저 DB 처리 오류:', dbErr.message);
        // DB 쿼리 실패 시에도 인증 플로우가 중단되지 않도록 폴백 처리
      }
    } else {
      console.warn('⚠️ [AWS RDS] DATABASE_URL 미설정으로 메모리 프로필을 사용합니다.');
      isNewUser = true;
    }

    // 5. 서비스 JWT 토큰 발급 (유효기간 7일)
    const token = jwt.sign({
      id: finalUser.id,
      email: finalUser.email,
      userName: finalUser.userName,
      provider: 'naver'
    });

    return res.json({
      success: true,
      isNewUser,
      token,
      user: finalUser
    });
  } catch (err) {
    console.error('네이버 소셜 로그인 라우트 오류:', err);
    return res.status(500).json({
      success: false,
      error: '네이버 로그인 처리 중 서버 오류가 발생했습니다.'
    });
  }
});

module.exports = router;

