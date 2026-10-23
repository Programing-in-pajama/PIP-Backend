const express = require('express');
const router = express.Router();

// 국내 최다 처방 만성질환 의약품 로컬 마스터 데이터 (0.1초 즉시 응답 및 오프라인/공공서버 장애 시 안전 폴백)
// 복합 성분의 경우 프론트엔드의 findDuplicateIngredients(split('+'))에 맞춰 '+'로 표준화
const POPULAR_MEDICATIONS = [
  {
    id: 'med-master-01',
    name: '다이아벡스정 500mg',
    ingredientName: '메트포르민염산염',
    timing: '아침 식후',
    cautionNote: '식후 30분 규칙적 완보 권장 / 식사 거름 방지 및 탈수 유의',
    durWarningTags: ['용량주의', '노인주의'],
    inferredCondition: '당뇨',
    pharmacologicalClass: '혈당강하제 (비구아니드계)'
  },
  {
    id: 'med-master-02',
    name: '코자엑스큐정 5/50mg',
    ingredientName: '로사르탄칼륨+암로디핀베실산염',
    timing: '아침 식후',
    cautionNote: '탈수 주의 / 산책로 공공화장실 3~5분 인프라 자동 확보',
    durWarningTags: ['임부금기', '노인주의'],
    inferredCondition: '고혈압',
    pharmacologicalClass: '혈압강하제 (ARB+CCB 복합제)'
  },
  {
    id: 'med-master-03',
    name: '노바스크정 5mg',
    ingredientName: '암로디핀베실산염',
    timing: '아침 식후',
    cautionNote: '기립성 저혈압 주의 / 급경사 배제 및 평지 완보 권장',
    durWarningTags: ['노인주의'],
    inferredCondition: '고혈압',
    pharmacologicalClass: '칼슘채널차단제 (CCB)'
  },
  {
    id: 'med-master-04',
    name: '아마릴정 2mg',
    ingredientName: '글리메피리드',
    timing: '아침 식전 15분',
    cautionNote: '저혈당 쇼크 대비 포도당 사탕 휴대 / 식후 30분 완보',
    durWarningTags: ['병용금기', '노인주의'],
    inferredCondition: '당뇨',
    pharmacologicalClass: '설포닐우레아계 혈당강하제'
  },
  {
    id: 'med-master-05',
    name: '리피토정 20mg',
    ingredientName: '아토르바스타틴칼슘',
    timing: '저녁 식후',
    cautionNote: '근육통·피로도 주의 / 무리한 고강도 트레킹 지양',
    durWarningTags: ['임부금기'],
    inferredCondition: '이상지질혈증',
    pharmacologicalClass: 'HMG-CoA 환원효소 억제제'
  },
  {
    id: 'med-master-06',
    name: '자누비아정 100mg',
    ingredientName: '시타글립틴인산염',
    timing: '아침 식후',
    cautionNote: '식사 거름 방지 / 식후 혈당 스파이크 억제 산책 권장',
    durWarningTags: ['효능군중복'],
    inferredCondition: '당뇨',
    pharmacologicalClass: 'DPP-4 억제제'
  },
  {
    id: 'med-master-07',
    name: '트라젠타정 5mg',
    ingredientName: '리나글립틴',
    timing: '아침 식후',
    cautionNote: '규칙적인 식사 후 30분 가벼운 둘레길 완보 추천',
    durWarningTags: ['효능군중복'],
    inferredCondition: '당뇨',
    pharmacologicalClass: 'DPP-4 억제제'
  },
  {
    id: 'med-master-08',
    name: '엑스포지정 5/80mg',
    ingredientName: '발사르탄+암로디핀',
    timing: '아침 식후',
    cautionNote: '보행 중 수분 충분히 섭취 / 중간 그늘 쉼터 확보',
    durWarningTags: ['임부금기', '노인주의'],
    inferredCondition: '고혈압',
    pharmacologicalClass: '혈압강하제 복합제'
  },
  {
    id: 'med-master-09',
    name: '세비카정 5/20mg',
    ingredientName: '올메사르탄+암로디핀',
    timing: '아침 식후',
    cautionNote: '땀 배출 후 전해질 균형 유지 / 저염 미네랄 식단',
    durWarningTags: ['임부금기', '노인주의'],
    inferredCondition: '고혈압',
    pharmacologicalClass: '혈압강하제 복합제'
  },
  {
    id: 'med-master-10',
    name: '크레스토정 10mg',
    ingredientName: '로수바스타틴칼슘',
    timing: '저녁 식후',
    cautionNote: '안심식당 저지방·항산화 샐러드 식단 병행 추천',
    durWarningTags: ['임부금기'],
    inferredCondition: '이상지질혈증',
    pharmacologicalClass: '지질저하제'
  },
  {
    id: 'med-master-11',
    name: '딜라트렌정 12.5mg',
    ingredientName: '카르베딜롤',
    timing: '아침 식후',
    cautionNote: '맥박수 급상승 지양 / 완만한 무장애 평지 코스 필수',
    durWarningTags: ['노인주의', '병용금기'],
    inferredCondition: '고혈압',
    pharmacologicalClass: '베타차단제'
  },
  {
    id: 'med-master-12',
    name: '아스피린프로텍트정 100mg',
    ingredientName: '아스피린',
    timing: '아침 식후',
    cautionNote: '출혈 경향 주의 / 타박상 유의 및 평탄한 보행로 권장',
    durWarningTags: ['병용금기', '노인주의'],
    inferredCondition: '고혈압',
    pharmacologicalClass: '항혈소판제'
  },
  {
    id: 'med-master-13',
    name: '포시가정 10mg',
    ingredientName: '다파글리플로진',
    timing: '아침 식후',
    cautionNote: '소변 배출량 증가 / 코스 내 화장실 필수 & 수분 섭취',
    durWarningTags: ['노인주의'],
    inferredCondition: '당뇨',
    pharmacologicalClass: 'SGLT-2 억제제'
  },
  {
    id: 'med-master-14',
    name: '자디앙정 10mg',
    ingredientName: '엠파글리플로진',
    timing: '아침 식후',
    cautionNote: '탈수 및 요로 감염 주의 / 3~5분 화장실 인프라 필수',
    durWarningTags: ['노인주의'],
    inferredCondition: '당뇨',
    pharmacologicalClass: 'SGLT-2 억제제'
  },
  {
    id: 'med-master-15',
    name: '록소닌정',
    ingredientName: '록소프로펜나트륨',
    timing: '식후 즉시',
    cautionNote: '위장 보호 식사 필수 / 관절 무리 없는 데크길 추천',
    durWarningTags: ['특정연령대금기', '용량주의'],
    inferredCondition: '관절/근골격계',
    pharmacologicalClass: '소염진통제 (NSAIDs)'
  }
];

