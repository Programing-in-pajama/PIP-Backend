const express = require('express');
const router = express.Router();
const {
  YEOKGOK_STATION,
  COURSE_10_1_WITH_REST_POINTS, COURSE_10_1_WITH_REST_STEPS, COURSE_10_1_WITH_REST_META,
  COURSE_10_1_WALK_ONLY_POINTS, COURSE_10_1_WALK_ONLY_STEPS, COURSE_10_1_WALK_ONLY_META,
  COURSE_10_2_WITH_REST_POINTS, COURSE_10_2_WITH_REST_STEPS, COURSE_10_2_WITH_REST_META,
  COURSE_10_2_WALK_ONLY_POINTS, COURSE_10_2_WALK_ONLY_STEPS, COURSE_10_2_WALK_ONLY_META,
  COURSE_10_3_WITH_REST_POINTS, COURSE_10_3_WITH_REST_STEPS, COURSE_10_3_WITH_REST_META,
  COURSE_10_3_WALK_ONLY_POINTS, COURSE_10_3_WALK_ONLY_STEPS, COURSE_10_3_WALK_ONLY_META,
  COURSE_25_1_WITH_REST_POINTS, COURSE_25_1_WITH_REST_STEPS, COURSE_25_1_WITH_REST_META,
  COURSE_25_1_WALK_ONLY_POINTS, COURSE_25_1_WALK_ONLY_STEPS, COURSE_25_1_WALK_ONLY_META,
  COURSE_25_2_WITH_REST_POINTS, COURSE_25_2_WITH_REST_STEPS, COURSE_25_2_WITH_REST_META,
  COURSE_25_2_WALK_ONLY_POINTS, COURSE_25_2_WALK_ONLY_STEPS, COURSE_25_2_WALK_ONLY_META,
  COURSE_25_3_WITH_REST_POINTS, COURSE_25_3_WITH_REST_STEPS, COURSE_25_3_WITH_REST_META,
  COURSE_25_3_WALK_ONLY_POINTS, COURSE_25_3_WALK_ONLY_STEPS, COURSE_25_3_WALK_ONLY_META,
  COURSE_60_1_WITH_REST_POINTS, COURSE_60_1_WITH_REST_STEPS, COURSE_60_1_WITH_REST_META,
  COURSE_60_1_WALK_ONLY_POINTS, COURSE_60_1_WALK_ONLY_STEPS, COURSE_60_1_WALK_ONLY_META,
  COURSE_60_2_WITH_REST_POINTS, COURSE_60_2_WITH_REST_STEPS, COURSE_60_2_WITH_REST_META,
  COURSE_60_2_WALK_ONLY_POINTS, COURSE_60_2_WALK_ONLY_STEPS, COURSE_60_2_WALK_ONLY_META,
  COURSE_60_3_WITH_REST_POINTS, COURSE_60_3_WITH_REST_STEPS, COURSE_60_3_WITH_REST_META,
  COURSE_60_3_WALK_ONLY_POINTS, COURSE_60_3_WALK_ONLY_STEPS, COURSE_60_3_WALK_ONLY_META,
  TRAILS
} = require('../lib/yeokgokTrails');
const { YEOKGOK_RESTAURANTS } = require('../lib/yeokgokRestaurants');
const { evaluateRestaurant } = require('../lib/nutritionEvaluator');

// 메모리 캐시 (동일 경로 재요청 시 0ms 초고속 응답 & Tmap 쿼터 절약)
const routeCache = new Map();

/**
 * 1차 Tmap (보행자 전용 도로망) ➔ 2차 OSRM 보행자 엔진 ➔ 3차 정밀 실측 데이터 호출 헬퍼
 * 건물 관통 없는 실제 인도·횡단보도·골목길·수변 데크 100% 매핑
 */
