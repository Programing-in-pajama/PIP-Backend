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

// 이메일 및 본인확인 감사 로그 인메모리 링버퍼 (최근 100건 보관)
const MAX_EMAIL_LOGS = 100;
const emailActionLogs = [];

function recordEmailLog({ action, email = '', loginId = '', status = 'INFO', provider = 'SYSTEM', code = '', error = null, details = '' }) {
  const now = new Date();
  const kstTimeStr = new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'short',
    timeStyle: 'medium',
    timeZone: 'Asia/Seoul'
  }).format(now);

  const logEntry = {
    id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    timestamp: now.toISOString(),
    timeStr: kstTimeStr,
    action,
    email: String(email || '').trim(),
    loginId: String(loginId || '').trim(),
    status, // 'SUCCESS' | 'FAIL' | 'INFO' | 'WARNING'
    provider, // 'Nodemailer(SMTP)' | 'Supabase Auth' | '로컬 인증코드(Fallback)' | 'AWS RDS'
    code: code ? String(code) : null,
    error: error ? (error.message || String(error)) : null,
    details
  };

  emailActionLogs.unshift(logEntry);
  if (emailActionLogs.length > MAX_EMAIL_LOGS) {
    emailActionLogs.pop();
  }

  const logSymbol = status === 'SUCCESS' ? '✅' : status === 'FAIL' ? '❌' : 'ℹ️';
  console.log(`${logSymbol} [인증/이메일 로그] [${status}] ${action} | 대상: ${email || loginId || 'N/A'} | 제공자: ${provider} | 코드: [${code || '없음'}] ${error ? `| 오류: ${error.message || error}` : ''}`);
  return logEntry;
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

// Nodemailer SMTP 트랜스포터 생성기 (타임아웃 3000ms 설정으로 클라우드 포트 차단 시 2분 행 방지)
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
      },
      connectionTimeout: 3000,
      greetingTimeout: 3000,
      socketTimeout: 3000
    });
  }
  return null;
}

// ─── 실시간 이메일/인증 진단 로그 조회 API (JSON) ───
router.get('/email/logs', (req, res) => {
  const smtpConfigured = Boolean((process.env.SMTP_USER || process.env.SMTP_EMAIL) && (process.env.SMTP_PASS || process.env.SMTP_PASSWORD));
  const supabaseConfigured = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
  const databaseConfigured = Boolean(process.env.DATABASE_URL);

  return res.json({
    success: true,
    count: emailActionLogs.length,
    systemStatus: {
      smtpConfigured,
      smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
      smtpUser: (process.env.SMTP_USER || process.env.SMTP_EMAIL) ? '설정됨 (마스킹)' : '미설정',
      supabaseConfigured,
      databaseConfigured
    },
    logs: emailActionLogs
  });
});

// 이메일 진단 로그 비우기
router.delete('/email/logs', (req, res) => {
  emailActionLogs.length = 0;
  return res.json({ success: true, message: '이메일 진단 로그가 초기화되었습니다.' });
});

// ─── 실시간 이메일/인증 진단 웹 대시보드 (HTML 뷰) ───
router.get('/email/logs-view', (req, res) => {
  const smtpConfigured = Boolean((process.env.SMTP_USER || process.env.SMTP_EMAIL) && (process.env.SMTP_PASS || process.env.SMTP_PASSWORD));
  const supabaseConfigured = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
  const databaseConfigured = Boolean(process.env.DATABASE_URL);

  const rowsHtml = emailActionLogs.length === 0
    ? `<tr><td colspan="7" style="text-align:center; padding: 32px; color: #6b7280;">최근 기록된 이메일/인증 시도 로그가 없습니다.</td></tr>`
    : emailActionLogs.map((log) => {
        const badgeColor = log.status === 'SUCCESS' ? '#16a34a' : log.status === 'FAIL' ? '#dc2626' : '#d97706';
        const badgeBg = log.status === 'SUCCESS' ? '#dcfce7' : log.status === 'FAIL' ? '#fee2e2' : '#fef3c7';
        return `
          <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 12px 10px; font-size: 13px; color: #4b5563; white-space: nowrap;">${log.timeStr}</td>
            <td style="padding: 12px 10px; font-size: 14px; font-weight: 600; color: #111827;">${log.action}</td>
            <td style="padding: 12px 10px; font-size: 13px; font-family: monospace; color: #1f2937;">${log.email || log.loginId || '-'}</td>
            <td style="padding: 12px 10px; font-size: 13px; color: #374151;">${log.provider}</td>
            <td style="padding: 12px 10px; text-align: center;">
              ${log.code ? `<span style="display:inline-block; font-size: 16px; font-weight: 700; font-family: monospace; letter-spacing: 2px; color: #15803d; background: #f0fdf4; border: 1px solid #bbf7d0; padding: 3px 8px; border-radius: 6px;">${log.code}</span>` : '-'}
            </td>
            <td style="padding: 12px 10px; text-align: center;">
              <span style="display:inline-block; font-size: 12px; font-weight: 600; padding: 3px 8px; border-radius: 12px; color: ${badgeColor}; background: ${badgeBg};">${log.status}</span>
            </td>
            <td style="padding: 12px 10px; font-size: 12px; color: ${log.error ? '#dc2626' : '#4b5563'}; line-height: 1.4;">
              ${log.details}
              ${log.error ? `<br/><strong style="color: #b91c1c;">⚠️ 사유:</strong> ${log.error}` : ''}
            </td>
          </tr>
        `;
      }).join('');

  const html = `
    <!DOCTYPE html>
    <html lang="ko">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>🌿 SOYO 이메일 & 본인인증 실시간 진단 대시보드</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f9fafb; margin: 0; padding: 24px; color: #111827; }
        .container { max-width: 1200px; margin: 0 auto; background: #ffffff; border-radius: 16px; padding: 24px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -2px rgba(0,0,0,0.05); }
        .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #f3f4f6; padding-bottom: 16px; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
        .header h1 { font-size: 20px; font-weight: 700; color: #15803d; margin: 0; display: flex; align-items: center; gap: 8px; }
        .badge-bar { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 20px; }
        .status-pill { font-size: 12px; font-weight: 600; padding: 6px 12px; border-radius: 20px; display: inline-flex; align-items: center; gap: 6px; }
        .pill-on { background: #dcfce7; color: #166534; }
        .pill-off { background: #fee2e2; color: #991b1b; }
        .actions-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 10px; }
        .btn { padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; }
        .btn-refresh { background: #15803d; color: #ffffff; }
        .btn-refresh:hover { background: #166534; }
        .btn-clear { background: #f3f4f6; color: #4b5563; }
        .btn-clear:hover { background: #e5e7eb; }
        .table-wrap { overflow-x: auto; border: 1px solid #e5e7eb; border-radius: 10px; }
        table { width: 100%; border-collapse: collapse; text-align: left; }
        th { background: #f9fafb; padding: 12px 10px; font-size: 12px; font-weight: 600; color: #6b7280; border-bottom: 1px solid #e5e7eb; white-space: nowrap; }
        .help-box { margin-top: 24px; padding: 16px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; font-size: 13px; color: #166534; line-height: 1.6; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🌿 SOYO (소요) 이메일 및 본인인증 실시간 진단 대시보드</h1>
          <div>
            <label style="font-size: 13px; color: #4b5563; cursor: pointer; display: flex; align-items: center; gap: 6px;">
              <input type="checkbox" id="autoRefresh" checked> 5초마다 자동 새로고침
            </label>
          </div>
        </div>

        <div class="badge-bar">
          <span class="status-pill ${smtpConfigured ? 'pill-on' : 'pill-off'}">
            ● SMTP 메일서버: ${smtpConfigured ? '연결됨 (실제 이메일 전송 가능)' : '미설정 (로컬 코드 자동발급 모드)'}
          </span>
          <span class="status-pill ${supabaseConfigured ? 'pill-on' : 'pill-off'}">
            ● Supabase Auth OTP: ${supabaseConfigured ? '활성화' : '비활성'}
          </span>
          <span class="status-pill ${databaseConfigured ? 'pill-on' : 'pill-off'}">
            ● AWS RDS PostgreSQL: ${databaseConfigured ? '연결됨' : '미연결'}
          </span>
        </div>

        <div class="actions-bar">
          <div style="font-size: 13px; color: #6b7280;">최근 시도 내역 (최신 ${emailActionLogs.length}건 / 최대 100건)</div>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-refresh" onclick="location.reload()">🔄 지금 새로고침</button>
            <button class="btn btn-clear" onclick="clearLogs()">🗑️ 로그 비우기</button>
          </div>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>발생 일시 (KST)</th>
                <th>작업 구분</th>
                <th>대상 (이메일/아이디)</th>
                <th>제공자</th>
                <th style="text-align: center;">발급 인증번호</th>
                <th style="text-align: center;">상태</th>
                <th>상세 안내 및 오류 사유</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </div>

        <div class="help-box">
          <strong>💡 실시간 테스트 팁:</strong><br/>
          * SMTP(구글/네이버 등 메일계정)가 미설정된 환경에서도, 위 테이블의 <strong>[발급 인증번호]</strong>를 복사하여 회원가입 및 비밀번호 재설정에 즉시 사용하실 수 있습니다.<br/>
          * 회원이 실제 메일을 받지 못한 경우, 상단 상태바에서 메일서버 설정 여부를 확인하시거나 위 발급번호를 직접 입력하시면 정상 통과됩니다.
        </div>
      </div>

      <script>
        let timer = setInterval(() => {
          if (document.getElementById('autoRefresh').checked) {
            location.reload();
          }
        }, 5000);

        async function clearLogs() {
          if (!confirm('진단 로그를 모두 삭제하시겠습니까?')) return;
          try {
            await fetch('/api/auth/email/logs', { method: 'DELETE' });
            location.reload();
          } catch (e) {
            alert('로그 삭제 실패: ' + e.message);
          }
        }
      </script>
    </body>
    </html>
  `;

  return res.send(html);
});