// 성분명 내 구분자(/, , 등)를 '+'로 정규화
function normalizeIngredient(raw) {
  if (!raw) return '식약처 허가 성분';
  return String(raw)
    .replace(/[\/,]/g, '+')
    .replace(/\s*\+\s*/g, '+')
    .trim();
}

// 텍스트 정규화 (공백 제거 및 소문자화)
function normalizeText(text) {
  return String(text || '').replace(/\s+/g, '').toLowerCase();
}

// 공공데이터포털 식약처 묶음의약품 실시간 조회 (DrbBundleInfoService02)
async function searchLiveGovApi(query, maxRows = 5) {
  const apiKey = process.env.DUR_API_KEY || process.env.TOUR_API_KEY;
  if (!apiKey) return [];

  const results = [];
  const clean = query.trim();
  const endpoint = 'https://apis.data.go.kr/1471000/DrbBundleInfoService02/getDrbBundleList02';
  const encodedQuery = encodeURIComponent(clean);
  const encodedKey = encodeURIComponent(apiKey);

  const urlCnsgn = `${endpoint}?serviceKey=${encodedKey}&cnsgnItemName=${encodedQuery}&type=json&numOfRows=${maxRows}`;
  const urlTrust = `${endpoint}?serviceKey=${encodedKey}&trustItemName=${encodedQuery}&type=json&numOfRows=${maxRows}`;

  try {
    const fetchWithTimeout = async (url) => {
      const response = await fetch(url, { signal: AbortSignal.timeout(3500) });
      if (!response.ok) return null;
      return await response.json();
    };

    const [dataCnsgn, dataTrust] = await Promise.allSettled([
      fetchWithTimeout(urlCnsgn),
      fetchWithTimeout(urlTrust)
    ]);

    const processItems = (data) => {
      const rawList = data?.body?.items;
      if (!rawList) return;
      const items = Array.isArray(rawList) ? rawList : [rawList];

      for (const entry of items) {
        const item = entry?.item || entry;
        const itemName = (item?.cnsgnItemName || item?.trustItemName || '').trim();
        const mainIngr = normalizeIngredient(item?.trustMainingr);
        const atcCode = (item?.trustAtcCode || '').trim();

        if (itemName && !results.some((r) => r.name === itemName)) {
          results.push({
            id: `gov-${Buffer.from(itemName).toString('hex').slice(0, 12)}`,
            name: itemName,
            ingredientName: mainIngr,
            timing: '아침 식후',
            cautionNote: `식약처 허가 의약품입니다. 복용 후 산책 시 충분한 수분을 섭취하세요.`,
            durWarningTags: ['노인주의', '효능군중복'],
            inferredCondition: '만성질환',
            pharmacologicalClass: atcCode || '식약처 허가 의약품'
          });
        }
      }
    };

    if (dataCnsgn.status === 'fulfilled' && dataCnsgn.value) processItems(dataCnsgn.value);
    if (dataTrust.status === 'fulfilled' && dataTrust.value) processItems(dataTrust.value);
  } catch (err) {
    console.warn('⚠️ [식약처 공공데이터 호출 지연/실패 - 마스터 데이터로 폴백]:', err.message);
  }

  return results;
}