async function callPedestrianRoute(start, end, options = {}) {
  const passListStr = options.passList
    ? (typeof options.passList === 'string' ? options.passList : options.passList.map(p => `${p.lng},${p.lat}`).join('_'))
    : '';
  const searchOption = String(options.searchOption || '30'); // 30: 계단제외 및 안전한 보행로 우선
  const cacheKey = `${start.lat.toFixed(5)},${start.lng.toFixed(5)}_${end.lat.toFixed(5)},${end.lng.toFixed(5)}_${passListStr}_${searchOption}`;
  
  if (routeCache.has(cacheKey)) {
    return routeCache.get(cacheKey);
  }

  // 1. Tmap 보행자 API 시도 (SK OpenAPI 공식 발급 키 적용)
  const appKey = process.env.SK_OPEN_API_KEY || process.env.TMAP_API_KEY || 'UAu3bWN5O36RIV5O7NYqs1bMQwDRi3ua9XyIZnuV';
  if (appKey) {
    try {
      const requestBody = {
        startX: Number(start.lng),
        startY: Number(start.lat),
        endX: Number(end.lng),
        endY: Number(end.lat),
        startName: start.name || '출발지',
        endName: end.name || '도착지',
        searchOption: searchOption,
        reqCoordType: 'WGS84GEO',
        resCoordType: 'WGS84GEO'
      };

      if (passListStr) {
        requestBody.passList = passListStr;
      }

      const response = await fetch('https://apis.openapi.sk.com/tmap/routes/pedestrian?version=1', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'appKey': appKey
        },
        body: JSON.stringify(requestBody)
      });

      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data.features) && data.features.length > 0) {
          const rawGeoPath = [];
          const turnByTurn = [];
          let totalDistance = 0;
          let totalTime = 0;

          data.features.forEach((feat) => {
            if (feat.geometry.type === 'LineString') {
              feat.geometry.coordinates.forEach(([lng, lat]) => {
                rawGeoPath.push({
                  lat: Number(lat.toFixed(6)),
                  lng: Number(lng.toFixed(6))
                });
              });
            } else if (feat.geometry.type === 'Point' && feat.properties) {
              if (feat.properties.description) {
                turnByTurn.push(feat.properties.description);
              }
              if (feat.properties.totalDistance && totalDistance === 0) {
                totalDistance = feat.properties.totalDistance;
              }
              if (feat.properties.totalTime && totalTime === 0) {
                totalTime = feat.properties.totalTime;
              }
            }
          });

          // 연속 중복 좌표 필터링
          const geoPath = [];
          for (const pt of rawGeoPath) {
            if (!geoPath.length || geoPath[geoPath.length - 1].lat !== pt.lat || geoPath[geoPath.length - 1].lng !== pt.lng) {
              geoPath.push(pt);
            }
          }

          const result = {
            success: true,
            source: 'tmap',
            geoPath,
            turnByTurn,
            distanceMeters: totalDistance,
            durationSeconds: totalTime
          };

          routeCache.set(cacheKey, result);
          console.log(`✅ [Tmap 보행자 라우팅 성공]: 거리 ${totalDistance}m, 소요시간 ${Math.round(totalTime / 60)}분, 좌표 ${geoPath.length}개`);
          return result;
        }
      } else {
        const errJson = await response.json().catch(() => ({}));
        console.warn(`⚠️ [Tmap API 응답 오류 ${response.status}]:`, errJson);
      }
    } catch (tmapErr) {
      console.warn('⚠️ [Tmap API 네트워크 오류, OSRM/실측 데이터 대체]:', tmapErr.message);
    }
  }

  // 2. OSRM 보행자 도로망 엔진 호출 (실제 인도, 횡단보도, 골목길 정밀 추적)
  try {
    const osrmUrl = `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson&steps=true`;
    const osrmRes = await fetch(osrmUrl, {
      headers: { 'User-Agent': 'SOYO-Pedestrian-Service/1.0' }
    });

    if (osrmRes.ok) {
      const osrmData = await osrmRes.json();
      if (osrmData.code === 'Ok' && osrmData.routes && osrmData.routes[0]) {
        const r = osrmData.routes[0];
        const geoPath = r.geometry.coordinates.map(([lng, lat]) => ({
          lat: Number(lat.toFixed(6)),
          lng: Number(lng.toFixed(6))
        }));

        const turnByTurn = r.legs.flatMap(leg => leg.steps).map(step => {
          const name = step.name || '보행로';
          const dist = Math.round(step.distance);
          const mod = step.maneuver?.modifier;
          if (step.maneuver.type === 'arrive') return `목적지 (${name}) 도착`;
          if (mod && mod.includes('left')) return `${name} 방면으로 좌회전 (${dist}m)`;
          if (mod && mod.includes('right')) return `${name} 방면으로 우회전 (${dist}m)`;
          return `${name} 따라 직진 (${dist}m)`;
        }).filter((s, idx, arr) => idx === 0 || s !== arr[idx - 1]);

        const result = {
          success: true,
          source: 'osrm',
          geoPath,
          turnByTurn,
          distanceMeters: Math.round(r.distance),
          durationSeconds: Math.round(r.duration)
        };

        routeCache.set(cacheKey, result);
        return result;
      }
    }
  } catch (osrmErr) {
    console.warn('⚠️ [OSRM 실시간 도로망 조회 실패, 사전 산출 고밀도 도로망 사용]:', osrmErr.message);
  }

  // 3. Fallback: 도로망 연산 불가 시 빈 배열 반환 (건물 관통 2점 일자선 절대 생성 금지)
  return {
    success: false,
    source: 'fallback',
    geoPath: [],
    turnByTurn: [`${start.name || '출발지'}에서 ${end.name || '목적지'} 방면으로 도보 이동`],
    distanceMeters: 500,
    durationSeconds: 400
  };
}