// 이메일 인증 코드 발송
router.post('/email/send-code', async (req, res) => {
  try {
    const { email, type = 'signup' } = req.body;
    if (!email || !email.includes('@')) {
      recordEmailLog({
        action: '이메일 인증번호 발송 요청',
        email,
        status: 'FAIL',
        provider: '유효성 검사',
        error: '올바른 이메일 형식이 아님',
        details: '잘못된 이메일 주소 형식 입력 차단'
      });
      return res.status(400).json({ success: false, error: '올바른 이메일 주소를 입력해주세요.' });
    }

    const cleanEmail = email.toLowerCase().trim();

    // 회원가입(type === 'signup') 시 이미 가입 완료된 활성 계정인지 DB 중복 검사
    if (type === 'signup' && pool) {
      try {
        const existingUsers = await pool.query(`
          SELECT id, login_id, email, user_name, password_hash, provider, birth_date
          FROM user_profiles
          WHERE LOWER(TRIM(email)) = $1
          ORDER BY updated_at DESC;
        `, [cleanEmail]);

        // 실제 가입이 완료된 계정만 중복 차단:
        // 1) 비밀번호(password_hash)와 로그인 아이디(login_id)가 등록된 일반 계정
        // 2) 실제 온보딩(기본 1970-01-01 더미 생년월일 외)을 완료한 소셜 계정
        const completedUser = existingUsers.rows.find((user) => {
          const hasPassword = Boolean(user.password_hash && String(user.password_hash).trim().length > 0);
          const hasLoginId = Boolean(user.login_id && String(user.login_id).trim().length > 0);
          const bDate = user.birth_date ? String(user.birth_date).split('T')[0] : '';
          const hasRealSocialProfile = (user.provider && user.provider !== 'local') &&
                                       bDate && !bDate.startsWith('1970-01-01') &&
                                       user.user_name && user.user_name !== '소요 여행자';
          return (hasPassword && hasLoginId) || hasRealSocialProfile;
        });

        if (completedUser) {
          console.warn(`⚠️ [회원가입 이메일 중복 차단]: 이미 가입 완료된 계정입니다. (${cleanEmail})`);
          recordEmailLog({
            action: '회원가입 인증번호 발송',
            email: cleanEmail,
            status: 'FAIL',
            provider: 'AWS RDS DB',
            error: '이미 가입 완료된 이메일 (409)',
            details: `아이디: ${completedUser.login_id || '소셜'}로 이미 가입된 계정`
          });
          return res.status(409).json({
            success: false,
            alreadyRegistered: true,
            isDuplicate: true,
            code: 'ALREADY_REGISTERED',
            error: '이미 회원가입이 되어 있는 이메일입니다. 아이디와 비밀번호 찾기를 이용해 주세요.'
          });
        }

        // 미완료/이탈된 임시 레코드(비밀번호 및 유효 로그인 아이디 없음)는
        // 재가입 시 충돌하지 않도록 깔끔하게 정리
        const abandonedRows = existingUsers.rows.filter(u => !u.password_hash || !u.login_id);
        if (abandonedRows.length > 0) {
          console.log(`🧹 [미완료 가입 이탈 정리] ${cleanEmail}의 미완료 임시 레코드 ${abandonedRows.length}건을 정리하여 원활한 재가입을 허용합니다.`);
          await pool.query(`
            DELETE FROM user_profiles
            WHERE LOWER(TRIM(email)) = $1
              AND (password_hash IS NULL OR TRIM(password_hash) = '')
              AND (login_id IS NULL OR TRIM(login_id) = '');
          `, [cleanEmail]);
        }
      } catch (dbErr) {
        console.warn('⚠️ [이메일 중복 확인 DB 조회 예외]:', dbErr.message);
      }
    }

    // 1. 암호학적 6자리 로컬 난수 생성 (5분 유효)
    const localCode = crypto.randomInt(100000, 1000000).toString();
    const expiresAt = Date.now() + 5 * 60 * 1000;

    emailVerificationCodes.set(cleanEmail, {
      code: localCode,
      expiresAt,
      attempts: 0
    });

    let emailSent = false;
    let providerName = '로컬 인증코드(Fallback)';
    let deliveryError = null;

    // 2. Nodemailer SMTP 발송 시도 (설정된 경우)
    const transporter = getEmailTransporter();
    if (transporter) {
      try {
        console.log(`📧 [Nodemailer] 이메일 발송 시도: ${cleanEmail}`);
        const smtpUser = process.env.SMTP_USER || process.env.SMTP_EMAIL;
        const fromSender = (process.env.SMTP_FROM && !process.env.SMTP_FROM.includes('no-reply@soyo.com'))
          ? process.env.SMTP_FROM
          : (smtpUser ? `"SOYO (소요)" <${smtpUser}>` : '"SOYO (소요)" <no-reply@soyo.com>');

        const sendInfo = await transporter.sendMail({
          from: fromSender,
          to: cleanEmail,
          subject: '[SOYO] 이메일 인증번호 안내',
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px; background-color: #ffffff;">
              <h2 style="color: #15803d; margin-top: 0;">🌿 SOYO (소요) 본인 확인 인증</h2>
              <p style="color: #374151; font-size: 15px; line-height: 1.6;">
                안녕하세요! 맞춤형 식이 & 산책 웰니스 플랫폼 <strong>소요(SOYO)</strong>입니다.<br/>
                요청하신 이메일 인증번호는 아래와 같습니다.
              </p>
              <div style="background-color: #f0fdf4; border: 2px solid #86efac; border-radius: 8px; padding: 18px; text-align: center; margin: 24px 0;">
                <span style="font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #166534;">${localCode}</span>
              </div>
              <p style="color: #6b7280; font-size: 13px; margin-bottom: 0;">
                * 본 인증번호는 <strong>5분간</strong> 유효합니다.<br/>
                * 본인이 요청하지 않은 경우 본 메일을 무시하셔도 됩니다.
              </p>
            </div>
          `
        });
        emailSent = true;
        providerName = 'Nodemailer(SMTP)';
        console.log(`✅ [Nodemailer] 이메일 발송 성공: ${cleanEmail} (메시지ID: ${sendInfo?.messageId || 'N/A'})`);
      } catch (smtpErr) {
        deliveryError = smtpErr;
        console.warn(`⚠️ [Nodemailer 발송 실패 (${smtpErr.code || 'ERR'}), Supabase/로컬 모드 가동]:`, smtpErr.message);
      }
    } else {
      console.log(`ℹ️ [Nodemailer] SMTP 미설정, Supabase/로컬 모드로 전환합니다.`);
    }

    // 3. Supabase Auth 이메일 OTP 발송 시도 (Nodemailer 미발송 시)
    if (!emailSent && supabase) {
      try {
        console.log(`🚀 [Supabase Auth] 이메일 OTP 발송 요청: ${cleanEmail}`);
        // 회원가입 시에는 신규 가입 생성을 허용(shouldCreateUser: true)해야 메일이 발송됨
        const { error: sbError } = await supabase.auth.signInWithOtp({
          email: cleanEmail,
          options: {
            shouldCreateUser: type === 'signup'
          }
        });

        if (sbError) {
          deliveryError = sbError;
          console.warn('⚠️ [Supabase Auth OTP 발송 실패/제한]:', sbError.message);
        } else {
          emailSent = true;
          providerName = 'Supabase Auth';
          deliveryError = null;
          console.log(`✅ [Supabase Auth] 이메일 OTP 발송 성공: ${cleanEmail}`);
        }
      } catch (sbCatchErr) {
        deliveryError = sbCatchErr;
        console.warn('⚠️ [Supabase Auth 호출 예외]:', sbCatchErr.message);
      }
    }

    // 로그 기록
    recordEmailLog({
      action: type === 'signup' ? '회원가입 인증번호 발송' : '본인확인 인증번호 발송',
      email: cleanEmail,
      status: emailSent ? 'SUCCESS' : 'INFO',
      provider: providerName,
      code: localCode,
      error: deliveryError,
      details: emailSent
        ? `${providerName}를 통해 사용자 메일함으로 발송 완료`
        : `메일서버 미설정 또는 제한으로 로컬 인증번호 즉시 발급 (코드: ${localCode})`
    });

    console.log(`📨 [인증번호 발송 완료] 대상: ${cleanEmail}, 코드: [${localCode}] (발송 성공 여부: ${emailSent})`);
    return res.json({
      success: true,
      code: localCode,
      debugCode: localCode,
      emailSent,
      message: emailSent
        ? '인증번호가 이메일로 발송되었습니다. 메일함을 확인해주세요.'
        : `인증번호가 발송되었습니다. [인증번호: ${localCode}] (안내된 번호를 입력해주세요)`
    });
  } catch (err) {
    console.error('이메일 발송 라우트 에러:', err);
    recordEmailLog({
      action: '이메일 인증번호 발송 처리',
      email: req.body?.email || '',
      status: 'FAIL',
      provider: '서버 내부',
      error: err,
      details: '서버 내부 오류로 발송 중단'
    });
    return res.status(500).json({ success: false, error: '서버 내부 오류가 발생했습니다.' });
  }
});

// 이메일 인증 코드 검증 (로컬 인메모리 우선 검증 및 Supabase Auth 폴백)
router.post('/email/verify-code', async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) {
      recordEmailLog({
        action: '이메일 인증 확인',
        email,
        status: 'FAIL',
        provider: '유효성 검사',
        error: '이메일 또는 인증번호 미입력',
        details: '필수 입력값 누락'
      });
      return res.status(400).json({ success: false, verified: false, error: '이메일과 인증코드를 모두 입력해주세요.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanCode = String(code).trim();

    // 1. 발급된 인증코드 즉시 검증 (빠른 응답)
    const entry = emailVerificationCodes.get(cleanEmail);
    if (entry) {
      if (Date.now() > entry.expiresAt) {
        emailVerificationCodes.delete(cleanEmail);
        recordEmailLog({
          action: '이메일 인증 확인',
          email: cleanEmail,
          status: 'FAIL',
          provider: '로컬 캐시',
          code: cleanCode,
          error: '인증코드 유효시간(5분) 만료',
          details: '유효시간 만료로 검증 실패'
        });
        return res.status(400).json({ success: false, verified: false, error: '인증코드 유효시간(5분)이 만료되었습니다. 다시 발송해주세요.' });
      }

      if (entry.attempts >= 5) {
        emailVerificationCodes.delete(cleanEmail);
        recordEmailLog({
          action: '이메일 인증 확인',
          email: cleanEmail,
          status: 'FAIL',
          provider: '로컬 캐시',
          code: cleanCode,
          error: '인증 시도 횟수(5회) 초과',
          details: '연속 5회 오입력으로 인증번호 폐기'
        });
        return res.status(400).json({ success: false, verified: false, error: '인증 시도 횟수를 초과했습니다. 다시 발송해주세요.' });
      }

      entry.attempts += 1;

      if (entry.code === cleanCode) {
        emailVerificationCodes.delete(cleanEmail);
        recordEmailLog({
          action: '이메일 인증 확인',
          email: cleanEmail,
          status: 'SUCCESS',
          provider: '로컬 검증',
          code: cleanCode,
          details: '6자리 인증번호 일치 (인증 성공)'
        });
        console.log(`✅ [이메일 인증 성공] 대상: ${cleanEmail}`);
        return res.json({ success: true, verified: true, message: '이메일 인증이 완료되었습니다.' });
      }
    }

    // 2. Supabase Auth verifyOtp 검증 시도 (Supabase 직접 발송 OTP 확인)
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
          recordEmailLog({
            action: '이메일 인증 확인',
            email: cleanEmail,
            status: 'SUCCESS',
            provider: 'Supabase Auth',
            code: cleanCode,
            details: 'Supabase Auth OTP 검증 성공'
          });
          return res.json({
            success: true,
            verified: true,
            message: '이메일 인증이 완료되었습니다.'
          });
        }
      } catch (sbVerifyErr) {
        console.warn('⚠️ [Supabase Auth 검증 예외]:', sbVerifyErr.message);
      }
    }

    recordEmailLog({
      action: '이메일 인증 확인',
      email: cleanEmail,
      status: 'FAIL',
      provider: '검증 처리',
      code: cleanCode,
      error: '인증번호 불일치',
      details: `입력값(${cleanCode}) 불일치 또는 유효한 인증번호 없음`
    });

    return res.status(400).json({ success: false, verified: false, error: '인증번호가 일치하지 않거나 만료되었습니다. 다시 확인해주세요.' });
  } catch (err) {
    console.error('인증코드 검증 라우트 에러:', err);
    recordEmailLog({
      action: '이메일 인증 확인',
      email: req.body?.email || '',
      status: 'FAIL',
      provider: '서버 내부',
      error: err,
      details: '인증코드 검증 중 서버 예외'
    });
    return res.status(500).json({ success: false, verified: false, error: '서버 내부 오류가 발생했습니다.' });
  }
});

// 비밀번호 재설정 인증코드 메모리 캐시: key(cleanLoginId/email) -> { code, expiresAt, attempts, email, loginId, verified }
const passwordResetCodes = new Map();

// 주기적으로 만료된 비밀번호 재설정 인증코드 정리 (10분 간격)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of passwordResetCodes.entries()) {
    if (now > entry.expiresAt) {
      passwordResetCodes.delete(key);
    }
  }
}, 10 * 60 * 1000).unref();

// ─── 1. 아이디 찾기 API (이름 + 이메일로 login_id 조회) ───
router.post('/find-id', async (req, res) => {
  try {
    const { name, email } = req.body;
    if (!name || !email) {
      recordEmailLog({
        action: '아이디 찾기 요청',
        email,
        status: 'FAIL',
        provider: '유효성 검사',
        error: '이름 또는 이메일 미입력',
        details: '필수 파라미터 누락'
      });
      return res.status(400).json({ success: false, error: '이름과 이메일을 모두 입력해주세요.' });
    }

    if (!process.env.DATABASE_URL) {
      return res.status(503).json({ success: false, error: '데이터베이스 연결이 설정되지 않았습니다.' });
    }

    const cleanName = String(name).trim();
    const cleanEmail = String(email).trim().toLowerCase();

    // 대소문자 및 양쪽 공백 무시 안전 조회
    const result = await pool.query(`
      SELECT login_id, user_name, email FROM user_profiles
      WHERE LOWER(TRIM(user_name)) = LOWER(TRIM($1)) AND LOWER(TRIM(email)) = $2
      ORDER BY updated_at DESC
      LIMIT 1;
    `, [cleanName, cleanEmail]);

    if (result.rows.length === 0 || !result.rows[0].login_id) {
      // 혹시 이름에 공백이 포함되어 있거나 미세하게 다른 경우 이메일 단독 매칭으로 보조 확인
      const emailOnlyCheck = await pool.query(`
        SELECT login_id, user_name FROM user_profiles
        WHERE LOWER(TRIM(email)) = $1
        ORDER BY updated_at DESC
        LIMIT 1;
      `, [cleanEmail]);

      recordEmailLog({
        action: '아이디 찾기 요청',
        email: cleanEmail,
        status: 'FAIL',
        provider: 'AWS RDS DB',
        error: '일치 계정 없음',
        details: emailOnlyCheck.rows.length > 0
          ? `이메일은 존재하나 이름 불일치 (입력: '${cleanName}', 등록명: '${emailOnlyCheck.rows[0].user_name || ''}')`
          : `입력하신 이메일(${cleanEmail})로 등록된 프로필이 없음`
      });

      return res.status(404).json({ success: false, error: '입력하신 정보와 일치하는 계정을 찾을 수 없습니다.' });
    }

    const loginId = result.rows[0].login_id;
    recordEmailLog({
      action: '아이디 찾기 요청',
      email: cleanEmail,
      loginId,
      status: 'SUCCESS',
      provider: 'AWS RDS DB',
      details: `아이디 조회 성공: ${loginId}`
    });
    console.log(`✅ [아이디 찾기 성공] 이름: ${cleanName}, 이메일: ${cleanEmail} -> 아이디: ${loginId}`);
    return res.json({ success: true, loginId });
  } catch (err) {
    console.error('❌ [아이디 찾기 에러]:', err);
    recordEmailLog({
      action: '아이디 찾기 요청',
      email: req.body?.email || '',
      status: 'FAIL',
      provider: '서버 내부',
      error: err,
      details: '아이디 찾기 처리 중 DB 예외 발생'
    });
    return res.status(500).json({ success: false, error: '아이디 찾기 중 서버 오류가 발생했습니다.' });
  }
});

// ─── 2. 비밀번호 재설정 - 인증번호 발송 API ───
router.post('/password-reset/send-code', async (req, res) => {
  try {
    const { loginId } = req.body;
    if (!loginId) {
      recordEmailLog({
        action: '비밀번호 재설정 인증번호 발송',
        loginId,
        status: 'FAIL',
        provider: '유효성 검사',
        error: '아이디 미입력',
        details: '아이디 파라미터 누락'
      });
      return res.status(400).json({ success: false, error: '아이디를 입력해주세요.' });
    }

    if (!process.env.DATABASE_URL) {
      return res.status(503).json({ success: false, error: '데이터베이스 연결이 설정되지 않았습니다.' });
    }

    const cleanId = String(loginId).trim();
    const cleanIdLower = cleanId.toLowerCase();

    // 대소문자 무시 및 아이디 또는 이메일로 다중 매칭
    const result = await pool.query(`
      SELECT login_id, email, user_name, password_hash FROM user_profiles
      WHERE LOWER(TRIM(login_id)) = $1 OR LOWER(TRIM(email)) = $1
      ORDER BY updated_at DESC
      LIMIT 1;
    `, [cleanIdLower]);

    if (result.rows.length === 0 || !result.rows[0].email) {
      recordEmailLog({
        action: '비밀번호 재설정 인증번호 발송',
        loginId: cleanId,
        status: 'FAIL',
        provider: 'AWS RDS DB',
        error: '계정 없음 (404)',
        details: `아이디 또는 이메일 '${cleanId}' 에 해당하는 유저를 DB에서 찾을 수 없음`
      });
      return res.status(404).json({ success: false, error: '존재하지 않는 아이디이거나 등록된 이메일이 없습니다.' });
    }

    const matchedUser = result.rows[0];
    const userEmail = matchedUser.email.trim().toLowerCase();
    const actualLoginId = matchedUser.login_id ? matchedUser.login_id.trim() : cleanId;
    const localCode = crypto.randomInt(100000, 1000000).toString();
    const expiresAt = Date.now() + 5 * 60 * 1000;

    const resetEntry = {
      code: localCode,
      email: userEmail,
      loginId: actualLoginId,
      expiresAt,
      attempts: 0,
      verified: false
    };

    // 사용자가 아이디나 이메일 중 어느 것으로 요청/검증해도 인식되도록 양방향 키 등록
    passwordResetCodes.set(cleanIdLower, resetEntry);
    passwordResetCodes.set(userEmail, resetEntry);
    if (actualLoginId) {
      passwordResetCodes.set(actualLoginId.toLowerCase(), resetEntry);
    }

    let emailSent = false;
    let providerName = '로컬 인증코드(Fallback)';
    let deliveryError = null;

    // Nodemailer 발송 시도
    const transporter = getEmailTransporter();
    if (transporter) {
      try {
        console.log(`📧 [Nodemailer] 비밀번호 재설정 메일 발송 시도: ${userEmail}`);
        const smtpUser = process.env.SMTP_USER || process.env.SMTP_EMAIL;
        const fromSender = (process.env.SMTP_FROM && !process.env.SMTP_FROM.includes('no-reply@soyo.com'))
          ? process.env.SMTP_FROM
          : (smtpUser ? `"SOYO (소요)" <${smtpUser}>` : '"SOYO (소요)" <no-reply@soyo.com>');

        const sendInfo = await transporter.sendMail({
          from: fromSender,
          to: userEmail,
          subject: '[SOYO] 비밀번호 재설정 인증번호 안내',
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px; background-color: #ffffff;">
              <h2 style="color: #15803d; margin-top: 0;">🌿 SOYO (소요) 비밀번호 재설정</h2>
              <p style="color: #374151; font-size: 15px; line-height: 1.6;">
                안녕하세요! 요청하신 비밀번호 재설정 인증번호입니다.
              </p>
              <div style="background-color: #f0fdf4; border: 2px solid #86efac; border-radius: 8px; padding: 18px; text-align: center; margin: 24px 0;">
                <span style="font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #166534;">${localCode}</span>
              </div>
              <p style="color: #6b7280; font-size: 13px; margin-bottom: 0;">
                * 본 인증번호는 <strong>5분간</strong> 유효합니다.
              </p>
            </div>
          `
        });
        emailSent = true;
        providerName = 'Nodemailer(SMTP)';
        console.log(`✅ [Nodemailer] 비밀번호 재설정 메일 발송 성공: ${userEmail} (메시지ID: ${sendInfo?.messageId || 'N/A'})`);
      } catch (smtpErr) {
        deliveryError = smtpErr;
        console.warn(`⚠️ [Nodemailer 비밀번호 재설정 메일 발송 실패 (${smtpErr.code || 'ERR'})]:`, smtpErr.message);
      }
    } else {
      console.log(`ℹ️ [Nodemailer] SMTP 미설정, Supabase/로컬 모드로 전환합니다.`);
    }

    // Supabase Auth 이메일 OTP 시도
    if (!emailSent && supabase) {
      try {
        console.log(`🚀 [비밀번호 재설정] Supabase Auth OTP 발송 시도: ${userEmail}`);
        const { error: sbErr } = await supabase.auth.signInWithOtp({
          email: userEmail,
          options: { shouldCreateUser: false }
        });
        if (!sbErr) {
          emailSent = true;
          providerName = 'Supabase Auth';
          deliveryError = null;
        } else {
          deliveryError = sbErr;
          console.warn('⚠️ [비밀번호 재설정 Supabase OTP 실패/제한]:', sbErr.message);
        }
      } catch (sbErr) {
        deliveryError = sbErr;
        console.warn('⚠️ [비밀번호 재설정 Supabase OTP 예외]:', sbErr.message);
      }
    }

    // 로그 기록
    recordEmailLog({
      action: '비밀번호 재설정 인증번호 발송',
      loginId: actualLoginId,
      email: userEmail,
      status: emailSent ? 'SUCCESS' : 'INFO',
      provider: providerName,
      code: localCode,
      error: deliveryError,
      details: emailSent
        ? `${providerName}를 통해 등록된 이메일(${userEmail})로 발송 완료`
        : `메일서버 미설정 또는 제한으로 인증번호 즉시 발급 (코드: ${localCode})`
    });

    console.log(`📨 [비밀번호 재설정 인증코드 발송] 아이디: ${actualLoginId}, 이메일: ${userEmail}, 코드: [${localCode}] (메일 발송 여부: ${emailSent})`);
    return res.json({
      success: true,
      code: localCode,
      debugCode: localCode,
      emailSent,
      message: emailSent
        ? '해당 아이디의 등록된 이메일로 인증번호를 발송했습니다.'
        : `인증번호가 발송되었습니다. [인증번호: ${localCode}] (안내된 번호를 입력해주세요)`
    });
  } catch (err) {
    console.error('❌ [비밀번호 재설정 코드 발송 에러]:', err);
    recordEmailLog({
      action: '비밀번호 재설정 인증번호 발송',
      loginId: req.body?.loginId || '',
      status: 'FAIL',
      provider: '서버 내부',
      error: err,
      details: '서버 오류로 인증코드 발송 중단'
    });
    return res.status(500).json({ success: false, error: '인증번호 발송 중 서버 오류가 발생했습니다.' });
  }
});