// 하이브리드 약물 검색 엔진
async function searchHybridMedications(query) {
  const keyword = query.trim();
  if (!keyword) return [];

  const normQuery = normalizeText(keyword);

  // 1) 로컬 마스터 데이터 0.05초 즉시 매칭
  const localMatches = POPULAR_MEDICATIONS.filter((med) => {
    return (
      normalizeText(med.name).includes(normQuery) ||
      normalizeText(med.ingredientName).includes(normQuery) ||
      normalizeText(med.pharmacologicalClass).includes(normQuery)
    );
  }).map((m) => ({ ...m }));

  // 2) 식약처 공공 API 실시간 병합
  try {
    const liveItems = await searchLiveGovApi(keyword, 5);
    for (const live of liveItems) {
      if (!localMatches.some((m) => normalizeText(m.name) === normalizeText(live.name))) {
        localMatches.push(live);
      }
    }
  } catch {
    // 안전 폴백
  }

  return localMatches;
}

// 약물 데이터 보강 헬퍼 (DB 저장/조회 시 성분 및 주의사항 누락 방지)
function enrichMedication(item) {
  if (!item) return null;
  const name = typeof item === 'string' ? item.trim() : (item.name || '').trim();
  if (!name) return null;

  // 마스터 데이터셋에서 매칭 검색
  const normName = normalizeText(name);
  const matched = POPULAR_MEDICATIONS.find((m) => normalizeText(m.name) === normName || normName.includes(normalizeText(m.name)));

  if (typeof item === 'object') {
    return {
      id: item.id || matched?.id || `med-${Buffer.from(name).toString('hex').slice(0, 10)}`,
      name,
      ingredientName: normalizeIngredient(item.ingredientName || matched?.ingredientName || '식약처 허가 성분'),
      timing: item.timing || matched?.timing || '식후',
      cautionNote: item.cautionNote || matched?.cautionNote || '규칙적인 복용과 함께 무리 없는 완만한 산책을 권장합니다.',
      durWarningTags: item.durWarningTags || matched?.durWarningTags || []
    };
  }

  return {
    id: matched?.id || `med-${Buffer.from(name).toString('hex').slice(0, 10)}`,
    name,
    ingredientName: normalizeIngredient(matched?.ingredientName || '식약처 허가 성분'),
    timing: matched?.timing || '식후',
    cautionNote: matched?.cautionNote || '규칙적인 복용과 함께 무리 없는 완만한 산책을 권장합니다.',
    durWarningTags: matched?.durWarningTags || []
  };
}

// GET /api/medications/search?query=...
router.get('/search', async (req, res) => {
  try {
    const query = req.query.query || req.query.q || '';
    if (!query || !query.trim()) {
      return res.json([]);
    }

    const results = await searchHybridMedications(query);
    return res.json(results);
  } catch (err) {
    console.error('❌ [약물 검색 API 오류]:', err);
    return res.status(500).json({ error: '약물 검색 중 오류가 발생했습니다.' });
  }
});

// GET /api/medications/popular
router.get('/popular', (req, res) => {
  return res.json(POPULAR_MEDICATIONS);
});

module.exports = {
  router,
  POPULAR_MEDICATIONS,
  enrichMedication,
  searchHybridMedications
};