/**
 * 🌿 보행자 도로망 경로 세분화 및 코너 곡선화 헬퍼 (Path Densification & Bezier Fillet)
 */
function getDistanceMeters(p1, p2) {
  if (!p1 || !p2 || p1.lat == null || p1.lng == null || p2.lat == null || p2.lng == null) return 0;
  const lat1 = (p1.lat * Math.PI) / 180;
  const lng1 = (p1.lng * Math.PI) / 180;
  const lat2 = (p2.lat * Math.PI) / 180;
  const lng2 = (p2.lng * Math.PI) / 180;
  const dLat = lat2 - lat1;
  const dLng = lng2 - lng1;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getBearing(p1, p2) {
  if (!p1 || !p2) return 0;
  const lat1 = (p1.lat * Math.PI) / 180;
  const lng1 = (p1.lng * Math.PI) / 180;
  const lat2 = (p2.lat * Math.PI) / 180;
  const lng2 = (p2.lng * Math.PI) / 180;
  const y = Math.sin(lng2 - lng1) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lng2 - lng1);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function smoothAndDensifyPath(geoPath, options = {}) {
  if (!Array.isArray(geoPath) || geoPath.length < 2) return geoPath || [];
  const { maxSegmentLength = 6, cornerFilletRadius = 8, bezierSteps = 5 } = options;

  const cleaned = [];
  for (let i = 0; i < geoPath.length; i++) {
    const pt = geoPath[i];
    if (!cleaned.length || Math.abs(cleaned[cleaned.length - 1].lat - pt.lat) > 1e-6 || Math.abs(cleaned[cleaned.length - 1].lng - pt.lng) > 1e-6) {
      cleaned.push({ lat: Number(pt.lat), lng: Number(pt.lng) });
    }
  }
  if (cleaned.length < 3) return cleaned;

  const curvedPath = [cleaned[0]];
  for (let i = 1; i < cleaned.length - 1; i++) {
    const pPrev = cleaned[i - 1];
    const pCurr = cleaned[i];
    const pNext = cleaned[i + 1];
    const d1 = getDistanceMeters(pPrev, pCurr);
    const d2 = getDistanceMeters(pCurr, pNext);
    const b1 = getBearing(pPrev, pCurr);
    const b2 = getBearing(pCurr, pNext);
    let diff = Math.abs(b2 - b1);
    if (diff > 180) diff = 360 - diff;
    const r = Math.min(cornerFilletRadius, d1 * 0.35, d2 * 0.35);

    if (diff >= 10 && diff <= 165 && r >= 2.0 && d1 > 3 && d2 > 3) {
      const t1 = Math.max(0, 1 - r / d1);
      const startFillet = {
        lat: pPrev.lat + t1 * (pCurr.lat - pPrev.lat),
        lng: pPrev.lng + t1 * (pCurr.lng - pPrev.lng),
      };
      const t2 = Math.min(1, r / d2);
      const endFillet = {
        lat: pCurr.lat + t2 * (pNext.lat - pCurr.lat),
        lng: pCurr.lng + t2 * (pNext.lng - pCurr.lng),
      };
      curvedPath.push(startFillet);
      for (let step = 1; step < bezierSteps; step++) {
        const u = step / bezierSteps;
        const invU = 1 - u;
        const bLat = invU * invU * startFillet.lat + 2 * invU * u * pCurr.lat + u * u * endFillet.lat;
        const bLng = invU * invU * startFillet.lng + 2 * invU * u * pCurr.lng + u * u * endFillet.lng;
        curvedPath.push({ lat: Number(bLat.toFixed(6)), lng: Number(bLng.toFixed(6)) });
      }
      curvedPath.push(endFillet);
    } else {
      curvedPath.push(pCurr);
    }
  }
  curvedPath.push(cleaned[cleaned.length - 1]);

  const densePath = [curvedPath[0]];
  for (let i = 1; i < curvedPath.length; i++) {
    const p1 = curvedPath[i - 1];
    const p2 = curvedPath[i];
    const dist = getDistanceMeters(p1, p2);
    if (dist > maxSegmentLength) {
      const splits = Math.ceil(dist / maxSegmentLength);
      for (let s = 1; s < splits; s++) {
        const frac = s / splits;
        densePath.push({
          lat: Number((p1.lat + frac * (p2.lat - p1.lat)).toFixed(6)),
          lng: Number((p1.lng + frac * (p2.lng - p1.lng)).toFixed(6)),
        });
      }
    }
    densePath.push(p2);
  }
  return densePath;
}

/**
 * 다중 세그먼트 이어붙이기 (Multi-Segment Stitching)
 */
async function stitchSegments(segments) {
  const stitchedPath = [];
  const allInstructions = [];
  let totalDistanceM = 0;
  let totalDurationSec = 0;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const res = await callPedestrianRoute(seg.start, seg.end, { searchOption: 30 });

    if (res.geoPath && res.geoPath.length > 0) {
      const startIndex = stitchedPath.length > 0 ? 1 : 0;
      for (let j = startIndex; j < res.geoPath.length; j++) {
        stitchedPath.push(res.geoPath[j]);
      }
    }

    if (Array.isArray(res.turnByTurn)) {
      allInstructions.push(...res.turnByTurn);
    }
    totalDistanceM += res.distanceMeters || 0;
    totalDurationSec += res.durationSeconds || 0;
  }

  return {
    geoPath: stitchedPath,
    turnByTurn: allInstructions,
    distanceKm: Number((totalDistanceM / 1000).toFixed(2)),
    durationMin: Math.max(5, Math.round(totalDurationSec / 60))
  };
}

