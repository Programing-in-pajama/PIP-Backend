// 🌿 만성질환 26종 1끼 외식 영양 기준표 (SOYO 공식 기술 명세서 v1.0)
// 성인 1일 권장량(2,000kcal, 나트륨 2,000mg, 당류 50g)의 1회 식사(30~35%) 기준 임계값

const DISEASE_RULES = {
  // 심뇌혈관질환
  D01: {
    id: 'D01',
    name: '고혈압',
    category: '심뇌혈관질환',
    calMin: 550,
    calMax: 700,
    sodium: 600, // mg
    sugar: 15,   // g
    rationale: '일일 소금 5g 이하 지침 엄격 적용 (저염 최우선)',
    advice: '국물을 남기고 건더기 위주로 드세요.'
  },
  D02: {
    id: 'D02',
    name: '협심증 및 심근경색',
    category: '심뇌혈관질환',
    calMin: 500,
    calMax: 650,
    sodium: 600,
    sugar: 12,
    rationale: '혈관벽 부담 완화, 포화/트랜스지방 연계 주의',
    advice: '튀김류 대신 찜·구이 요리를 권장합니다.'
  },
  D03: {
    id: 'D03',
    name: '뇌졸중 (뇌경색·뇌출혈)',
    category: '심뇌혈관질환',
    calMin: 550,
    calMax: 650,
    sodium: 600,
    sugar: 12,
    rationale: '혈압·혈당 엄격 동시 관리, 혈관 재손상 예방',
    advice: '자극적인 양념과 염분을 최소화하세요.'
  },
  D04: {
    id: 'D04',
    name: '심부전',
    category: '심뇌혈관질환',
    calMin: 500,
    calMax: 650,
    sodium: 500,
    sugar: 15,
    rationale: '체액 저류/폐부종 억제를 위한 초저나트륨 제한',
    advice: '초저염 조리식을 선택하고 찌개 국물은 피하세요.'
  },

  // 내분비·대사질환
  D05: {
    id: 'D05',
    name: '당뇨병 (제2형)',
    category: '내분비·대사질환',
    calMin: 500,
    calMax: 650,
    sodium: 700,
    sugar: 8,
    rationale: '식후 혈당 스파이크 방지, 단순당 극소화',
    advice: '단순당과 탄수화물을 줄이고 식이섬유를 먼저 드세요.'
  },
  D06: {
    id: 'D06',
    name: '이상지질혈증 (고지혈증)',
    category: '내분비·대사질환',
    calMin: 500,
    calMax: 600,
    sodium: 700,
    sugar: 10,
    rationale: '잉여 열량의 중성지방 축적 억제 (체중 감량 유도)',
    advice: '포화지방을 피하고 채소와 해조류를 충분히 섭취하세요.'
  },
  D07: {
    id: 'D07',
    name: '통풍',
    category: '내분비·대사질환',
    calMin: 550,
    calMax: 700,
    sodium: 700,
    sugar: 10,
    rationale: '액상과당(요산 생성 촉진) 제한, 퓨린 주의',
    advice: '고퓨린 육류와 과당 음료를 피하고 물을 자주 드세요.'
  },
  D08: {
    id: 'D08',
    name: '갑상선 기능 이상 (저하/항진)',
    category: '내분비·대사질환',
    calMin: 550,
    calMax: 650,
    sodium: 700,
    sugar: 15,
    rationale: '기초대사량 변화에 따른 적정 체중 유지 열량 세팅',
    advice: '균형 잡힌 열량과 소화가 편한 단백질을 섭취하세요.'
  },

  // 만성 호흡기질환
  D09: {
    id: 'D09',
    name: '만성 폐쇄성 폐질환 (COPD)',
    category: '만성 호흡기질환',
    calMin: 650,
    calMax: 800,
    sodium: 700,
    sugar: 10,
    rationale: '호흡근 소모 보충 (고열량), 탄수화물 CO₂ 생성 억제',
    advice: '소량씩 자주 나누어 먹고 고단백 식단을 유지하세요.'
  },
  D10: {
    id: 'D10',
    name: '기관지 천식',
    category: '만성 호흡기질환',
    calMin: 550,
    calMax: 700,
    sodium: 700,
    sugar: 12,
    rationale: '체중 증가에 의한 흉벽 압박 및 호흡 부담 방지',
    advice: '과식을 피하고 가공식품의 보존제/첨가물을 주의하세요.'
  },
  D11: {
    id: 'D11',
    name: '만성 알레르기 비염',
    category: '만성 호흡기질환',
    calMin: 600,
    calMax: 750,
    sodium: 800,
    sugar: 15,
    rationale: '표준 균형식 기준',
    advice: '면역 균형을 위해 신선한 채소 위주의 식사를 권장합니다.'
  },

  // 근골격계질환
  D12: {
    id: 'D12',
    name: '퇴행성 관절염',
    category: '근골격계질환',
    calMin: 450,
    calMax: 600,
    sodium: 700,
    sugar: 12,
    rationale: '무릎·고관절 연골 부하 감소를 위한 칼로리 제한',
    advice: '적정 체중을 위해 식사량을 80% 수준으로 조절하세요.'
  },
  D13: {
    id: 'D13',
    name: '골다공증',
    category: '근골격계질환',
    calMin: 550,
    calMax: 700,
    sodium: 600,
    sugar: 15,
    rationale: '나트륨 과다에 따른 소변 내 칼슘 배출 억제 (저염 필수)',
    advice: '나트륨을 줄이고 칼슘 배출을 방지하는 저염식을 선택하세요.'
  },
  D14: {
    id: 'D14',
    name: '류마티스 관절염',
    category: '근골격계질환',
    calMin: 550,
    calMax: 700,
    sodium: 650,
    sugar: 12,
    rationale: '만성 전신 염증 반응 완화 및 체중 관리',
    advice: '항산화 채소와 등푸른 생선 등 항염 식단을 권장합니다.'
  },
  D15: {
    id: 'D15',
    name: '만성 요통 및 추간판탈출증',
    category: '근골격계질환',
    calMin: 500,
    calMax: 600,
    sodium: 750,
    sugar: 15,
    rationale: '복부 비만 방지를 통한 척추 기계적 하중 경감',
    advice: '복부 팽만을 유발하는 과식과 고칼로리식을 피하세요.'
  },

  // 신장·비뇨기질환
  D16: {
    id: 'D16',
    name: '만성 콩팥병 (만성 신부전)',
    category: '신장·비뇨기질환',
    calMin: 500,
    calMax: 650,
    sodium: 500,
    sugar: 12,
    rationale: '신부전 위험, 체액 저류 및 요독증 억제 (초저염)',
    advice: '국물 섭취를 금하고 초저염식을 엄격히 실천하세요.'
  },
  D17: {
    id: 'D17',
    name: '전립선비대증',
    category: '신장·비뇨기질환',
    calMin: 550,
    calMax: 700,
    sodium: 700,
    sugar: 15,
    rationale: '방광 자극 완화, 자극적인 고염·매운 음식 제한',
    advice: '자극적이고 매운 양념과 카페인을 피하세요.'
  },

  // 소화기·간질환
  D18: {
    id: 'D18',
    name: '만성 B형·C형 간염',
    category: '소화기·간질환',
    calMin: 600,
    calMax: 750,
    sodium: 650,
    sugar: 12,
    rationale: '간 대사 부담 완화 및 적정 단백질·열량 공급',
    advice: '간에 부담 없는 담백한 양질의 단백질을 섭취하세요.'
  },
  D19: {
    id: 'D19',
    name: '비알코올성 지방간질환',
    category: '소화기·간질환',
    calMin: 450,
    calMax: 600,
    sodium: 700,
    sugar: 8,
    rationale: '간 내 지방 축적 억제를 위한 과당·당질 엄격 제한',
    advice: '음료수와 단 간식을 피하고 정제 탄수화물을 제한하세요.'
  },
  D20: {
    id: 'D20',
    name: '위식도역류질환 (GERD)',
    category: '소화기·간질환',
    calMin: 500,
    calMax: 650,
    sodium: 650,
    sugar: 12,
    rationale: '위산 분비 촉진 및 복압 상승 방지를 위한 소식 권장',
    advice: '기름진 음식과 과식을 피하고 식후 바로 눕지 마세요.'
  },
  D21: {
    id: 'D21',
    name: '염증성 장질환 (크론병/궤양성대장염)',
    category: '소화기·간질환',
    calMin: 600,
    calMax: 750,
    sodium: 650,
    sugar: 10,
    rationale: '장 점막 자극 최소화 및 흡수 장애 영양 보충',
    advice: '자극적이고 질긴 섬유질 대신 부드러운 음식을 선택하세요.'
  },

  // 신경·정신질환
  D22: {
    id: 'D22',
    name: '치매 (알츠하이머병)',
    category: '신경·정신질환',
    calMin: 550,
    calMax: 700,
    sodium: 650,
    sugar: 12,
    rationale: '뇌혈관 보호 MIND 식단 원칙 적용 (저염·저당)',
    advice: '녹색 잎채소, 견과류, 생선 등 브레인 푸드를 권장합니다.'
  },
  D23: {
    id: 'D23',
    name: '파킨슨병',
    category: '신경·정신질환',
    calMin: 600,
    calMax: 750,
    sodium: 700,
    sugar: 15,
    rationale: '운동 저하 및 체중 감소 예방을 위한 충분한 에너지',
    advice: '체중 유지를 위해 충분한 영양과 수분을 섭취하세요.'
  },
  D24: {
    id: 'D24',
    name: '만성 우울장애',
    category: '신경·정신질환',
    calMin: 550,
    calMax: 700,
    sodium: 750,
    sugar: 10,
    rationale: '혈당 롤러코스터에 따른 감정 기복 방지 (단순당 제한)',
    advice: '혈당을 급격히 올리는 단 음식을 줄이고 복합당을 드세요.'
  },

  // 악성 신생물(암)
  D25: {
    id: 'D25',
    name: '주요 고형암 (위/대장/폐/간/유방)',
    category: '악성 신생물(암)',
    calMin: 650,
    calMax: 800,
    sodium: 600,
    sugar: 12,
    rationale: '암 악액질 방지 고열량 유지, 점막 자극 방지 저염',
    advice: '자극적인 짠 음식을 피하고 부드러운 고단백식을 드세요.'
  },
  D26: {
    id: 'D26',
    name: '혈액암 (백혈병/림프종/골수종)',
    category: '악성 신생물(암)',
    calMin: 650,
    calMax: 800,
    sodium: 650,
    sugar: 12,
    rationale: '면역 저하 및 소모성 대사 대비 충분한 영양 보충',
    advice: '위생적으로 익힌 음식 위주로 충분한 열량을 보충하세요.'
  }
};

// 미선택 / 비회원 기본 임계치 (건강한 일반 성인 1끼 기준)
const DEFAULT_HEALTH_THRESHOLD = {
  id: 'DEFAULT',
  name: '일반 성인 권장',
  category: '일반',
  calMin: 550,
  calMax: 750,
  sodium: 800, // mg
  sugar: 15,   // g
  rationale: '한국인 영양섭취기준(KDRIs) 일반 성인 1끼 권장',
  advice: '과도한 나트륨과 단순당을 주의하며 균형 있게 섭취하세요.'
};

module.exports = {
  DISEASE_RULES,
  DEFAULT_HEALTH_THRESHOLD
};
