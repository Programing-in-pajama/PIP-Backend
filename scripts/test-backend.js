require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');

const allowedOrigins = [
  'https://main.d3p7uoybais0cu.amplifyapp.com',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000'
];

const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (
      allowedOrigins.includes(origin) ||
      /^https:\/\/[a-z0-9-]+\.amplifyapp\.com$/i.test(origin) ||
      /^http:\/\/localhost(:\d+)?$/i.test(origin) ||
      /^http:\/\/127\.0\.0\.1(:\d+)?$/i.test(origin)
    ) {
      return callback(null, origin);
    }
    return callback(null, origin);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
};

const app = express();
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());

app.use('/api/test', require('../routes/test'));
app.use('/api/auth', require('../routes/auth'));
app.use('/api/user', require('../routes/user'));

async function request(server, path, options = {}) {
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function runTests() {
  const server = http.createServer(app);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  console.log('🧪 Backend test server running on port:', server.address().port);

  let allPassed = true;
  const testEmail = 'soyo-tester@example.com';
  const testUserId = 'test-unit-user-1234';

  try {
    // 1. send-code test
    console.log('\n--- Test 1: POST /api/auth/email/send-code ---');
    const sendRes = await request(server, '/api/auth/email/send-code', {
      method: 'POST',
      body: JSON.stringify({ email: testEmail })
    });
    console.log('Send Code response:', sendRes);
    if (sendRes.status !== 200 || !sendRes.data.success) {
      console.error('❌ Test 1 Failed');
      allPassed = false;
    } else {
      console.log('✅ Test 1 Passed (Random code generated)');
    }

    const debugCode = sendRes.data.debugCode;
    console.log('Generated code for testing:', debugCode);

    // 2. verify-code with wrong code
    console.log('\n--- Test 2: POST /api/auth/email/verify-code (Wrong Code) ---');
    const wrongRes = await request(server, '/api/auth/email/verify-code', {
      method: 'POST',
      body: JSON.stringify({ email: testEmail, code: '000000' })
    });
    console.log('Wrong verify response:', wrongRes);
    if (wrongRes.status === 400 && wrongRes.data.verified === false) {
      console.log('✅ Test 2 Passed (Correctly rejected wrong code)');
    } else {
      console.error('❌ Test 2 Failed');
      allPassed = false;
    }

    // 3. verify-code with correct code
    console.log('\n--- Test 3: POST /api/auth/email/verify-code (Correct Code) ---');
    const correctRes = await request(server, '/api/auth/email/verify-code', {
      method: 'POST',
      body: JSON.stringify({ email: testEmail, code: debugCode })
    });
    console.log('Correct verify response:', correctRes);
    if (correctRes.status === 200 && correctRes.data.verified === true) {
      console.log('✅ Test 3 Passed (Verified successfully)');
    } else {
      console.error('❌ Test 3 Failed');
      allPassed = false;
    }

    // 4. save profile to RDS
    console.log('\n--- Test 4: POST /api/auth/profile (Save to AWS RDS) ---');
    const profilePayload = {
      userId: testUserId,
      name: '홍길동테스터',
      birth: '1975-08-20',
      allergies: ['꽃가루', '먼지'],
      diseases: ['D01', 'D02'],
      medications: ['아스피린 100mg', '혈압약']
    };
    const saveRes = await request(server, '/api/auth/profile', {
      method: 'POST',
      body: JSON.stringify(profilePayload)
    });
    console.log('Save profile response:', saveRes);
    if (saveRes.status === 200 && saveRes.data.savedInDb === true) {
      console.log('✅ Test 4 Passed (Profile saved in AWS RDS DB)');
    } else {
      console.error('❌ Test 4 Failed');
      allPassed = false;
    }

    // 5. get profile from RDS (verify date precision: must be 1975-08-20, not shifted to 1975-08-19)
    console.log('\n--- Test 5: GET /api/auth/profile/:userId (Date Precision & Dual Format) ---');
    const getRes = await request(server, `/api/auth/profile/${encodeURIComponent(testUserId)}`);
    console.log('Get profile response:', getRes);
    if (
      getRes.status === 200 &&
      getRes.data.profile &&
      getRes.data.profile.userName === '홍길동테스터' &&
      getRes.data.profile.birthDate === '1975-08-20' &&
      Array.isArray(getRes.data.profile.allergies) &&
      getRes.data.profile.allergies.length === 2 &&
      Array.isArray(getRes.data.profile.medications) &&
      getRes.data.profile.medications.length === 2 &&
      Boolean(getRes.data.data) // dual compatibility
    ) {
      console.log('✅ Test 5 Passed (Profile retrieved intact from AWS RDS, birthDate exactly 1975-08-20 without timezone shift)');
    } else {
      console.error('❌ Test 5 Failed (BirthDate or profile mismatch):', getRes.data?.profile?.birthDate);
      allPassed = false;
    }

    // 6. user route: GET /api/user/profile?userId=...
    console.log('\n--- Test 6: GET /api/user/profile?userId=... ---');
    const userGetRes = await request(server, `/api/user/profile?userId=${encodeURIComponent(testUserId)}`);
    console.log('User get response:', userGetRes);
    if (
      userGetRes.status === 200 &&
      userGetRes.data.data.userName === '홍길동테스터' &&
      userGetRes.data.data.birthDate === '1975-08-20'
    ) {
      console.log('✅ Test 6 Passed (/api/user/profile works with exact birthDate)');
    } else {
      console.error('❌ Test 6 Failed');
      allPassed = false;
    }

    // 7. user route: PUT /api/user/profile
    console.log('\n--- Test 7: PUT /api/user/profile ---');
    const userPutRes = await request(server, '/api/user/profile', {
      method: 'PUT',
      body: JSON.stringify({
        userId: testUserId,
        userName: '홍길동(수정됨)',
        birthDate: '1975-08-20',
        allergies: ['꽃가루'],
        diseases: ['D01'],
        medications: ['아스피린 100mg']
      })
    });
    console.log('User put response:', userPutRes);
    if (userPutRes.status === 200 && userPutRes.data.data.userName === '홍길동(수정됨)') {
      console.log('✅ Test 7 Passed (/api/user/profile PUT works)');
    } else {
      console.error('❌ Test 7 Failed');
      allPassed = false;
    }

    // 8. Medication clearing test (Verify bug fix: medications can be completely removed)
    console.log('\n--- Test 8: PUT /api/user/profile (Clear All Medications) ---');
    const clearMedRes = await request(server, '/api/user/profile', {
      method: 'PUT',
      body: JSON.stringify({
        userId: testUserId,
        userName: '홍길동(수정됨)',
        birthDate: '1975-08-20',
        allergies: ['꽃가루'],
        diseases: ['D01'],
        medications: [],
        noMedication: true
      })
    });
    const { pool } = require('../lib/db');
    const crypto = require('crypto');
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let validUserId = testUserId;
    if (!uuidRegex.test(validUserId)) {
      const hash = crypto.createHash('md5').update(String(testUserId)).digest('hex');
      validUserId = [
        hash.substring(0, 8),
        hash.substring(8, 12),
        '4' + hash.substring(13, 16),
        'a' + hash.substring(17, 20),
        hash.substring(20, 32)
      ].join('-');
    }
    const medCheck = await pool.query('SELECT count(*) FROM user_medications WHERE user_id = $1', [validUserId]);
    const remainingMeds = parseInt(medCheck.rows[0].count, 10);
    console.log('Remaining user_medications in RDS:', remainingMeds);
    if (clearMedRes.status === 200 && remainingMeds === 0) {
      console.log('✅ Test 8 Passed (Medications successfully cleared from RDS DB)');
    } else {
      console.error('❌ Test 8 Failed (Medications were not deleted from DB, remaining count:', remainingMeds);
      allPassed = false;
    }

    // 9. CORS Preflight verification
    console.log('\n--- Test 9: CORS OPTIONS preflight from Amplify ---');
    const corsRes = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/email/send-code`, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://main.d3p7uoybais0cu.amplifyapp.com',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type'
      }
    });
    const allowOrigin = corsRes.headers.get('access-control-allow-origin');
    const allowCreds = corsRes.headers.get('access-control-allow-credentials');
    console.log('CORS response status:', corsRes.status, 'Allow-Origin:', allowOrigin, 'Allow-Credentials:', allowCreds);
    if (corsRes.status === 204 && allowOrigin === 'https://main.d3p7uoybais0cu.amplifyapp.com' && allowCreds === 'true') {
      console.log('✅ Test 9 Passed (CORS preflight from Amplify domain verified)');
    } else {
      console.error('❌ Test 9 Failed (CORS headers mismatch)');
      allPassed = false;
    }

    // Cleanup test record from RDS
    console.log('\n--- Cleaning up test record from RDS ---');
    await pool.query('DELETE FROM user_profiles WHERE id = $1', [validUserId]);
    console.log('✅ Cleaned up test record from RDS');
    await pool.end();

    if (allPassed) {
      console.log('\n🎉 ALL 9 BACKEND TESTS PASSED SUCCESSFULLY! 🎉');
    } else {
      console.error('\n❌ SOME BACKEND TESTS FAILED');
      process.exit(1);
    }
  } catch (err) {
    console.error('Test execution error:', err);
    process.exit(1);
  } finally {
    server.close();
  }
}

runTests();