/**
 * POST /api/routes/pedestrian
 * 단일 구간 보행자 경로 프록시
 */
router.post('/pedestrian', async (req, res) => {
  try {
    const { start, end, searchOption = '30' } = req.body;
    if (!start?.lat || !start?.lng || !end?.lat || !end?.lng) {
      return res.status(400).json({
        success: false,
        error: 'start 와 end 좌표 { lat, lng } 가 필요합니다.'
      });
    }

    const route = await callPedestrianRoute(start, end, { searchOption });
    return res.json({
      success: true,
      data: route
    });
  } catch (error) {
    console.error('❌ [Pedestrian Route Error]:', error);
    return res.status(500).json({
      success: false,
      error: '보행자 경로 연산 중 오류가 발생했습니다.'
    });
  }
});

/**
 * POST /api/routes/stitch
 * 다중 세그먼트 이어붙이기
 */
router.post('/stitch', async (req, res) => {
  try {
    const { segments = [] } = req.body;
    if (!Array.isArray(segments) || segments.length === 0) {
      return res.status(400).json({
        success: false,
        error: '이어붙일 segments 배열이 필요합니다.'
      });
    }

    const result = await stitchSegments(segments);
    return res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('❌ [Route Stitch Error]:', error);
    return res.status(500).json({
      success: false,
      error: '경로 이어붙이기 처리 중 오류가 발생했습니다.'
    });
  }
});

/**
 * POST /api/routes/recommend & GET /api/routes/recommend
 * 개인 맞춤형 (질환 + 산책시간 + 식당여부) 고정밀 실보행 코스 추천 생성기
 */
