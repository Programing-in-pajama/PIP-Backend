const express = require('express');
const router = express.Router();
const { DISEASE_RULES, DEFAULT_HEALTH_THRESHOLD } = require('../lib/diseaseRules');
const {
  mergeDiseaseThresholds,
  evaluateFood,
  evaluateRestaurant
} = require('../lib/nutritionEvaluator');

/**
 * GET /api/nutrition/diseases
 * 26종 세부 질환별 영양소 계산 기준표 조회
 */
router.get('/diseases', (req, res) => {
  return res.json({
    success: true,
    data: {
      diseases: Object.values(DISEASE_RULES),
      defaultThreshold: DEFAULT_HEALTH_THRESHOLD
    }
  });
});

/**
 * POST /api/nutrition/evaluate
 * 사용자 질환 목록과 식당/음식 정보를 전달받아 3색 신호등 판정 수행
 */
router.post('/evaluate', (req, res) => {
  try {
    const { diseaseIds = [], restaurant, foods } = req.body;
    const threshold = mergeDiseaseThresholds(diseaseIds);

    if (restaurant) {
      const evaluatedRestaurant = evaluateRestaurant(restaurant, diseaseIds);
      return res.json({
        success: true,
        data: {
          threshold,
          restaurant: evaluatedRestaurant
        }
      });
    }

    if (Array.isArray(foods)) {
      const evaluatedFoods = foods.map((f) => evaluateFood(f, threshold));
      return res.json({
        success: true,
        data: {
          threshold,
          foods: evaluatedFoods
        }
      });
    }

    return res.status(400).json({
      success: false,
      error: '평가할 restaurant 또는 foods 배열이 필요합니다.'
    });
  } catch (error) {
    console.error('❌ [영양 판정 오류]:', error);
    return res.status(500).json({
      success: false,
      error: '영양 판정 연산 중 오류가 발생했습니다.'
    });
  }
});

module.exports = router;
