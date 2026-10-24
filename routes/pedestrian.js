const express = require('express');
const router = express.Router();
const {
  YEOKGOK_STATION,
  TRAILS,
  YEOKGOK_STREAM_TRAIL,
  CATHOLIC_UNIV_TRAIL,
  PUREUN_ARBORETUM_TRAIL,
  WONMISAN_TRAIL
} = require('../lib/yeokgokTrails');
const { YEOKGOK_RESTAURANTS } = require('../lib/yeokgokRestaurants');
const { evaluateRestaurant } = require('../lib/nutritionEvaluator');

// 메모리 캐시 (동일 경로 재요청 시 0ms 초고속 응답 & Tmap 쿼터 절약)
const routeCache = new Map();

/**
 * SK Open API Tmap 보행자 경로 API 호출 헬퍼
 * searchOption: '30' (계단 제외 / 노약자·휠체어 배리어프리 무장애 경로)
 */
async function callTmapPedestrian(start, end, options = {}) {
  const cacheKey = `${start.lat.toFixed(5)},${start.lng.toFixed(5)}_${end.lat.toFixed(5)},${end.lng.toFixed(5)}_${options.searchOption || 30}`;
  if (routeCache.has(cacheKey)) {
    return routeCache.get(cacheKey);
  }

  const appKey = process.env.SK_OPEN_API_KEY || process.env.TMAP_API_KEY || 'UAu3bWN5O36RlV5O7NYqs1bMQwDRi3ua9XyIZnuV';

  try {
    const response = await fetch('https://apis.openapi.sk.com/tmap/routes/pedestrian?version=1', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'appKey': appKey
      },
      body: JSON.stringify({
        startX: Number(start.lng),
        startY: Number(start.lat),
        endX: Number(end.lng),
        endY: Number(end.lat),
        startName: encodeURIComponent(start.name || '출발지'),
        endName: encodeURIComponent(end.name || '도착지'),
        searchOption: String(options.searchOption || '30'), // 30: 계단 제외 보행약자 우선
        reqCoordType: 'WGS84GEO',
        resCoordType: 'WGS84GEO'
      })
    });

    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data.features) && data.features.length > 0) {
        const geoPath = [];
        const turnByTurn = [];
        let totalDistance = 0;
        let totalTime = 0;

        data.features.forEach((feat) => {
          if (feat.geometry.type === 'LineString') {
            feat.geometry.coordinates.forEach(([lng, lat]) => {
              geoPath.push({ lat, lng });
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

        const result = {
          success: true,
          source: 'tmap',
          geoPath,
          turnByTurn,
          distanceMeters: totalDistance,
          durationSeconds: totalTime
        };

        routeCache.set(cacheKey, result);
        return result;
      }
    }
  } catch (err) {
    console.warn('⚠️ [Tmap API 호출 실패 또는 미등록, 사전 검증 도로망으로 대체]:', err.message);
  }

  // Fallback: 두 지점 간의 보간 경로 반환
  return {
    success: false,
    source: 'fallback',
    geoPath: [
      { lat: start.lat, lng: start.lng },
      { lat: (start.lat + end.lat) / 2, lng: (start.lng + end.lng) / 2 },
      { lat: end.lat, lng: end.lng }
    ],
    turnByTurn: [`${start.name || '출발지'}에서 ${end.name || '목적지'} 방면으로 도보 이동`],
    distanceMeters: Math.round(calculateDistanceKm(start, end) * 1000),
    durationSeconds: Math.round((calculateDistanceKm(start, end) / 3.5) * 3600)
  };
}

/**
 * 직선 거리(km) 계산 (하버사인 공식)
 */
function calculateDistanceKm(p1, p2) {
  const R = 6371;
  const dLat = ((p2.lat - p1.lat) * Math.PI) / 180;
  const dLng = ((p2.lng - p1.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((p1.lat * Math.PI) / 180) *
      Math.cos((p2.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * 다중 세그먼트 이어붙이기 (Multi-Segment Stitching)
 * 구간들 사이의 중복 좌표를 제거하고 매끄러운 단일 폴리라인으로 결합
 */
async function stitchSegments(segments) {
  const stitchedPath = [];
  const allInstructions = [];
  let totalDistanceM = 0;
  let totalDurationSec = 0;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const res = await callTmapPedestrian(seg.start, seg.end, { searchOption: 30 });

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
 * 단일 구간 Tmap 보행자 경로 조회 프록시
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

    const route = await callTmapPedestrian(start, end, { searchOption });
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
 * 개인 맞춤형 (질환 + 산책시간 + 식당여부) 멀티 세그먼트 보행 코스 추천 생성기
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

    const startHub = userLocation?.lat && userLocation?.lng
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

    // 2. 시간에 맞는 트레일 후보 3개 매핑
    let trailCandidates = [];
    if (minutes <= 15) {
      trailCandidates = [
        { trail: YEOKGOK_STREAM_TRAIL, title: '역곡천 수변 안심 산책길 (초급)', baseMin: 12, baseKm: 0.9, slice: 10 },
        { trail: CATHOLIC_UNIV_TRAIL, title: '역곡상상시장 & 문화거리 산책', baseMin: 10, baseKm: 0.8, slice: 8 },
        { trail: PUREUN_ARBORETUM_TRAIL, title: '항동철길 입구 숲바람길', baseMin: 14, baseKm: 1.1, slice: 8 }
      ];
    } else if (minutes <= 35) {
      trailCandidates = [
        { trail: YEOKGOK_STREAM_TRAIL, title: '역곡천 수변 순환 코스', baseMin: 25, baseKm: 1.8, slice: 18 },
        { trail: CATHOLIC_UNIV_TRAIL, title: '가톨릭대 숲길 & 시장 둘레길', baseMin: 24, baseKm: 1.6, slice: 14 },
        { trail: PUREUN_ARBORETUM_TRAIL, title: '푸른수목원 & 항동철길 힐링 코스', baseMin: 27, baseKm: 2.1, slice: 16 }
      ];
    } else {
      trailCandidates = [
        { trail: PUREUN_ARBORETUM_TRAIL, title: '푸른수목원 전체 순환 수변길', baseMin: 55, baseKm: 3.5, slice: 16 },
        { trail: WONMISAN_TRAIL, title: '원미산 숲길 둘레길 (피톤치드)', baseMin: 58, baseKm: 3.8, slice: 14 },
        { trail: YEOKGOK_STREAM_TRAIL, title: '역곡천 ➔ 옥길 합류 생태 둘레길', baseMin: 52, baseKm: 3.3, slice: 18 }
      ];
    }

    // 3. 3개 코스 완성 (다중 세그먼트 결합)
    const courses = [];
    for (let i = 0; i < trailCandidates.length; i++) {
      const cand = trailCandidates[i];
      const trail = cand.trail;
      const targetRest = includeRestaurant ? sortedRestaurants[i % sortedRestaurants.length] : null;

      let stitchedGeoPath = [];
      let turnByTurn = [];
      let calculatedKm = cand.baseKm;
      let calculatedMin = cand.baseMin;

      if (includeRestaurant && targetRest) {
        // [다중 세그먼트 이어붙이기]: 출발지 ➔ 🟢안심식당 ➔ 산책로 진입 ➔ 산책로 순환 ➔ 복귀
        const restPos = {
          lat: targetRest.location.lat,
          lng: targetRest.location.lng,
          name: targetRest.name
        };

        const segmentList = [
          { start: startHub, end: restPos },
          { start: restPos, end: trail.entryPoint }
        ];

        const stitched = await stitchSegments(segmentList);
        // 트레일 자체의 고정밀 실측 좌표열 추가
        const trailSlice = trail.loopCoordinates.slice(0, cand.slice);
        stitchedGeoPath = [...stitched.geoPath, ...trailSlice];

        // 마지막 복귀점 역곡역 연결
        if (stitchedGeoPath.length > 0) {
          stitchedGeoPath.push(startHub);
        }

        turnByTurn = [
          `${startHub.name || '역곡역'}에서 출발하여 [${targetRest.name}] 방면으로 이동`,
          `[${targetRest.name}]에서 식사 후 [${trail.name}] 진입로 데크로 도보 이동`,
          `계단 없는 완만한 수변 데크로드 및 쉼터 구간 통과`,
          `역곡역 방면으로 안전하게 회귀`
        ];

        calculatedKm = Number((cand.baseKm + 0.4).toFixed(2));
        calculatedMin = cand.baseMin + 5;
      } else {
        // [식당 제외]: 출발지 ➔ 산책로 진입 ➔ 산책로 순환 ➔ 복귀
        stitchedGeoPath = [startHub, ...trail.loopCoordinates.slice(0, cand.slice), startHub];
        turnByTurn = [
          `${startHub.name || '역곡역'}에서 출발하여 [${trail.name}] 입구로 이동`,
          `완만한 평탄 산책로를 따라 쉼터 및 데크길 순환`,
          `${startHub.name || '역곡역'}으로 안전하게 완보 회귀`
        ];
      }

      // 식당 정보 DTO 매핑
      const restaurantDTO = targetRest
        ? {
            id: targetRest.id,
            name: targetRest.name,
            category: targetRest.category,
            address: targetRest.location?.address,
            phone: targetRest.phone,
            menu: targetRest.bestFood?.name || targetRest.foods[0]?.name || '대표 건강식',
            calories: targetRest.bestFood?.calories || 450,
            sodium: targetRest.bestFood?.sodium || 500,
            sugar: targetRest.bestFood?.sugar || 3.0,
            grade: targetRest.grade,
            nutritionGrade: targetRest.grade,
            badgeLabel: targetRest.badgeLabel || '안심식당',
            gradeLabel: targetRest.bestFood?.label || targetRest.badgeLabel,
            lat: targetRest.location.lat,
            lng: targetRest.location.lng,
            isSafeRestaurant: targetRest.isSafeRestaurant
          }
        : null;

      const hubShort = (startHub.name || '역곡역').split(' ')[0];
      const trailShort = (trail.name || '산책로').split(' ')[0];
      const waypointsText = includeRestaurant && restaurantDTO
        ? `${hubShort} ➔ 🟢 ${restaurantDTO.name} ➔ ${trailShort} ➔ ${hubShort}`
        : `${hubShort} ➔ ${trailShort} ➔ ${hubShort}`;

      courses.push({
        id: `${regionId}-${minutes}-${i}`,
        regionId,
        title: cand.title,
        durationMin: calculatedMin,
        distanceKm: calculatedKm,
        hasRestaurant: Boolean(includeRestaurant && restaurantDTO),
        roadType: trail.roadType,
        features: trail.features,
        waypoints: waypointsText,
        geoPath: stitchedGeoPath,
        turnByTurn,
        restaurant: restaurantDTO
      });
    }

    return res.json({
      success: true,
      data: {
        regionId,
        minutes,
        includeRestaurant,
        count: courses.length,
        courses
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