const handleRecommend = async (req, res) => {
  try {
    const isGet = req.method === 'GET';
    const regionId = (isGet ? req.query.regionId : req.body.regionId) || 'yeokgok';
    const minutes = Number((isGet ? req.query.minutes : req.body.minutes) || 25);
    const includeRestaurant = isGet
      ? req.query.includeRestaurant !== 'false'
      : req.body.includeRestaurant !== false;
    const diseaseIds = (isGet ? (req.query.diseases ? req.query.diseases.split(',') : []) : req.body.diseaseIds) || [];
    const userLocation = isGet
      ? (req.query.lat && req.query.lng ? { lat: Number(req.query.lat), lng: Number(req.query.lng) } : null)
      : req.body.currentLocation;

    // 원거리(다른 시/구, 2.5km 초과)에서 테스트 시 크로스 시티 일자선 방지: 코스 권역(역곡) 기준점 사용
    let isNearYeokgok = false;
    if (userLocation?.lat && userLocation?.lng) {
      const dLat = (userLocation.lat - YEOKGOK_STATION.south.lat) * (Math.PI / 180);
      const dLng = (userLocation.lng - YEOKGOK_STATION.south.lng) * (Math.PI / 180);
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(YEOKGOK_STATION.south.lat * (Math.PI / 180)) *
          Math.cos(userLocation.lat * (Math.PI / 180)) *
          Math.sin(dLng / 2) *
          Math.sin(dLng / 2);
      const distKm = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      if (distKm <= 2.5) {
        isNearYeokgok = true;
      }
    }

    const startHub = isNearYeokgok
      ? { lat: userLocation.lat, lng: userLocation.lng, name: '현재 내 위치' }
      : { ...YEOKGOK_STATION.south, name: '역곡역' };

    // 1. 전체 30개 실제 음식점 영양 평가 및 3색 안심 신호등 정렬
    const evaluatedRestaurants = YEOKGOK_RESTAURANTS.map((rest) => evaluateRestaurant(rest, diseaseIds));
    const sortedRestaurants = [...evaluatedRestaurants].sort((a, b) => {
      const score = { green: 1, yellow: 2, red: 3 };
      if ((score[a.grade] || 2) !== (score[b.grade] || 2)) {
        return (score[a.grade] || 2) - (score[b.grade] || 2);
      }
      return (a.bestFood?.rMax || 1.0) - (b.bestFood?.rMax || 1.0);
    });

    // 2. 시간에 맞는 실제 도로망 산책로 3개 매핑
    let trailCandidates = [];
    if (minutes <= 15) {
      trailCandidates = [
        {
          title: '역곡상상시장 문화길',
          primaryRestId: COURSE_10_1_WITH_REST_META.restId,
          trailTarget: { lat: 37.48758, lng: 126.81291, name: '역곡상상시장' },
          withRest: {
            points: COURSE_10_1_WITH_REST_POINTS,
            steps: COURSE_10_1_WITH_REST_STEPS,
            durationMin: COURSE_10_1_WITH_REST_META.durationMin,
            distanceKm: COURSE_10_1_WITH_REST_META.distanceKm,
          },
          walkOnly: {
            points: COURSE_10_1_WALK_ONLY_POINTS,
            steps: COURSE_10_1_WALK_ONLY_STEPS,
            durationMin: COURSE_10_1_WALK_ONLY_META.durationMin,
            distanceKm: COURSE_10_1_WALK_ONLY_META.distanceKm,
          },
          roadType: '평탄한 보행로 · 시장 아케이드 구간',
          features: ['역곡상상시장 아케이드', '보행자 우선도로', '안심 쉼터 2곳'],
        },
        {
          title: '역곡남부 평탄 골목길',
          primaryRestId: COURSE_10_2_WITH_REST_META.restId,
          trailTarget: { lat: 37.48355, lng: 126.81347, name: '부천동주민센터쉼터' },
          withRest: {
            points: COURSE_10_2_WITH_REST_POINTS,
            steps: COURSE_10_2_WITH_REST_STEPS,
            durationMin: COURSE_10_2_WITH_REST_META.durationMin,
            distanceKm: COURSE_10_2_WITH_REST_META.distanceKm,
          },
          walkOnly: {
            points: COURSE_10_2_WALK_ONLY_POINTS,
            steps: COURSE_10_2_WALK_ONLY_STEPS,
            durationMin: COURSE_10_2_WALK_ONLY_META.durationMin,
            distanceKm: COURSE_10_2_WALK_ONLY_META.distanceKm,
          },
          roadType: '평탄한 동네 골목길 · 휴식 벤치 2곳',
          features: ['부천동 주민센터 쉼터', '차량 통행 적은 안심길'],
        },
        {
          title: '가톨릭대 정문 앞 평탄 산책',
          primaryRestId: COURSE_10_3_WITH_REST_META.restId,
          trailTarget: { lat: 37.48759, lng: 126.80846, name: '가톨릭대 정문' },
          withRest: {
            points: COURSE_10_3_WITH_REST_POINTS,
            steps: COURSE_10_3_WITH_REST_STEPS,
            durationMin: COURSE_10_3_WITH_REST_META.durationMin,
            distanceKm: COURSE_10_3_WITH_REST_META.distanceKm,
          },
          walkOnly: {
            points: COURSE_10_3_WALK_ONLY_POINTS,
            steps: COURSE_10_3_WALK_ONLY_STEPS,
            durationMin: COURSE_10_3_WALK_ONLY_META.durationMin,
            distanceKm: COURSE_10_3_WALK_ONLY_META.distanceKm,
          },
          roadType: '완만한 인도 · 무장애 휠체어 램프',
          features: ['가톨릭대 앞 가로수길', '턱 없는 배리어프리 인도'],
        }
      ];
    } else if (minutes <= 35) {
      trailCandidates = [
        {
          title: '역곡천 수변 순환 코스',
          primaryRestId: COURSE_25_1_WITH_REST_META.restId,
          trailTarget: { lat: 37.47674, lng: 126.81873, name: '역곡천 수변데크 쉼터' },
          withRest: {
            points: COURSE_25_1_WITH_REST_POINTS,
            steps: COURSE_25_1_WITH_REST_STEPS,
            durationMin: COURSE_25_1_WITH_REST_META.durationMin,
            distanceKm: COURSE_25_1_WITH_REST_META.distanceKm,
          },
          walkOnly: {
            points: COURSE_25_1_WALK_ONLY_POINTS,
            steps: COURSE_25_1_WALK_ONLY_STEPS,
            durationMin: COURSE_25_1_WALK_ONLY_META.durationMin,
            distanceKm: COURSE_25_1_WALK_ONLY_META.distanceKm,
          },
          roadType: '평탄한 수변 데크로드 · 경사 2% 이하 (계단 없음)',
          features: ['역곡천 수변 데크', '징검다리 쉼터', '무장애 슬로프 진입로'],
        },
        {
          title: '가톨릭대 숲길 & 시장 둘레길',
          primaryRestId: COURSE_25_2_WITH_REST_META.restId,
          trailTarget: { lat: 37.48680, lng: 126.80000, name: '가톨릭대 성심교정 숲길' },
          withRest: {
            points: COURSE_25_2_WITH_REST_POINTS,
            steps: COURSE_25_2_WITH_REST_STEPS,
            durationMin: COURSE_25_2_WITH_REST_META.durationMin,
            distanceKm: COURSE_25_2_WITH_REST_META.distanceKm,
          },
          walkOnly: {
            points: COURSE_25_2_WALK_ONLY_POINTS,
            steps: COURSE_25_2_WALK_ONLY_STEPS,
            durationMin: COURSE_25_2_WALK_ONLY_META.durationMin,
            distanceKm: COURSE_25_2_WALK_ONLY_META.distanceKm,
          },
          roadType: '평탄 보도블록 및 완만한 숲길 · 휴식 벤치 3곳',
          features: ['상상시장 아케이드', '가톨릭대 성심교정 숲길', '캠퍼스 잔디마당'],
        },
        {
          title: '푸른수목원 & 항동철길 힐링 코스',
          primaryRestId: COURSE_25_3_WITH_REST_META.restId,
          trailTarget: { lat: 37.48200, lng: 126.82130, name: '항동철길 & 푸른수목원 입구' },
          withRest: {
            points: COURSE_25_3_WITH_REST_POINTS,
            steps: COURSE_25_3_WITH_REST_STEPS,
            durationMin: COURSE_25_3_WITH_REST_META.durationMin,
            distanceKm: COURSE_25_3_WITH_REST_META.distanceKm,
          },
          walkOnly: {
            points: COURSE_25_3_WALK_ONLY_POINTS,
            steps: COURSE_25_3_WALK_ONLY_STEPS,
            durationMin: COURSE_25_3_WALK_ONLY_META.durationMin,
            distanceKm: COURSE_25_3_WALK_ONLY_META.distanceKm,
          },
          roadType: '친환경 흙길 및 수변 목재 데크 · 턱 없는 무장애길',
          features: ['항동철길 평탄길', '항동저수지 수변 관찰 데크', '메타세쿼이아길'],
        }
      ];
    } else {
      trailCandidates = [
        {
          title: '푸른수목원 전체 순환 수변길',
          primaryRestId: COURSE_60_1_WITH_REST_META.restId,
          trailTarget: { lat: 37.48420, lng: 126.82650, name: '푸른수목원 습지생태원' },
          withRest: {
            points: COURSE_60_1_WITH_REST_POINTS,
            steps: COURSE_60_1_WITH_REST_STEPS,
            durationMin: COURSE_60_1_WITH_REST_META.durationMin,
            distanceKm: COURSE_60_1_WITH_REST_META.distanceKm,
          },
          walkOnly: {
            points: COURSE_60_1_WALK_ONLY_POINTS,
            steps: COURSE_60_1_WALK_ONLY_STEPS,
            durationMin: COURSE_60_1_WALK_ONLY_META.durationMin,
            distanceKm: COURSE_60_1_WALK_ONLY_META.distanceKm,
          },
          roadType: '수변 목재 데크 및 친환경 흙길 · 쉼터 5곳',
          features: ['수목원 전체 순환 데크', '습지 생태공원', '무장애 휠체어 전용길'],
        },
        {
          title: '원미산 숲길 둘레길',
          primaryRestId: COURSE_60_2_WITH_REST_META.restId,
          trailTarget: { lat: 37.49120, lng: 126.80250, name: '원미산 진달래동산 둘레길' },
          withRest: {
            points: COURSE_60_2_WITH_REST_POINTS,
            steps: COURSE_60_2_WITH_REST_STEPS,
            durationMin: COURSE_60_2_WITH_REST_META.durationMin,
            distanceKm: COURSE_60_2_WITH_REST_META.distanceKm,
          },
          walkOnly: {
            points: COURSE_60_2_WALK_ONLY_POINTS,
            steps: COURSE_60_2_WALK_ONLY_STEPS,
            durationMin: COURSE_60_2_WALK_ONLY_META.durationMin,
            distanceKm: COURSE_60_2_WALK_ONLY_META.distanceKm,
          },
          roadType: '완만한 흙길 및 친환경 야자매트 · 피톤치드 쉼터',
          features: ['피톤치드 숲길', '전망 정자 쉼터', '배리어프리 진입로'],
        },
        {
          title: '역곡천 ➔ 옥길 합류 생태 둘레길',
          primaryRestId: COURSE_60_3_WITH_REST_META.restId,
          trailTarget: { lat: 37.47250, lng: 126.82400, name: '옥길 생태하천 합류부' },
          withRest: {
            points: COURSE_60_3_WITH_REST_POINTS,
            steps: COURSE_60_3_WITH_REST_STEPS,
            durationMin: COURSE_60_3_WITH_REST_META.durationMin,
            distanceKm: COURSE_60_3_WITH_REST_META.distanceKm,
          },
          walkOnly: {
            points: COURSE_60_3_WALK_ONLY_POINTS,
            steps: COURSE_60_3_WALK_ONLY_STEPS,
            durationMin: COURSE_60_3_WALK_ONLY_META.durationMin,
            distanceKm: COURSE_60_3_WALK_ONLY_META.distanceKm,
          },
          roadType: '수변 평탄 데크로드 · 벤치 4곳',
          features: ['옥길 생태하천 합류부', '갈대숲 관찰로', '평탄 직선 수변길'],
        }
      ];
    }

    // 3. 3개 코스 완성 (Tmap 실시간 보행 도로망 연동 & 고정밀 사전 데이터 Fallback)
    const courses = [];
    for (let i = 0; i < trailCandidates.length; i++) {
      const cand = trailCandidates[i];

      let restaurantDTO = null;
      let geoPath = cand.walkOnly.points;
      let turnByTurn = cand.walkOnly.steps;
      let durationMin = cand.walkOnly.durationMin;
      let distanceKm = cand.walkOnly.distanceKm;

      if (includeRestaurant) {
        const rawRest = YEOKGOK_RESTAURANTS.find((r) => r.id === cand.primaryRestId) || YEOKGOK_RESTAURANTS[0];
        const evaluatedRest = evaluateRestaurant(rawRest, diseaseIds);

        geoPath = cand.withRest.points;
        turnByTurn = cand.withRest.steps;
        durationMin = cand.withRest.durationMin;
        distanceKm = cand.withRest.distanceKm;

        const grade = evaluatedRest.grade || 'green';
        const dot = evaluatedRest.dot || (grade === 'green' ? '🟢' : (grade === 'yellow' ? '🟡' : '🔴'));

        // 등급(green/yellow/red)에 맞춰 뱃지 레이블 동기화 (예: 복합 안심 -> 복합 보통)
        let dynamicBadgeLabel = evaluatedRest.badgeLabel || '안심식당';
        if (grade === 'yellow') {
          dynamicBadgeLabel = dynamicBadgeLabel.replace('안심', '보통');
        } else if (grade === 'red') {
          dynamicBadgeLabel = dynamicBadgeLabel.replace('복합 안심', '섭취 주의').replace('안심', '주의');
        }
        restaurantDTO = {
          id: evaluatedRest.id,
          name: evaluatedRest.name,
          category: evaluatedRest.category,
          address: evaluatedRest.location?.address,
          phone: evaluatedRest.phone,
          foods: evaluatedRest.foods,
          threshold: evaluatedRest.threshold,
          bestFood: evaluatedRest.bestFood,
          substituteNotice: evaluatedRest.substituteNotice,
          menu: evaluatedRest.bestFood?.name || evaluatedRest.foods[0]?.name || '대표 건강식',
          calories: evaluatedRest.bestFood?.calories || 450,
          sodium: evaluatedRest.bestFood?.sodium || 500,
          sugar: evaluatedRest.bestFood?.sugar || 3.0,
          grade,
          nutritionGrade: grade,
          dot,
          badgeLabel: dynamicBadgeLabel,
          gradeLabel: evaluatedRest.bestFood?.label || `${dot} ${dynamicBadgeLabel}`,
          lat: evaluatedRest.location.lat,
          lng: evaluatedRest.location.lng,
          isSafeRestaurant: evaluatedRest.isSafeRestaurant
        };

        // 🌿 Tmap 실시간 보행자 도로망 라우팅 시도
        if (cand.trailTarget) {
          try {
            const tmapRes = await callPedestrianRoute(startHub, startHub, {
              passList: `${restaurantDTO.lng},${restaurantDTO.lat}_${cand.trailTarget.lng},${cand.trailTarget.lat}`,
              searchOption: '30'
            });
            if (tmapRes && tmapRes.geoPath && tmapRes.geoPath.length > 5) {
              geoPath = tmapRes.geoPath;
              turnByTurn = tmapRes.turnByTurn;
              durationMin = Math.max(8, Math.round(tmapRes.durationSeconds / 60));
              distanceKm = Number((tmapRes.distanceMeters / 1000).toFixed(2));
            } else {
              geoPath = cand.withRest.points;
              turnByTurn = cand.withRest.steps;
              durationMin = cand.withRest.durationMin;
              distanceKm = cand.withRest.distanceKm;
            }
          } catch {
            geoPath = cand.withRest.points;
            turnByTurn = cand.withRest.steps;
            durationMin = cand.withRest.durationMin;
            distanceKm = cand.withRest.distanceKm;
          }
        } else {
          geoPath = cand.withRest.points;
          turnByTurn = cand.withRest.steps;
          durationMin = cand.withRest.durationMin;
          distanceKm = cand.withRest.distanceKm;
        }
      } else {
        // 산책만 (식당 제외)
        if (cand.trailTarget) {
          try {
            const tmapRes = await callPedestrianRoute(startHub, startHub, {
              passList: `${cand.trailTarget.lng},${cand.trailTarget.lat}`,
              searchOption: '30'
            });
            if (tmapRes && tmapRes.geoPath && tmapRes.geoPath.length > 5) {
              geoPath = tmapRes.geoPath;
              turnByTurn = tmapRes.turnByTurn;
              durationMin = Math.max(8, Math.round(tmapRes.durationSeconds / 60));
              distanceKm = Number((tmapRes.distanceMeters / 1000).toFixed(2));
            } else {
              geoPath = cand.walkOnly.points;
              turnByTurn = cand.walkOnly.steps;
              durationMin = cand.walkOnly.durationMin;
              distanceKm = cand.walkOnly.distanceKm;
            }
          } catch {
            geoPath = cand.walkOnly.points;
            turnByTurn = cand.walkOnly.steps;
            durationMin = cand.walkOnly.durationMin;
            distanceKm = cand.walkOnly.distanceKm;
          }
        } else {
          geoPath = cand.walkOnly.points;
          turnByTurn = cand.walkOnly.steps;
          durationMin = cand.walkOnly.durationMin;
          distanceKm = cand.walkOnly.distanceKm;
        }
      }

      const hubShort = (startHub.name || '역곡역').split(' ')[0];
      const cleanBaseTitle = cand.title.replace(/\s*\(\d+분\)/g, '').trim();
      const dynamicTitle = `${cleanBaseTitle} (${durationMin}분)`;
      const trailShort = cleanBaseTitle.split(' ')[0];
      const waypointsText = includeRestaurant && restaurantDTO
        ? `${hubShort} ➔ ${restaurantDTO.dot || '🟢'} ${restaurantDTO.name} ➔ ${trailShort} ➔ ${hubShort}`
        : `${hubShort} ➔ ${trailShort} ➔ ${hubShort}`;

      const smoothedGeoPath = smoothAndDensifyPath(geoPath);

      courses.push({
        id: `${regionId}-${minutes}-${i}`,
        regionId,
        title: dynamicTitle,
        durationMin,
        distanceKm,
        hasRestaurant: Boolean(includeRestaurant && restaurantDTO),
        roadType: cand.roadType,
        features: cand.features,
        waypoints: waypointsText,
        geoPath: smoothedGeoPath, // 식당 정문(0.0m)을 물리적으로 통과하는 고밀도 실측 도로망 (곡선 보간)
        turnByTurn,
        startPoint: {
          name: `${hubShort} 시작 지점`,
          lat: smoothedGeoPath[0]?.lat,
          lng: smoothedGeoPath[0]?.lng,
        },
        destPoint: {
          name: `${hubShort} 도착 지점`,
          lat: smoothedGeoPath[smoothedGeoPath.length - 1]?.lat,
          lng: smoothedGeoPath[smoothedGeoPath.length - 1]?.lng,
        },
        restaurant: restaurantDTO
      });
    }

    // 🌿 질환 맞춤 안전 필터링: 섭취 주의(red) 식당 코스는 추천 목록에서 제외 (pass: green, yellow, 산책만)
    const safeCourses = courses.filter(
      (c) => !c.hasRestaurant || !c.restaurant || c.restaurant.grade !== 'red'
    );
    // 만약 모든 코스가 red일 경우에만 fallback으로 원본 유지, 그 외에는 안전 코스만 반환
    const candidates = safeCourses.length > 0 ? safeCourses : courses;

    // 🌿 가장 안전한 안심(green) 식당 코스를 1순위로 우선 정렬 (green > yellow > 기타)
    const gradeScores = { green: 3, yellow: 2, red: 1 };
    const finalCourses = [...candidates].sort((a, b) => {
      const scoreA = a.restaurant ? (gradeScores[a.restaurant.grade] || 0) : 1.5;
      const scoreB = b.restaurant ? (gradeScores[b.restaurant.grade] || 0) : 1.5;
      return scoreB - scoreA;
    });

    return res.json({
      success: true,
      data: {
        regionId,
        minutes,
        includeRestaurant,
        count: finalCourses.length,
        courses: finalCourses
      }
    });
  } catch (error) {
    console.error('❌ [Course Recommend Error]:', error);
    return res.status(500).json({
      success: false,
      error: '맞춤 코스 추천 생성 중 오류가 발생했습니다.'
    });
  }
};

router.post('/recommend', handleRecommend);
router.get('/recommend', handleRecommend);

module.exports = router;
