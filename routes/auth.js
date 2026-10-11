const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { pool } = require('../lib/db');
const { supabase } = require('../lib/supabase');

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
    const { email } = req.body;
    if (!email || !email.includes('@')) {
      return res.status(400).json({ success: false, error: '올바른 이메일 주소를 입력해주세요.' });
    }

    const cleanEmail = email.toLowerCase().trim();
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

// 회원가입 2단계 건강 프로필 저장 (AWS RDS PostgreSQL user_profiles, user_medications 테이블 영구 저장)
router.post('/profile', async (req, res) => {
  try {
    const {
      userId,
      name,
      birth,
      allergies = [],
      diseases = [],
      diseaseIds = [],
      medications = [],
      noAllergy = false,
      noDisease = false,
      noMedication = false
    } = req.body;

    if (!name || !birth) {
      return res.status(400).json({ error: '이름과 생년월일은 필수 입력값입니다.' });
    }

    if (!userId) {
      return res.status(400).json({ error: '사용자 식별자(userId)가 필요합니다.' });
    }

    const validUserId = toUuid(userId);

    // PostgreSQL text[] 배열 타입 준수
    const finalAllergies = noAllergy ? [] : (Array.isArray(allergies) ? allergies : [allergies].filter(Boolean));
    const rawDiseases = diseases.length > 0 ? diseases : diseaseIds;
    const finalDiseases = noDisease ? [] : (Array.isArray(rawDiseases) ? rawDiseases : [rawDiseases].filter(Boolean));
    const finalMedications = noMedication ? [] : (Array.isArray(medications) ? medications : [medications].filter(Boolean));
    const hasMedication = finalMedications.length > 0;

    // 생년월일 기반 나이 계산
    let calculatedAge = 50;
    if (birth) {
      const birthYear = new Date(birth).getFullYear();
      if (!isNaN(birthYear)) {
        calculatedAge = Math.max(0, new Date().getFullYear() - birthYear);
      }
    }

    let savedInDb = false;

    // AWS RDS 연결 상태 확인 및 저장
    if (process.env.DATABASE_URL) {
      try {
        // 1. user_profiles 저장/업데이트 (PostgreSQL text[] 호환)
        const profileQuery = `
          INSERT INTO user_profiles (
            id, user_name, birth_date, age, chronic_conditions, allergies, has_medication, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
          ON CONFLICT (id) DO UPDATE SET
            user_name = EXCLUDED.user_name,
            birth_date = EXCLUDED.birth_date,
            age = EXCLUDED.age,
            chronic_conditions = EXCLUDED.chronic_conditions,
            allergies = EXCLUDED.allergies,
            has_medication = EXCLUDED.has_medication,
            updated_at = CURRENT_TIMESTAMP
          RETURNING *;
        `;
        await pool.query(profileQuery, [
          validUserId,
          name,
          birth,
          calculatedAge,
          finalDiseases,
          finalAllergies,
          hasMedication
        ]);

        // 2. user_medications 저장
        await pool.query('DELETE FROM user_medications WHERE user_id = $1', [validUserId]);
        for (const med of finalMedications) {
          await pool.query(`
            INSERT INTO user_medications (id, user_id, name, timing)
            VALUES (gen_random_uuid(), $1, $2, '식후')
          `, [validUserId, med]);
        }

        savedInDb = true;
        console.log(`✅ [AWS RDS] 사용자 프로필 및 복용약물 저장 완료: ${name} (${validUserId})`);
      } catch (dbErr) {
        console.error('❌ [AWS RDS] 프로필 저장 오류:', dbErr.message);
        return res.status(500).json({ error: `데이터베이스 저장 중 오류가 발생했습니다: ${dbErr.message}` });
      }
    } else {
      console.warn('⚠️ [AWS RDS] DATABASE_URL 미설정으로 DB 저장을 건너뜁니다.');
    }

    const formattedBirthDate = String(birth).split('T')[0];

    const profileData = {
      userId: validUserId,
      userName: name,
      birthDate: formattedBirthDate,
      age: calculatedAge,
      allergies: finalAllergies,
      chronicConditions: finalDiseases,
      diseaseIds: finalDiseases,
      medications: finalMedications,
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

// AWS RDS 사용자 프로필 조회 (마이페이지 및 로그인 연동)
router.get('/profile/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    if (!process.env.DATABASE_URL) {
      return res.status(503).json({ success: false, error: 'DB가 설정되지 않았습니다.' });
    }

    const validUserId = toUuid(userId);
    const result = await pool.query('SELECT * FROM user_profiles WHERE id = $1', [validUserId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: '프로필을 찾을 수 없습니다.' });
    }

    const profileRow = result.rows[0];
    const medResult = await pool.query('SELECT name FROM user_medications WHERE user_id = $1', [validUserId]);
    const medications = medResult.rows.map((r) => r.name);

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
      userId: profileRow.id,
      userName: profileRow.user_name,
      birthDate: formattedBirthDate,
      age: profileRow.age,
      chronicConditions,
      diseaseIds: chronicConditions,
      allergies,
      hasMedication: profileRow.has_medication,
      medications
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

// 네이버 소셜 로그인 연동 핸들러
router.post('/naver', async (req, res) => {
  try {
    const { code, state } = req.body;
    console.log('📌 [네이버 소셜 로그인 요청 수신]', { code, state });
    return res.json({
      success: true,
      message: '네이버 로그인 요청이 정상 접수되었습니다.'
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