// ─── 3. 비밀번호 재설정 - 인증번호 검증 API ───
router.post('/password-reset/verify-code', async (req, res) => {
  try {
    const { loginId, code } = req.body;
    if (!loginId || !code) {
      recordEmailLog({
        action: '비밀번호 재설정 인증 확인',
        loginId,
        status: 'FAIL',
        provider: '유효성 검사',
        error: '아이디 또는 인증번호 미입력',
        details: '필수 파라미터 누락'
      });
      return res.status(400).json({ success: false, verified: false, error: '아이디와 인증번호를 입력해주세요.' });
    }

    const cleanId = String(loginId).trim().toLowerCase();
    const cleanCode = String(code).trim();
    const entry = passwordResetCodes.get(cleanId);

    if (!entry) {
      recordEmailLog({
        action: '비밀번호 재설정 인증 확인',
        loginId: cleanId,
        status: 'FAIL',
        provider: '로컬 캐시',
        code: cleanCode,
        error: '발급 이력 없음',
        details: `아이디/이메일 '${cleanId}'에 대해 발급된 인증번호가 없음`
      });
      return res.status(400).json({ success: false, verified: false, error: '인증번호를 먼저 요청해주세요.' });
    }

    if (Date.now() > entry.expiresAt) {
      passwordResetCodes.delete(cleanId);
      recordEmailLog({
        action: '비밀번호 재설정 인증 확인',
        loginId: cleanId,
        email: entry.email,
        status: 'FAIL',
        provider: '로컬 캐시',
        code: cleanCode,
        error: '인증번호 유효시간(5분) 만료',
        details: '만료로 인증 실패'
      });
      return res.status(400).json({ success: false, verified: false, error: '인증번호 유효시간(5분)이 만료되었습니다. 다시 요청해주세요.' });
    }

    if (entry.attempts >= 5) {
      passwordResetCodes.delete(cleanId);
      recordEmailLog({
        action: '비밀번호 재설정 인증 확인',
        loginId: cleanId,
        email: entry.email,
        status: 'FAIL',
        provider: '로컬 캐시',
        code: cleanCode,
        error: '시도 횟수 초과',
        details: '5회 연속 실패로 폐기'
      });
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
      recordEmailLog({
        action: '비밀번호 재설정 인증 확인',
        loginId: cleanId,
        email: entry.email,
        status: 'SUCCESS',
        provider: sbVerified ? 'Supabase Auth' : '로컬 검증',
        code: cleanCode,
        details: '비밀번호 재설정 인증번호 일치 (인증 성공)'
      });
      console.log(`✅ [비밀번호 재설정 인증 성공] 아이디: ${cleanId}`);
      return res.json({ success: true, verified: true, message: '인증이 완료되었습니다.' });
    }

    recordEmailLog({
      action: '비밀번호 재설정 인증 확인',
      loginId: cleanId,
      email: entry.email,
      status: 'FAIL',
      provider: '검증 처리',
      code: cleanCode,
      error: '인증번호 불일치',
      details: `입력된 코드(${cleanCode}) 불일치`
    });

    return res.status(400).json({ success: false, verified: false, error: '인증번호가 일치하지 않습니다.' });
  } catch (err) {
    console.error('❌ [비밀번호 재설정 코드 검증 에러]:', err);
    recordEmailLog({
      action: '비밀번호 재설정 인증 확인',
      loginId: req.body?.loginId || '',
      status: 'FAIL',
      provider: '서버 내부',
      error: err,
      details: '인증번호 검증 중 서버 예외'
    });
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
      recordEmailLog({
        action: '비밀번호 재설정 확정',
        loginId: cleanId,
        status: 'FAIL',
        provider: '로컬 캐시',
        error: '미인증 상태',
        details: '인증번호 검증 미완료 상태에서 재설정 시도'
      });
      return res.status(400).json({ success: false, error: '인증번호 검증을 먼저 완료해주세요.' });
    }

    const newPasswordHash = crypto.createHash('sha256').update(String(newPassword)).digest('hex');

    // 대소문자 무시하고 login_id 또는 email 업데이트
    const updateResult = await pool.query(`
      UPDATE user_profiles 
      SET password_hash = $1, updated_at = CURRENT_TIMESTAMP
      WHERE LOWER(TRIM(login_id)) = $2 OR LOWER(TRIM(email)) = $2;
    `, [newPasswordHash, cleanIdKey]);

    passwordResetCodes.delete(cleanIdKey);
    if (entry.email) {
      passwordResetCodes.delete(entry.email);
    }
    if (entry.loginId) {
      passwordResetCodes.delete(entry.loginId.toLowerCase());
    }

    recordEmailLog({
      action: '비밀번호 재설정 확정',
      loginId: cleanId,
      email: entry.email,
      status: 'SUCCESS',
      provider: 'AWS RDS DB',
      details: `비밀번호 SHA-256 재설정 완료 (영향받은 레코드: ${updateResult.rowCount}건)`
    });

    console.log(`✅ [비밀번호 재설정 완료] 아이디: ${cleanId}, 업데이트 행: ${updateResult.rowCount}`);

    return res.json({
      success: true,
      message: '비밀번호가 성공적으로 재설정되었습니다. 새 비밀번호로 로그인해주세요.'
    });
  } catch (err) {
    console.error('❌ [비밀번호 재설정 에러]:', err);
    recordEmailLog({
      action: '비밀번호 재설정 확정',
      loginId: req.body?.loginId || '',
      status: 'FAIL',
      provider: '서버 내부',
      error: err,
      details: '새 비밀번호 DB 저장 중 서버 오류'
    });
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

    // 1. user_profiles 에서 login_id 또는 email 로 계정 조회 (최신순 정렬, 대소문자 무관)
    const userResult = await pool.query(`
      SELECT * FROM user_profiles 
      WHERE LOWER(login_id) = LOWER($1) OR LOWER(email) = LOWER($1) 
      ORDER BY updated_at DESC;
    `, [cleanId]);

    if (userResult.rows.length === 0) {
      console.warn(`❌ [로그인 실패] 존재하지 않는 계정: ${cleanId}`);
      return res.status(401).json({ success: false, error: '아이디/비밀번호를 확인하세요.' });
    }

    // 2. 비밀번호 검증 (sha256 해시 검증)
    // 정확히 비밀번호 해시가 일치하는 행을 찾음 (미등록/임시 계정 임의 통과 차단)
    const matchingUser = userResult.rows.find((r) => r.password_hash && r.password_hash === passwordHash);

    if (!matchingUser) {
      console.warn(`❌ [로그인 실패] 아이디/비밀번호 불일치: ${cleanId}`);
      return res.status(401).json({ success: false, error: '아이디/비밀번호를 확인하세요.' });
    }

    const userRow = matchingUser;

    // 비밀번호 일치 확인 계정 최신 상태 유지
    try {
      await pool.query(
        'UPDATE user_profiles SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [userRow.id]
      );
    } catch (syncErr) {
      console.warn('⚠️ [계정 타임스탬프 갱신 예외]:', syncErr.message);
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

    const cleanLoginId = loginId ? String(loginId).trim() : null;
    const cleanEmail = email ? String(email).trim().toLowerCase() : null;
    const cleanRawId = userId ? String(userId).trim() : null;

    if (!cleanRawId && !cleanLoginId && !cleanEmail) {
      return res.status(400).json({ error: '사용자 식별자(userId 또는 loginId 또는 email)가 필요합니다.' });
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let existingUser = null;

    // 1. 기존 유저 정보 조회 (UUID 우선 조회, 없으면 login_id, email 매칭)
    if (process.env.DATABASE_URL) {
      try {
        const isUuid = cleanRawId && uuidRegex.test(cleanRawId);
        let checkRes;
        if (isUuid) {
          checkRes = await pool.query(
            'SELECT * FROM user_profiles WHERE id = $1 LIMIT 1',
            [cleanRawId]
          );
          if (checkRes.rows.length === 0 && (cleanLoginId || cleanEmail)) {
            checkRes = await pool.query(
              `SELECT * FROM user_profiles 
               WHERE ($1 <> '' AND login_id = $1)
                  OR ($2 <> '' AND email = $2)
               ORDER BY updated_at DESC LIMIT 1`,
              [cleanLoginId || '', cleanEmail || '']
            );
          }
        } else {
          const hashedUuid = toUuid(cleanRawId || cleanLoginId || cleanEmail);
          checkRes = await pool.query(
            `SELECT * FROM user_profiles 
             WHERE id = $1
                OR ($2 <> '' AND login_id = $2)
                OR ($3 <> '' AND email = $3)
             ORDER BY updated_at DESC LIMIT 1`,
            [hashedUuid, cleanLoginId || cleanRawId || '', cleanEmail || '']
          );
        }
        if (checkRes.rows.length > 0) {
          existingUser = checkRes.rows[0];
        }
      } catch (findErr) {
        console.warn('⚠️ [DB 기존 유저 확인 경고]:', findErr.message);
      }
    }

    let validUserId = null;
    if (cleanRawId && uuidRegex.test(cleanRawId)) {
      validUserId = cleanRawId;
    } else if (existingUser) {
      validUserId = existingUser.id;
    } else {
      validUserId = toUuid(cleanRawId || cleanLoginId || cleanEmail);
    }

    // 부분 업데이트 여부 판별
    const hasNameField = req.body.name !== undefined || req.body.userName !== undefined;
    const hasBirthField = req.body.birth !== undefined || req.body.birthDate !== undefined;
    const hasAllergiesField = req.body.allergies !== undefined || req.body.noAllergy !== undefined;
    const hasDiseasesField = req.body.diseases !== undefined || req.body.diseaseIds !== undefined || req.body.noDisease !== undefined;
    const hasMedicationsField = req.body.medications !== undefined || req.body.noMedication !== undefined;

    // 이름 및 생년월일
    const finalName = (name || userName || existingUser?.user_name || '소요 여행자').trim();
    const rawBirth = birth || birthDate || existingUser?.birth_date || '1970-01-01';
    const finalBirth = rawBirth instanceof Date
      ? rawBirth.toISOString().split('T')[0]
      : String(rawBirth).split('T')[0];

    let finalAllergies;
    if (hasAllergiesField) {
      finalAllergies = noAllergy ? [] : (Array.isArray(allergies) ? allergies : [allergies].filter(Boolean));
    } else if (existingUser) {
      finalAllergies = Array.isArray(existingUser.allergies)
        ? existingUser.allergies
        : (existingUser.allergies ? String(existingUser.allergies).split(', ') : []);
    } else {
      finalAllergies = [];
    }

    let finalDiseases;
    if (hasDiseasesField) {
      const rawDiseases = (Array.isArray(diseases) && diseases.length > 0) ? diseases : (Array.isArray(diseaseIds) ? diseaseIds : []);
      finalDiseases = noDisease ? [] : rawDiseases.filter(Boolean);
    } else if (existingUser) {
      finalDiseases = Array.isArray(existingUser.chronic_conditions)
        ? existingUser.chronic_conditions
        : (existingUser.chronic_conditions ? String(existingUser.chronic_conditions).split(', ') : []);
    } else {
      finalDiseases = [];
    }

    let finalMedications;
    let hasMedication;
    if (hasMedicationsField) {
      finalMedications = noMedication ? [] : (Array.isArray(medications) ? medications : [medications].filter(Boolean));
      hasMedication = finalMedications.length > 0;
    } else if (existingUser) {
      hasMedication = existingUser.has_medication;
      finalMedications = [];
    } else {
      finalMedications = [];
      hasMedication = false;
    }

    const passwordHash = password ? crypto.createHash('sha256').update(String(password)).digest('hex') : null;

    // 생년월일 기반 나이 계산
    let calculatedAge = existingUser?.age || 50;
    if (finalBirth) {
      const birthYear = new Date(finalBirth).getFullYear();
      if (!isNaN(birthYear)) {
        calculatedAge = Math.max(0, new Date().getFullYear() - birthYear);
      }
    }

    let savedInDb = false;
    let finalReturnMeds = [];

    // DB 연결 상태 확인 및 저장
    if (process.env.DATABASE_URL) {
      try {
        // 1. user_profiles 저장/업데이트 (CASE WHEN을 통해 전달된 필드만 안전하게 갱신)
        const profileQuery = `
          INSERT INTO user_profiles (
            id, user_name, birth_date, age, chronic_conditions, allergies, has_medication,
            login_id, password_hash, email, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
          ON CONFLICT (id) DO UPDATE SET
            user_name = CASE WHEN $11 THEN EXCLUDED.user_name ELSE user_profiles.user_name END,
            birth_date = CASE WHEN $12 THEN EXCLUDED.birth_date ELSE user_profiles.birth_date END,
            age = CASE WHEN $12 THEN EXCLUDED.age ELSE user_profiles.age END,
            chronic_conditions = CASE WHEN $13 THEN EXCLUDED.chronic_conditions ELSE user_profiles.chronic_conditions END,
            allergies = CASE WHEN $14 THEN EXCLUDED.allergies ELSE user_profiles.allergies END,
            has_medication = CASE WHEN $15 THEN EXCLUDED.has_medication ELSE user_profiles.has_medication END,
            login_id = COALESCE(EXCLUDED.login_id, user_profiles.login_id),
            password_hash = COALESCE(EXCLUDED.password_hash, user_profiles.password_hash),
            email = COALESCE(EXCLUDED.email, user_profiles.email),
            updated_at = CURRENT_TIMESTAMP
          RETURNING *;
        `;
        const upsertRes = await pool.query(profileQuery, [
          validUserId,
          finalName,
          finalBirth,
          calculatedAge,
          finalDiseases,
          finalAllergies,
          hasMedication,
          cleanLoginId || existingUser?.login_id || null,
          passwordHash || existingUser?.password_hash || null,
          cleanEmail || existingUser?.email || null,
          hasNameField,
          hasBirthField,
          hasDiseasesField,
          hasAllergiesField,
          hasMedicationsField
        ]);

        const savedRow = upsertRes.rows[0];
        if (savedRow) {
          finalAllergies = Array.isArray(savedRow.allergies) ? savedRow.allergies : finalAllergies;
          finalDiseases = Array.isArray(savedRow.chronic_conditions) ? savedRow.chronic_conditions : finalDiseases;
          hasMedication = savedRow.has_medication;
        }

        // 2. user_medications 저장 (medications 필드가 명시적으로 들어온 경우에만 갱신, 아니면 기존 데이터 유지)
        if (hasMedicationsField) {
          await pool.query('DELETE FROM user_medications WHERE user_id = $1', [validUserId]);
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
            finalReturnMeds.push(enriched);
          }
        } else {
          // 기존 약물 목록 조회
          const medResult = await pool.query(
            'SELECT id, name, ingredient_name, timing, caution_note, dur_warning_tags FROM user_medications WHERE user_id = $1 ORDER BY created_at ASC',
            [validUserId]
          );
          finalReturnMeds = medResult.rows.map((r) => ({
            id: r.id,
            name: r.name,
            ingredientName: r.ingredient_name || '',
            timing: r.timing || '식후',
            cautionNote: r.caution_note || '',
            durWarningTags: r.dur_warning_tags ? r.dur_warning_tags.split(',').filter(Boolean) : []
          }));
        }

        savedInDb = true;
        console.log(`✅ [Supabase DB] 사용자 프로필 저장 완료: ${finalName} (${validUserId}) - 약물 ${finalReturnMeds.length}건, 기저질환 ${finalDiseases.length}건, 알레르기 ${finalAllergies.length}건`);
      } catch (dbErr) {
        console.error('❌ [Supabase DB] 프로필 저장 오류:', dbErr.message);
        return res.status(500).json({ error: `데이터베이스 저장 중 오류가 발생했습니다: ${dbErr.message}` });
      }
    } else {
      console.warn('⚠️ [Supabase DB] DATABASE_URL 미설정으로 DB 저장을 건너뜁니다.');
      finalReturnMeds = finalMedications.map((m) => enrichMedication(m)).filter(Boolean);
    }

    const profileData = {
      id: validUserId,
      userId: validUserId,
      supabaseUserId: validUserId,
      loginId: cleanLoginId || existingUser?.login_id || null,
      email: cleanEmail || existingUser?.email || null,
      userName: finalName,
      birthDate: finalBirth,
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
    const queryEmail = req.query.email ? String(req.query.email).trim().toLowerCase() : null;

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

    // UUID로 찾지 못했으나 쿼리스트링 이메일이 주어진 경우 이메일로 재조회
    if (result.rows.length === 0 && queryEmail) {
      result = await pool.query('SELECT * FROM user_profiles WHERE email = $1 ORDER BY updated_at DESC LIMIT 1', [queryEmail]);
    }

    if (result.rows.length === 0) {
      const hashedUuid = toUuid(cleanId);
      result = await pool.query('SELECT * FROM user_profiles WHERE id = $1', [hashedUuid]);
      if (result.rows.length === 0) {
        // 소셜 사용자 등 UUID로 조회되었으나 DB에 행이 아직 없는 경우:
        // DB에 더미 행을 강제로 INSERT하지 않고 가상 기본 프로필을 안전하게 반환
        console.log(`🌱 [신규 소셜/유저 프로필 감지 (DB 가상 프로필 반환)]: ${cleanId} (${queryEmail || '이메일 없음'})`);
        return res.json({
          success: true,
          isNewUser: true,
          profile: {
            id: cleanId,
            userId: cleanId,
            supabaseUserId: cleanId,
            loginId: cleanId.includes('@') ? cleanId : null,
            userName: '소요 여행자',
            email: queryEmail || (cleanId.includes('@') ? cleanId : null),
            birthDate: '1970-01-01',
            age: 50,
            chronicConditions: [],
            diseaseIds: [],
            allergies: [],
            medications: [],
            medicationNames: [],
            hasMedication: false
          }
        });
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

