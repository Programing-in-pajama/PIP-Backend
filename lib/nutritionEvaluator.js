// 🌿 만성질환 26종 맞춤형 3색 신호등 판정 엔진 (SOYO 공식 기술 명세서 v1.0)
const { DISEASE_RULES, DEFAULT_HEALTH_THRESHOLD } = require('./diseaseRules');

/**
 * 질환 ID(D01~D26) 또는 한글 질환명으로 해당 규칙을 찾습니다.
 */
function findDiseaseRule(query) {
  if (!query) return null;
  const str = String(query).trim();

  // ID 직접 매칭 (D01 등)
  if (DISEASE_RULES[str]) return DISEASE_RULES[str];

  // 한글명 매칭
  const rules = Object.values(DISEASE_RULES);
  return (
    rules.find((r) => r.name === str) ||
    rules.find((r) => str.includes(r.name) || r.name.includes(str)) ||
    null
  );
}

/**
 * 사용자가 선택한 k개의 질환에 대해 동적 임계치 병합(가장 엄격한 최솟값 적용)을 수행합니다.
 */
function mergeDiseaseThresholds(diseaseQueries = []) {
  if (!Array.isArray(diseaseQueries) || diseaseQueries.length === 0) {
    return {
      ...DEFAULT_HEALTH_THRESHOLD,
      isDefault: true,
      matchedDiseases: [],
      badgeLabel: '안심식당'
    };
  }

  const matchedRules = [];
  const seenIds = new Set();

  for (const q of diseaseQueries) {
    const rule = findDiseaseRule(q);
    if (rule && !seenIds.has(rule.id)) {
      seenIds.add(rule.id);
      matchedRules.push(rule);
    }
  }

  if (matchedRules.length === 0) {
    return {
      ...DEFAULT_HEALTH_THRESHOLD,
      isDefault: true,
      matchedDiseases: [],
      badgeLabel: '안심식당'
    };
  }

  // 최솟값(가장 엄격한 기준) 병합
  const minSodium = Math.min(...matchedRules.map((r) => r.sodium));
  const minSugar = Math.min(...matchedRules.map((r) => r.sugar));
  const minCalMax = Math.min(...matchedRules.map((r) => r.calMax));
  const minCalMin = Math.min(...matchedRules.map((r) => r.calMin));

  let badgeLabel = '안심식당';
  if (matchedRules.length === 1) {
    badgeLabel = `${matchedRules[0].name.split(' ')[0]} 안심`;
  } else if (matchedRules.length >= 2) {
    const d1 = matchedRules[0].name.split(' ')[0];
    const d2 = matchedRules[1].name.split(' ')[0];
    badgeLabel = `복합 안심 (${d1}·${d2})`;
  }

  return {
    id: matchedRules.map((r) => r.id).join('+'),
    name: matchedRules.map((r) => r.name).join(' + '),
    calMin: minCalMin,
    calMax: minCalMax,
    sodium: minSodium,
    sugar: minSugar,
    isDefault: false,
    matchedDiseases: matchedRules,
    badgeLabel
  };
}

/**
 * 개별 음식의 영양소 함량을 병합된 1끼 상한치와 비교하여 초과 비율(R) 및 3색 신호등을 판정합니다.
 *
 * 공식:
 * R_sod = Actual_sod / Limit_sod
 * R_sug = Actual_sug / Limit_sug
 * R_cal = Actual_cal / Limit_cal
 * R_max = max(R_sod, R_sug, R_cal)
 *
 * 판정 기준:
 * - SAFE (안심): R_max <= 1.0 (초록색 🟢)
 * - CAUTION (보통): 1.0 < R_max <= 1.25 (노란색 🟡)
 * - WARNING (주의): R_max > 1.25 (빨간색 🔴)
 */
