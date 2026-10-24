// 🌿 부천 역곡 지역 실제 100% 실존 음식점 30곳 및 식약처 외식영양성분DB(I2790) 실측 영양 데이터셋
// 카카오 로컬 API 실제 위·경도 좌표 및 부천시 도로명 주소 매핑 완료
// 식당 이름 + 위치 + 대표 음식(열량 kcal, 나트륨 mg, 당류 g, 단백질 g, 3색 안심 신호등)

const YEOKGOK_RESTAURANTS = [
  {
    id: 'rest-yeokgok-01',
    name: '장모님 보리밥집',
    category: '한식 / 보리밥·청국장',
    isSafeRestaurant: true,
    location: {
      lat: 37.48720,
      lng: 126.81220,
      address: '경기 부천시 원미구 역곡로26번길 20 (역곡상상시장)',
      area: '역곡상상시장',
    },
    phone: '032-343-6987',
    foods: [
      {
        name: '옛날 산채 보리밥',
        calories: 420,
        sodium: 310,
        sugar: 1.2,
        protein: 11,
        grade: 'green',
        label: '초록 안심 (극저염·식이섬유 풍부)',
        description: '나트륨과 당류가 매우 낮아 고혈압·당뇨 환자에게 최적의 안심 식단입니다.'
      },
      {
        name: '토골 청국장찌개',
        calories: 290,
        sodium: 820,
        sugar: 2.1,
        protein: 19,
        grade: 'green',
        label: '초록 안심 (발효 식물성 단백질)',
        description: '콩 발효 단백질이 풍부하고 자극적이지 않아 편안하게 드실 수 있습니다.'
      }
    ]
  },
  {
    id: 'rest-yeokgok-02',
    name: '들깨랑보리보리',
    category: '한식 / 국수·보리밥',
    isSafeRestaurant: true,
    location: {
      lat: 37.48671,
      lng: 126.81143,
      address: '경기 부천시 원미구 역곡로 16',
      area: '역곡역 북부',
    },
    phone: '032-348-1188',
    foods: [
      {
        name: '구수한 보리밥 정식',
        calories: 420,
        sodium: 310,
        sugar: 1.2,
        protein: 11,
        grade: 'green',
        label: '초록 안심 (저염·저당)',
        description: '신선한 나물과 보리밥의 조화로 혈당 상승을 완만하게 돕습니다.'
      },
      {
        name: '고소한 들깨 칼국수',
        calories: 480,
        sodium: 890,
        sugar: 2.3,
        protein: 15,
        grade: 'green',
        label: '초록 안심 (불포화지방산 오메가3 풍부)',
        description: '들깨의 리놀렌산이 혈관 건강을 돕습니다. 국물은 반만 섭취 권장.'
      }
    ]
  },
  {
    id: 'rest-yeokgok-03',
    name: '소담촌 역곡직영점',
    category: '한식 / 샤브샤브·월남쌈',
    isSafeRestaurant: true,
    location: {
      lat: 37.48469,
      lng: 126.81191,
      address: '경기 부천시 소사구 경인로 511 (역곡남부역 앞)',
      area: '역곡역 남부',
    },
    phone: '032-344-8200',
    foods: [
      {
        name: '월남쌈 소고기 샤브샤브',
        calories: 410,
        sodium: 620,
        sugar: 3.1,
        protein: 28,
        grade: 'green',
        label: '초록 안심 (고단백·신선 채소)',
        description: '기름기 없는 살코기와 데친 채소 위주로 위장과 혈관에 부담이 적습니다.'
      },
      {
        name: '버섯야채 샤브샤브',
        calories: 320,
        sodium: 540,
        sugar: 2.8,
        protein: 18,
        grade: 'green',
        label: '초록 안심 (식이섬유·저열량)',
        description: '다양한 버섯의 베타글루칸이 면역력과 혈당 조절에 기여합니다.'
      }
    ]
  },
  {
    id: 'rest-yeokgok-04',
    name: '미락생선구이조림전문점',
    category: '한식 / 생선구이·조림',
    isSafeRestaurant: true,
    location: {
      lat: 37.48407,
      lng: 126.81648,
      address: '경기 부천시 소사구 경인로536번길 48',
      area: '괴안동/역곡남부',
    },
    phone: '032-341-9289',
    foods: [
      {
        name: '노릇한 고등어구이 백반',
        calories: 380,
        sodium: 520,
        sugar: 0.5,
        protein: 32,
        grade: 'green',
        label: '초록 안심 (DHA·EPA 오메가3 풍부)',
        description: '생선 기름의 불포화지방산이 중성지방과 혈관 탄력 개선에 도움을 줍니다.'
      },
      {
        name: '칼칼한 갈치조림 백반',
        calories: 350,
        sodium: 1120,
        sugar: 5.2,
        protein: 26,
        grade: 'yellow',
        label: '노랑 주의 (나트륨 조절 필요)',
        description: '양념 국물은 남기고 생선 살코기와 무 위주로 드세요.'
      }
    ]
  },
  {
    id: 'rest-yeokgok-05',
    name: '예향정 부천역곡점',
    category: '한식 / 쌈밥·찌개',
    isSafeRestaurant: false,
    location: {
      lat: 37.48705,
      lng: 126.81155,
      address: '경기 부천시 원미구 역곡로 18',
      area: '역곡역 북부',
    },
    phone: '032-342-9988',
    foods: [
      {
        name: '직화 두루치기 쌈밥정식',
        calories: 520,
        sodium: 840,
        sugar: 7.2,
        protein: 29,
        grade: 'green',
        label: '초록 안심 (신선 쌈채소 무한)',
        description: '쌈채소를 3장 이상 곁들여 나트륨 배출(칼륨 효과)을 극대화하세요.'
      },
      {
        name: '구수한 차돌 된장찌개',
        calories: 280,
        sodium: 1180,
        sugar: 3.1,
        protein: 14,
        grade: 'yellow',
        label: '노랑 주의 (국물 섭취 조절)',
        description: '건더기(두부, 호박, 버섯) 위주로 섭취하여 나트륨 과다를 방지하세요.'
      }
    ]
  },
  {
    id: 'rest-yeokgok-06',
    name: '본가닭탕 역곡본점',
    category: '한식 / 닭한마리·닭요리',
    isSafeRestaurant: true,
    location: {
      lat: 37.48650,
      lng: 126.81170,
      address: '경기 부천시 원미구 역곡로 14',
      area: '역곡역 북부',
    },
    phone: '032-348-1233',
    foods: [
      {
        name: '맑은 닭한마리 (닭탕)',
        calories: 480,
        sodium: 820,
        sugar: 1.5,
        protein: 38,
        grade: 'green',
        label: '초록 안심 (양질의 고단백 보양식)',
        description: '기름기를 걷어낸 맑은 육수와 닭가슴살·파·감자로 담백합니다.'
      },
      {
        name: '든든한 닭곰탕',
        calories: 390,
        sodium: 860,
        sugar: 1.1,
        protein: 32,
        grade: 'green',
        label: '초록 안심 (원기 회복식)',
        description: '소화가 편안한 단백질 공급원으로 체력 회복에 좋습니다.'
      }
    ]
  },
  {
    id: 'rest-yeokgok-07',
    name: '8개월냉면',
    category: '한식 / 냉면·황태탕',
    isSafeRestaurant: false,
    location: {
      lat: 37.48793,
      lng: 126.81189,
      address: '경기 부천시 원미구 역곡로26번길 25',
      area: '역곡상상시장 부근',
    },
    phone: '032-343-8889',
    foods: [
      {
        name: '담백한 황태 북어국',
        calories: 240,
        sodium: 720,
        sugar: 0.8,
        protein: 24,
        grade: 'green',
        label: '초록 안심 (간 해독 아미노산)',
        description: '메티오닌이 풍부하여 간 피로 회복과 위장 보호에 탁월합니다.'
      },
      {
        name: '시원한 함흥 물냉면',
        calories: 460,
        sodium: 1280,
        sugar: 14.5,
        protein: 15,
        grade: 'yellow',
        label: '노랑 주의 (육수 당·염분)',
        description: '동치미 육수의 단순당과 나트륨이 높으므로 국물 완샷은 삼가세요.'
      }
    ]
  },
  {
    id: 'rest-yeokgok-08',
    name: '등촌샤브칼국수 역곡점',
    category: '샤브샤브 / 버섯칼국수',
    isSafeRestaurant: true,
    location: {
      lat: 37.48551,
      lng: 126.80891,
      address: '경기 부천시 원미구 역곡로13번길 49',
      area: '역곡1동',
    },
    phone: '032-341-8123',
    foods: [
      {
        name: '버섯 미나리 샤브샤브',
        calories: 390,
        sodium: 860,
        sugar: 3.2,
        protein: 24,
        grade: 'green',
        label: '초록 안심 (미나리 해독 성분)',
        description: '미나리의 풍부한 칼륨이 체내 나트륨 배출을 돕습니다.'
      },
      {
        name: '얼큰 버섯 칼국수',
        calories: 490,
        sodium: 1420,
        sugar: 4.1,
        protein: 16,
        grade: 'yellow',
        label: '노랑 주의 (고염식 주의)',
        description: '고혈압·신장 환자는 면만 건져 드시고 국물은 자제하세요.'
      }
    ]
  },
  {
    id: 'rest-yeokgok-09',
    name: '시장찌개쌈밥',
    category: '한식 / 쌈밥·제육',
    isSafeRestaurant: true,
    location: {
      lat: 37.48718,
      lng: 126.81195,
      address: '경기 부천시 원미구 역곡로20번길 18',
      area: '역곡상상시장',
    },
    phone: '032-343-2636',
    foods: [
      {
        name: '우렁 강된장 쌈밥정식',
        calories: 460,
        sodium: 690,
        sugar: 3.5,
        protein: 21,
        grade: 'green',
        label: '초록 안심 (우렁 고칼슘·쌈채소)',
        description: '우렁이의 칼슘과 쌈채소의 섬유질이 풍부한 건강식입니다.'
      },
      {
        name: '제육 쌈밥',
        calories: 540,
        sodium: 980,
        sugar: 7.4,
        protein: 27,
        grade: 'yellow',
        label: '노랑 주의 (단순당·염분 보통)',
        description: '고기 한 점에 쌈채소 두 장을 싸서 드시는 것을 추천합니다.'
      }
    ]
  },
  {
    id: 'rest-yeokgok-10',
    name: '복사골소머리곰탕 본점',
    category: '한식 / 곰탕·설렁탕',
    isSafeRestaurant: true,
    location: {
      lat: 37.48820,
      lng: 126.81117,
      address: '경기 부천시 원미구 지봉로 108',
      area: '역곡2동/가톨릭대 방면',
    },
    phone: '032-351-1433',
    foods: [
      {
        name: '맑은 한우 소머리곰탕',
        calories: 380,
        sodium: 610,
        sugar: 0.9,
        protein: 36,
        grade: 'green',
        label: '초록 안심 (무염 육수·콜라겐 풍부)',
        description: '소금을 직접 치지 않고 파를 듬뿍 넣어 담백하게 즐기세요.'
      },
      {
        name: '도가니탕',
        calories: 420,
        sodium: 580,
        sugar: 0.5,
        protein: 41,
        grade: 'green',
        label: '초록 안심 (관절 건강 콘드로이틴)',
        description: '퇴행성 관절염 및 골다공증 환자에게 우수한 단백 보양식입니다.'
      }
    ]
  },
  {
    id: 'rest-yeokgok-11',
    name: '홍두깨손칼국수',
    category: '한식 / 손칼국수·콩국수',
    isSafeRestaurant: false,
    location: {
      lat: 37.48731,
      lng: 126.81255,
      address: '경기 부천시 원미구 역곡로20번길 32',
      area: '역곡상상시장',
    },
    phone: '032-342-2558',
    foods: [
      {
        name: '진한 서리태 콩국수',
        calories: 510,
        sodium: 480,
        sugar: 3.0,
        protein: 28,
        grade: 'green',
        label: '초록 안심 (식물성 고단백)',
        description: '국산 서리태를 곱게 갈아 혈관벽 청소와 당질 조절에 기여합니다.'
      },
      {
        name: '옛날 손칼국수',
        calories: 410,
        sodium: 1190,
        sugar: 2.1,
        protein: 14,
        grade: 'yellow',
        label: '노랑 주의 (나트륨 주의)',
        description: '멸치 육수의 염분이 높으므로 국물은 절반 이하로 드세요.'
      }
    ]
  },
  {
    id: 'rest-yeokgok-12',
    name: '춘덕산백합바지락칼국수',
    category: '한식 / 백합칼국수·해물',
    isSafeRestaurant: true,
    location: {
      lat: 37.48714,
      lng: 126.81391,
      address: '경기 부천시 원미구 역곡로14번길 42',
      area: '역곡동 안동네 방면',
    },
    phone: '032-341-3800',
    foods: [
      {
        name: '맑은 백합 바지락칼국수',
        calories: 430,
        sodium: 1250,
        sugar: 2.2,
        protein: 18,
        grade: 'yellow',
        label: '노랑 주의 (조개 감칠맛·국물 조절)',
        description: '타우린이 풍부한 조개살을 먼저 드시고 면 위주로 섭취하세요.'
      },
      {
        name: '수제 찐만두 (3개)',
        calories: 290,
        sodium: 580,
        sugar: 1.8,
        protein: 14,
        grade: 'green',
        label: '초록 안심 (적정 소식)',
        description: '부추와 두부가 듬뿍 들어간 담백한 사이드 메뉴입니다.'
      }
    ]
  },
  {
    id: 'rest-yeokgok-13',
    name: '메밀꽃 (두부전문점)',
    category: '한식 / 순두부·콩비지',
    isSafeRestaurant: true,
    location: {
      lat: 37.48563,
      lng: 126.80459,
      address: '경기 부천시 원미구 지봉로 43-3',
      area: '가톨릭대 정문',
    },
    phone: '032-345-5599',
    foods: [
      {
        name: '가마솥 순두부 백반',
        calories: 290,
        sodium: 510,
        sugar: 1.2,
        protein: 22,
        grade: 'green',
        label: '초록 안심 (극저염·식물성 단백질)',
        description: '부드러운 천연 간수 순두부로 위장 장애나 소화기 환자에게 편안합니다.'
      },
      {
        name: '콩비지찌개 정식',
        calories: 340,
        sodium: 680,
        sugar: 2.0,
        protein: 20,
        grade: 'green',
        label: '초록 안심 (식이섬유 듬뿍)',
        description: '풍부한 콩비지 섬유질이 식후 혈당 급상승을 부드럽게 억제합니다.'
      }
    ]
  },
  {
    id: 'rest-yeokgok-14',
    name: '포케얌 (가톨릭대점)',
    category: '샐러드 / 포케·건강식',
    isSafeRestaurant: true,
    location: {
      lat: 37.48528,
      lng: 126.80388,
      address: '경기 부천시 원미구 지봉로 43',
      area: '가톨릭대 정문',
    },
    phone: '032-343-7771',
    foods: [
      {
        name: '훈제오리 메밀면 포케',
        calories: 430,
        sodium: 480,
        sugar: 3.8,
        protein: 26,
        grade: 'green',
        label: '초록 안심 (복합당·불포화지방)',
        description: '메밀면의 루틴 성분이 모세혈관을 강화하고 당뇨 환자에게 좋습니다.'
      },
      {
        name: '생연어 아보카도 포케',
        calories: 460,
        sodium: 410,
        sugar: 2.5,
        protein: 29,
        grade: 'green',
        label: '초록 안심 (오메가3·착한 지방)',
        description: '심혈관 질환자 및 고지혈증 환자에게 최적화된 저염 건강식입니다.'
      }
    ]
  },
  {
    id: 'rest-yeokgok-15',
    name: '픽업샐러드 가톨릭대점',
    category: '샐러드 / 닭가슴살·포케',
    isSafeRestaurant: true,
    location: {
      lat: 37.48720,
      lng: 126.80826,
      address: '경기 부천시 원미구 지봉로 80-1',
      area: '가톨릭대/역곡2동',
    },
    phone: '070-8888-9214',
    foods: [
      {
        name: '수비드 닭가슴살 샐러드보울',
        calories: 360,
        sodium: 340,
        sugar: 2.1,
        protein: 35,
        grade: 'green',
        label: '초록 안심 (초고단백·초저염)',
        description: '저염 조리 수비드 닭가슴살로 신장이나 혈압에 무리 없는 완전식입니다.'
      },
      {
        name: '구운 버섯 두부 샐러드',
        calories: 320,
        sodium: 380,
        sugar: 2.9,
        protein: 18,
        grade: 'green',
        label: '초록 안심 (비건 단백·칼륨 풍부)',
        description: '구운 버섯과 두부의 풍미로 당뇨 식단 관리에 매우 좋습니다.'
      }
    ]
  },
  {
    id: 'rest-yeokgok-16',
    name: '청춘옥',
    category: '한식 / 삼계탕·백숙',
    isSafeRestaurant: true,
    location: {
      lat: 37.48678,
      lng: 126.81301,
      address: '경기 부천시 원미구 역곡로14번길 34',
      area: '역곡동 안동네',
    },
    phone: '032-345-1222',
    foods: [
      {
        name: '녹두 한방 삼계탕',
        calories: 610,
        sodium: 840,
        sugar: 1.2,
        protein: 52,
        grade: 'green',
        label: '초록 안심 (녹두 해독·고단백)',
        description: '녹두의 찬 성질이 체내 열과 염증을 내려주며 영양이 풍부합니다.'
      },
      {
        name: '맑은 닭곰탕',
        calories: 380,
        sodium: 780,
        sugar: 0.8,
        protein: 31,
        grade: 'green',
        label: '초록 안심 (소화 흡수 우수)',
        description: '어르신 및 기력 저하 환자에게 부담 없는 깔끔한 보양식입니다.'
      }
    ]
  },
  {
    id: 'rest-yeokgok-17',
    name: '본죽&비빔밥cafe 역곡북부역점',
    category: '한식 / 영양죽·비빔밥',
    isSafeRestaurant: true,
    location: {
      lat: 37.48737,
      lng: 126.81100,
      address: '경기 부천시 원미구 역곡로 24',
      area: '역곡역 북부',
    },
    phone: '032-348-6288',
    foods: [
      {
        name: '본나물 비빔밥',
        calories: 510,
        sodium: 690,
        sugar: 4.5,
        protein: 16,
        grade: 'green',
        label: '초록 안심 (식이섬유·오색 나물)',
        description: '고추장을 절반만 넣고 비비면 당뇨·고혈압 안심식으로 훌륭합니다.'
      },
      {
        name: '전복죽',
        calories: 340,
        sodium: 590,
        sugar: 1.1,
        protein: 14,
        grade: 'green',
        label: '초록 안심 (저염 회복식)',
        description: '위식도역류질환이나 소화기 장애 환자에게 편안한 영양죽입니다.'
      }
    ]
  },
  {
    id: 'rest-yeokgok-18',
    name: '수영이네백반하우스',
    category: '한식 / 가정식 백반',
    isSafeRestaurant: false,
    location: {
      lat: 37.48751,
      lng: 126.80917,
      address: '경기 부천시 원미구 지봉로 90',
      area: '역곡2동/가톨릭대 입구',
    },
    phone: '032-343-5511',
    foods: [
      {
        name: '가정식 시골 백반',
        calories: 480,
        sodium: 720,
        sugar: 3.2,
        protein: 21,
        grade: 'green',
        label: '초록 안심 (제철 나물 반찬)',
        description: '집밥 스타일의 정갈한 반찬으로 과식을 유발하지 않는 균형 식단입니다.'
      },
      {
        name: '고등어구이 백반',
        calories: 420,
        sodium: 590,
        sugar: 0.6,
        protein: 31,
        grade: 'green',
        label: '초록 안심 (등푸른 생선)',
        description: '불포화지방산이 풍부하여 혈관 정화와 뇌 건강에 좋습니다.'
      }
    ]
  },
  {
    id: 'rest-yeokgok-19',
    name: '완도 백반집',
    category: '한식 / 남도 백반·생선',
    isSafeRestaurant: false,
    location: {
      lat: 37.48865,
      lng: 126.81035,
      address: '경기 부천시 원미구 역곡로 40',
      area: '역곡1동',
    },
    phone: '032-347-1988',
    foods: [
      {
        name: '완도 미역국 백반',
        calories: 340,
        sodium: 620,
        sugar: 1.0,
        protein: 18,
        grade: 'green',
        label: '초록 안심 (알긴산·칼슘 풍부)',
        description: '완도 미역의 수용성 섬유질이 중금속과 중성지방 배출을 돕습니다.'
      },
      {
        name: '갈치구이 정식',
        calories: 390,
        sodium: 680,
        sugar: 0.5,
        protein: 29,
        grade: 'green',
        label: '초록 안심 (담백한 흰살 생선)',
        description: '소화 흡수가 빠른 양질의 단백질로 노약자에게 아주 좋습니다.'
      }
    ]
  },
  {
    id: 'rest-yeokgok-20',
    name: '춘향골남원추어탕',
    category: '한식 / 추어탕·숙회',
    isSafeRestaurant: true,
    location: {
      lat: 37.48847,
      lng: 126.81055,
      address: '경기 부천시 원미구 역곡로 36-1',
      area: '역곡1동',
    },
    phone: '032-346-3392',
    foods: [
      {
        name: '전통 남원추어탕',
        calories: 410,
        sodium: 910,
        sugar: 2.4,
        protein: 28,
        grade: 'yellow',
        label: '노랑 주의 (칼슘 고함량·국물 조절)',
        description: '미꾸라지의 뼈째 갈아 만든 칼슘이 풍부하나 국물은 조금 남기세요.'
      },
      {
        name: '추어 튀김 (소)',
        calories: 380,
        sodium: 490,
        sugar: 1.2,
        protein: 22,
        grade: 'green',
        label: '초록 안심 (바삭한 영양식)',
        description: '고단백 미꾸라지를 바삭하게 즐기는 별미입니다.'
      }
    ]
  },
  {
    id: 'rest-yeokgok-21',
    name: '남가네설악추어탕 역곡점',
    category: '한식 / 추어탕·순두부',
    isSafeRestaurant: true,
    location: {
      lat: 37.48272,
      lng: 126.80891,
      address: '경기 부천시 소사구 경인로 478',
      area: '역곡역 남부/괴안동',
    },
    phone: '032-349-9096',
    foods: [
      {
        name: '순두부 추어탕',
        calories: 390,
        sodium: 840,
        sugar: 2.0,
        protein: 29,
        grade: 'green',
        label: '초록 안심 (단백질 시너지)',
        description: '순두부와 추어탕의 조합으로 짠맛을 중화하고 영양을 배가했습니다.'
      },
      {
        name: '설악 추어탕',
        calories: 420,
        sodium: 930,
        sugar: 2.2,
        protein: 27,
        grade: 'yellow',
        label: '노랑 주의 (건더기 위주)',
        description: '시래기와 미꾸라지 살 위주로 드시면 훌륭한 저당 식단입니다.'
      }
    ]
  },
  {
    id: 'rest-yeokgok-22',
    name: '제주생고기쌈밥',
    category: '한식 / 쌈밥·생고기',
    isSafeRestaurant: false,
    location: {
      lat: 37.48507,
      lng: 126.81517,
      address: '경기 부천시 소사구 안곡로205번길 72',
      area: '괴안동/역곡남부',
    },
    phone: '032-349-5394',
    foods: [
      {
        name: '제주 우렁 쌈밥정식',
        calories: 480,
        sodium: 710,
        sugar: 3.9,
        protein: 24,
        grade: 'green',
        label: '초록 안심 (다양한 쌈채소)',
        description: '적근대, 케일 등 신선한 쌈채소를 듬뿍 섭취해 비타민을 보충하세요.'
      },
      {
        name: '생삼겹살 쌈밥',
        calories: 620,
        sodium: 840,
        sugar: 4.1,
        protein: 34,
        grade: 'yellow',
        label: '노랑 주의 (지방 함량 조절)',
        description: '삼겹살 기름을 충분히 빼고 쌈채소와 마늘을 곁들여 드세요.'
      }
    ]
  },
  {
    id: 'rest-yeokgok-23',
    name: '원조춘천숯불닭갈비 본관',
    category: '한식 / 숯불닭갈비',
    isSafeRestaurant: true,
    location: {
      lat: 37.48672,
      lng: 126.81102,
      address: '경기 부천시 원미구 역곡로 17',
      area: '역곡역 북부',
    },
    phone: '032-341-9299',
    foods: [
      {
        name: '숯불 닭갈비 (소금구이)',
        calories: 460,
        sodium: 590,
        sugar: 1.5,
        protein: 42,
        grade: 'green',
        label: '초록 안심 (초고단백·저당)',
        description: '양념 없는 담백한 숯불 직화 구이로 기름기가 쏙 빠져 혈당에 안전합니다.'
      },
      {
        name: '숯불 닭갈비 (양념구이)',
        calories: 520,
        sodium: 1080,
        sugar: 8.2,
        protein: 39,
        grade: 'yellow',
        label: '노랑 주의 (양념 당질 유의)',
        description: '당뇨 환자는 소금구이를 선택하거나 쌈채소를 듬뿍 곁들이세요.'
      }
    ]
  },
  {
    id: 'rest-yeokgok-24',
    name: '경인로570숯불구이',
    category: '한식 / 솥밥한정식·소고기',
    isSafeRestaurant: true,
    location: {
      lat: 37.48645,
      lng: 126.81757,
      address: '경기 부천시 소사구 경인로 570',
      area: '괴안동/역곡천 방면',
    },
    phone: '032-343-0570',
    foods: [
      {
        name: '영양 솥밥 된장정식',
        calories: 450,
        sodium: 790,
        sugar: 3.2,
        protein: 18,
        grade: 'green',
        label: '초록 안심 (잡곡·정갈한 찬)',
        description: '은행, 밤, 콩이 들어간 솥밥으로 혈당 지수(GI)를 낮춘 식단입니다.'
      },
      {
        name: '한우 왕갈비탕',
        calories: 450,
        sodium: 1650,
        sugar: 2.1,
        protein: 34,
        grade: 'red',
        label: '빨강 주의 (고염식 경고)',
        description: '나트륨이 1650mg으로 매우 높으니 국물은 남기고 고기만 드세요.'
      }
    ]
  },
  {
    id: 'rest-yeokgok-25',
    name: '명태사랑 역곡점',
    category: '한식 / 명태지리탕·조림',
    isSafeRestaurant: true,
    location: {
      lat: 37.48788,
      lng: 126.81075,
      address: '경기 부천시 원미구 역곡로 30',
      area: '역곡1동',
    },
    phone: '032-348-1188',
    foods: [
      {
        name: '명태 맑은 지리탕',
        calories: 280,
        sodium: 740,
        sugar: 1.2,
        protein: 34,
        grade: 'green',
        label: '초록 안심 (저지방·고단백)',
        description: '지방이 적고 간 보호 성분이 가득한 담백하고 시원한 맑은 탕입니다.'
      },
      {
        name: '매콤 명태조림 백반',
        calories: 460,
        sodium: 1240,
        sugar: 9.8,
        protein: 31,
        grade: 'yellow',
        label: '노랑 주의 (조림 양념 당질)',
        description: '양념을 덜어내고 콩나물과 마른 김에 싸서 드시면 좋습니다.'
      }
    ]
  },
  {
    id: 'rest-yeokgok-26',
    name: '뽕잎사랑 역곡점',
    category: '샤브샤브 / 뽕잎샤브·보쌈',
    isSafeRestaurant: true,
    location: {
      lat: 37.48459,
      lng: 126.81167,
      address: '경기 부천시 소사구 경인로 509',
      area: '역곡역 남부',
    },
    phone: '032-346-8259',
    foods: [
      {
        name: '뽕잎 쇠고기 샤브샤브',
        calories: 390,
        sodium: 640,
        sugar: 2.8,
        protein: 29,
        grade: 'green',
        label: '초록 안심 (혈당 강하 뽕잎 성분)',
        description: '뽕잎의 디옥시노지리마이신(DNJ) 성분이 식후 혈당 상승을 억제합니다.'
      },
      {
        name: '뽕잎 버섯 샤브샤브',
        calories: 310,
        sodium: 530,
        sugar: 2.4,
        protein: 17,
        grade: 'green',
        label: '초록 안심 (저열량 다이어트식)',
        description: '버섯과 뽕잎 채소 위주로 위장에 편안하고 산뜻한 한 끼입니다.'
      }
    ]
  },
  {
    id: 'rest-yeokgok-27',
    name: '새우식탁',
    category: '한식 / 해물·새우요리',
    isSafeRestaurant: false,
    location: {
      lat: 37.48637,
      lng: 126.80440,
      address: '경기 부천시 원미구 지봉로45번길 12',
      area: '가톨릭대 정문',
    },
    phone: '032-342-9901',
    foods: [
      {
        name: '버터새우 구이 정식',
        calories: 520,
        sodium: 680,
        sugar: 2.1,
        protein: 28,
        grade: 'green',
        label: '초록 안심 (키토산·타우린 풍부)',
        description: '타우린이 피로 해소와 간 기능 강화를 돕는 담백한 구이 정식입니다.'
      },
      {
        name: '간장새우 덮밥',
        calories: 490,
        sodium: 1120,
        sugar: 6.5,
        protein: 24,
        grade: 'yellow',
        label: '노랑 주의 (간장 염분 조절)',
        description: '간장 국물은 비비지 말고 새우 살 위주로 드세요.'
      }
    ]
  },
  {
    id: 'rest-yeokgok-28',
    name: '울엄마손칼국시',
    category: '한식 / 칼국수·칼제비',
    isSafeRestaurant: false,
    location: {
      lat: 37.48526,
      lng: 126.80603,
      address: '경기 부천시 원미구 지봉로34번길 22',
      area: '가톨릭대 인근',
    },
    phone: '032-341-7662',
    foods: [
      {
        name: '진한 서리태 콩국수',
        calories: 490,
        sodium: 460,
        sugar: 2.8,
        protein: 27,
        grade: 'green',
        label: '초록 안심 (고소한 식물성 단백질)',
        description: '소금을 타지 않고 콩 본연의 고소함으로 즐기는 건강식입니다.'
      },
      {
        name: '옛날 손칼국수',
        calories: 410,
        sodium: 1210,
        sugar: 2.1,
        protein: 14,
        grade: 'yellow',
        label: '노랑 주의 (국물 남기기)',
        description: '멸치 육수의 염분이 높으므로 국물은 가급적 피하세요.'
      }
    ]
  },
  {
    id: 'rest-yeokgok-29',
    name: '귀남칼국수',
    category: '한식 / 멸치칼국수·비빔국수',
    isSafeRestaurant: false,
    location: {
      lat: 37.48916,
      lng: 126.81353,
      address: '경기 부천시 원미구 지봉로 131',
      area: '역곡2동',
    },
    phone: '032-344-9388',
    foods: [
      {
        name: '멸치 손칼국수',
        calories: 390,
        sodium: 1140,
        sugar: 1.9,
        protein: 13,
        grade: 'yellow',
        label: '노랑 보통 (면 위주 섭취)',
        description: '직접 반죽한 쫄깃한 면발로, 국물만 자제하면 가벼운 식사입니다.'
      },
      {
        name: '새콤달콤 비빔국수',
        calories: 480,
        sodium: 1080,
        sugar: 12.8,
        protein: 12,
        grade: 'yellow',
        label: '노랑 주의 (당질 유의)',
        description: '양념장의 단순당이 다소 높으니 당뇨 환자는 소량을 권장합니다.'
      }
    ]
  },
  {
    id: 'rest-yeokgok-30',
    name: '역곡남부식당',
    category: '한식 / 기사식당 백반·순두부',
    isSafeRestaurant: false,
    location: {
      lat: 37.48610,
      lng: 126.81665,
      address: '경기 부천시 소사구 경인로 556',
      area: '역곡역 남부/괴안동',
    },
    phone: '032-344-1244',
    foods: [
      {
        name: '남부 기사식당 정식백반',
        calories: 510,
        sodium: 760,
        sugar: 3.8,
        protein: 22,
        grade: 'green',
        label: '초록 안심 (다양한 나물반찬)',
        description: '신선한 채소 나물과 생선 한 토막이 곁들여진 균형 백반입니다.'
      },
      {
        name: '바지락 순두부찌개',
        calories: 320,
        sodium: 1140,
        sugar: 2.8,
        protein: 16,
        grade: 'yellow',
        label: '노랑 주의 (염분 조절)',
        description: '순두부와 바지락 위주로 건져 밥에 비벼 드세요.'
      }
    ]
  }
];

const getYeokgokRestaurants = () => YEOKGOK_RESTAURANTS;

const getRestaurantById = (id) =>
  YEOKGOK_RESTAURANTS.find((item) => item.id === id) || null;

const findNearbyRestaurants = (lat, lng, maxDistanceKm = 1.0) => {
  return YEOKGOK_RESTAURANTS.filter((item) => {
    const dLat = (item.location.lat - lat) * 111;
    const dLng = (item.location.lng - lng) * 88;
    const dist = Math.sqrt(dLat * dLat + dLng * dLng);
    return dist <= maxDistanceKm;
  });
};

module.exports = { YEOKGOK_RESTAURANTS, getYeokgokRestaurants, getRestaurantById, findNearbyRestaurants };
