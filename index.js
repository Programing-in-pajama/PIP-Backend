require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initDB } = require('./lib/db');

const app = express();
const PORT = process.env.PORT || 8080;

// 허용 출처 목록 (Amplify 메인 배포, 서브도메인, 로컬 개발 환경)
const allowedOrigins = [
  'https://main.d3p7uoybais0cu.amplifyapp.com',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000'
];

if (process.env.CORS_ORIGINS) {
  process.env.CORS_ORIGINS.split(',').forEach((o) => {
    const trimmed = o.trim();
    if (trimmed && !allowedOrigins.includes(trimmed)) allowedOrigins.push(trimmed);
  });
}

// CORS 설정 (Amplify, localhost 및 프리플라이트 OPTIONS 일관 처리)
const corsOptions = {
  origin(origin, callback) {
    // curl, 서버 간 호출 등 origin 헤더가 없으면 허용
    if (!origin) return callback(null, true);

    // Amplify 전체 서브도메인 및 localhost, 등록된 출처 허용
    if (
      allowedOrigins.includes(origin) ||
      /^https:\/\/[a-z0-9-]+\.amplifyapp\.com$/i.test(origin) ||
      /^http:\/\/localhost(:\d+)?$/i.test(origin) ||
      /^http:\/\/127\.0\.0\.1(:\d+)?$/i.test(origin)
    ) {
      return callback(null, origin);
    }

    // 그 외 출처도 요청 origin 반영하여 허용
    return callback(null, origin);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());

initDB();

app.get('/health', (req, res) => res.status(200).send('OK'));
app.get('/', (req, res) => res.json({ status: 'online', message: 'SOYO API Server' }));

// API 라우트 등록
app.use('/api/test', require('./routes/test'));
app.use('/api/posts', require('./routes/posts'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/user', require('./routes/user'));
app.use('/api/medications', require('./routes/medications').router);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on port ${PORT}`);
});