function evaluateFood(food, threshold) {
  if (!food) return null;

  const actualCal = Number(food.calories) || 0;
  const actualSod = Number(food.sodium) || 0;
  const actualSug = Number(food.sugar) || 0;

  const rSod = threshold.sodium > 0 ? actualSod / threshold.sodium : 1.0;
  const rSug = threshold.sugar > 0 ? actualSug / threshold.sugar : 1.0;
  const rCal = threshold.calMax > 0 ? actualCal / threshold.calMax : 1.0;

  const rMax = Math.max(rSod, rSug, rCal);

  // 🌿 [열량 하한선 검사] 권장 1끼 최저 열량의 70% 미만일 경우 영양 결핍 위험 판정
  const isCalorieDeficient = threshold.calMin > 0 && actualCal < (threshold.calMin * 0.7);

  let grade = 'green';
  let gradeText = '안심';
  let dot = '🟢';
  let guideAdvice = '영양 균형이 우수하여 안심하고 드실 수 있습니다.';

  if (rMax > 1.25) {
    grade = 'red';
    gradeText = '주의';
    dot = '🔴';
    // 💡 가장 초과율이 높은 영양소를 1순위로 조언 매칭
    if (rMax === rSug || (rSug > 1.25 && rSug >= rSod)) {
      guideAdvice = `당류가 1끼 상한(${threshold.sugar}g)의 ${Math.round(rSug * 100)}% 수준으로 매우 높습니다. 섭취량 조절이 필요합니다.`;
    } else if (rMax === rSod || rSod > 1.25) {
      guideAdvice = `나트륨이 1끼 상한(${threshold.sodium}mg)의 ${Math.round(rSod * 100)}% 수준으로 높습니다. 국물은 피하세요.`;
    } else {
      guideAdvice = `열량이 1끼 권장 상한(${threshold.calMax}kcal)을 초과(${actualCal}kcal)하여 소식을 권장합니다.`;
    }
  } else if (rMax > 1.0) {
    grade = 'yellow';
    gradeText = '보통';
    dot = '🟡';
    if (rMax === rSug || (rSug > 1.0 && rSug >= rSod)) {
      guideAdvice = `당류가 1끼 상한(${threshold.sugar}g)을 다소 초과합니다. 단 음료나 후식을 자제하세요.`;
    } else if (rMax === rSod || rSod > 1.0) {
      guideAdvice = `나트륨이 1끼 상한(${threshold.sodium}mg)을 다소 초과합니다. 국물을 덜 먹고 건더기 위주로 드세요.`;
    } else {
      guideAdvice = `열량이 1끼 권장 상한(${threshold.calMax}kcal)에 근접하니 밥 양을 2/3 공기로 조절하세요.`;
    }
  } else if (isCalorieDeficient) {
    // 열량 하한선 미달인 경우: 보통(yellow) 등급 부여 및 영양 보충 조언
    grade = 'yellow';
    gradeText = '보통';
    dot = '🟡';
    guideAdvice = `열량이 1끼 권장 하한(${threshold.calMin}kcal)에 미달(${actualCal}kcal)합니다. 체력 유지를 위해 단백질·영양 보충이 필요합니다.`;
  }

  // 질환별 맞춤 권고사항이 있으면 보강
  if (threshold.matchedDiseases && threshold.matchedDiseases.length > 0) {
    const diseaseAdvice = threshold.matchedDiseases.map((d) => d.advice).filter(Boolean)[0];
    if (diseaseAdvice) {
      guideAdvice = `${guideAdvice} (${diseaseAdvice})`;
    }
  }

  return {
    ...food,
    grade,
    nutritionGrade: grade,
    gradeText,
    dot,
    rMax: Number(rMax.toFixed(2)),
    rSod: Number(rSod.toFixed(2)),
    rSug: Number(rSug.toFixed(2)),
    rCal: Number(rCal.toFixed(2)),
    isCalorieDeficient,
    guideAdvice,
    label: `${dot} ${threshold.isDefault ? '일반' : threshold.badgeLabel} (${gradeText})`
  };
}

/**
 * 특정 식당의 전체 음식 리스트를 사용자의 질환 기준으로 평가하고 식당 종합 등급을 산출합니다.
 * 대표 메뉴가 부적절(red/yellow)할 경우, 더 안전한 사이드/추천 메뉴로 대체 지정합니다.
 */
function evaluateRestaurant(restaurant, diseaseQueries = []) {
  if (!restaurant) return null;

  const threshold = mergeDiseaseThresholds(diseaseQueries);
  const foods = restaurant.foods || [];
  const evaluatedFoods = foods.map((f) => evaluateFood(f, threshold));

  // 전체 음식 중 가장 안전한 대표 음식 선정
  const score = { green: 3, yellow: 2, red: 1 };
  const bestGradeFood = evaluatedFoods.reduce((best, cur) => {
    if (!best) return cur;
    return (score[cur.grade] || 0) > (score[best.grade] || 0) ? cur : best;
  }, evaluatedFoods[0]);

  // 🌿 대표 메뉴(첫 번째 음식)가 부적절하고 사이드 메뉴가 더 안전한 경우 대체 알림 생성
  const primaryFood = evaluatedFoods[0];
  let substituteNotice = null;
  if (primaryFood && bestGradeFood && primaryFood.name !== bestGradeFood.name) {
    if ((score[primaryFood.grade] || 0) < (score[bestGradeFood.grade] || 0)) {
      substituteNotice = `대표 메뉴(${primaryFood.name}) 대신 안심 사이드 메뉴(${bestGradeFood.name}) 선택 권장`;
      bestGradeFood.isSubstitute = true;
      bestGradeFood.substituteNotice = substituteNotice;
    }
  }

  const restaurantGrade = bestGradeFood?.grade || 'green';
  const restaurantDot = bestGradeFood?.dot || '🟢';

  return {
    ...restaurant,
    grade: restaurantGrade,
    nutritionGrade: restaurantGrade,
    dot: restaurantDot,
    badgeLabel: threshold.badgeLabel,
    threshold,
    foods: evaluatedFoods,
    bestFood: bestGradeFood,
    substituteNotice
  };
}

module.exports = {
  findDiseaseRule,
  mergeDiseaseThresholds,
  evaluateFood,
  evaluateRestaurant
};
