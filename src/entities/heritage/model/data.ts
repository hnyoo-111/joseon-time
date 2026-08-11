import type { Heritage } from './types';

export const HERITAGES: Heritage[] = [
  {
    id: 'gyeongbok', name: '경복궁', hanja: '景福宮', type: 'palace', tagline: '조선 왕조의 법궁',
    address: '서울 종로구', year: '1395년 건립', lon: 126.9770, lat: 37.5796, height: 38,
    kings: ['taejo', 'sejong'], unesco: false,
    desc: '태조 이성계가 한양 천도와 함께 세운 조선 왕조의 법궁입니다. 임진왜란으로 소실되었다가 고종 대에 흥선대원군에 의해 중건되었으며, 근정전·경회루 등 조선 궁궐 건축의 정수를 보여줍니다.',
  },
  {
    id: 'changdeok', name: '창덕궁', hanja: '昌德宮', type: 'palace', tagline: '조선 왕들이 가장 오래 머문 궁궐',
    address: '서울 종로구', year: '1405년 건립', lon: 126.9910, lat: 37.5794, height: 44,
    kings: ['yeongjo', 'jeongjo'], unesco: true,
    desc: '태종이 세운 이궁으로, 자연 지형을 그대로 살린 배치와 후원(비원)으로 유명합니다. 임진왜란 이후 조선 왕들이 가장 오래 머문 궁궐로, 1997년 유네스코 세계유산으로 등재되었습니다.',
  },
  {
    id: 'changgyeong', name: '창경궁', hanja: '昌慶宮', type: 'palace', tagline: '대비를 위해 지은 궁궐, 궁중 암투의 무대',
    address: '서울 종로구', year: '1483년 건립', lon: 126.9954, lat: 37.5786, height: 40,
    kings: ['sukjong'], unesco: false,
    desc: '성종이 세 대비를 모시기 위해 지은 궁궐로, 일제강점기에 동물원·식물원이 들어서며 창경원으로 격하되는 수난을 겪었습니다. 이후 복원 사업을 통해 원래의 모습을 되찾아가고 있습니다.',
  },
  {
    id: 'hwaseong', name: '수원화성', hanja: '水原華城', type: 'fortress', tagline: '정조의 효심과 개혁이 담긴 신도시 성곽',
    address: '경기 수원시', year: '1796년 완공', lon: 127.0122, lat: 37.2850, height: 75,
    kings: ['jeongjo'], unesco: true,
    desc: '정조가 아버지 사도세자를 향한 효심과 개혁 정치의 이상을 담아 축성한 신도시 성곽입니다. 서양식 축성 기술과 전통 성곽 양식을 조화시킨 건축물로, 1997년 유네스코 세계유산으로 등재되었습니다.',
  },
  {
    id: 'namhan', name: '남한산성', hanja: '南漢山城', type: 'fortress', tagline: '병자호란, 47일의 항전이 벌어진 산성',
    address: '경기 광주시', year: '조선 전기 축성', lon: 127.1832, lat: 37.4795, height: 495,
    kings: ['injo'], unesco: true,
    desc: '조선 전기에 축성되어 병자호란 당시 인조가 47일간 항전했던 산성입니다. 조선의 축성술과 방어 전략을 보여주는 대표적 유적으로, 2014년 유네스코 세계유산으로 등재되었습니다.',
  },
  {
    id: 'jongmyo', name: '종묘', hanja: '宗廟', type: 'shrine', tagline: '역대 왕과 왕비의 신주를 모신 사당',
    address: '서울 종로구', year: '1395년 건립', lon: 126.9946, lat: 37.5747, height: 32,
    kings: ['gwanghae'], unesco: true,
    desc: '조선 역대 왕과 왕비의 신주를 모신 유교 사당입니다. 정전과 영녕전으로 구성되며, 매년 종묘제례가 봉행됩니다. 1995년 유네스코 세계유산으로 등재되었습니다.',
  },
  {
    id: 'uldolmok', name: '울돌목', hanja: '鳴梁海峽', type: 'site', tagline: '12척으로 왜군을 물리친 명량대첩의 현장',
    address: '전남 진도군', year: '1597년 해전', lon: 126.3020, lat: 34.4740, height: 12,
    kings: ['seonjo'], unesco: false,
    desc: '진도와 해남 사이의 좁은 해협으로, 거센 물살을 이용해 이순신이 12척의 배로 왜의 대함대를 물리친 명량대첩의 현장입니다.',
  },
  {
    id: 'cheongnyeongpo', name: '청령포', hanja: '淸泠浦', type: 'site', tagline: '단종이 유배되었던 삼면이 강으로 둘러싸인 절해고도',
    address: '강원 영월군', year: '1457년 유배지', lon: 128.4693, lat: 37.1863, height: 10,
    kings: ['danjong'], unesco: false,
    desc: '남한강 지류가 삼면을 휘감고 한쪽은 험한 절벽으로 막혀 있어, 나룻배 없이는 드나들 수 없던 곳입니다. 노산군으로 강봉된 단종이 1457년 유배되어 두 달여를 지냈습니다. 명승 제50호로 지정되어 있습니다.',
  },
  {
    id: 'gwanpungheon', name: '관풍헌', hanja: '觀風軒', type: 'site', tagline: '단종이 최후를 맞은 영월 관아',
    address: '강원 영월군', year: '조선 전기 건립', lon: 128.4630, lat: 37.1838, height: 10,
    kings: ['danjong'], unesco: false,
    desc: '영월 관아의 객사로, 홍수로 청령포가 물에 잠기자 단종이 거처를 옮긴 곳입니다. 1457년 사육신의 단종 복위 운동이 발각된 뒤 단종이 최후를 맞은 곳으로 전해집니다.',
  },
  {
    id: 'jangneung', name: '장릉', hanja: '莊陵', type: 'tomb', tagline: '단종의 능, 훗날 왕으로 복위되어 조성된 왕릉',
    address: '강원 영월군', year: '1698년 왕릉 조성', lon: 128.4738, lat: 37.2003, height: 10,
    kings: ['danjong'], unesco: true,
    desc: '단종이 묻힌 능입니다. 죽은 뒤 오랫동안 왕으로 인정받지 못하다가 1698년(숙종 24년) 단종으로 복위되면서 왕릉의 격식을 갖추게 되었습니다. 조선왕릉의 일부로 2009년 유네스코 세계유산으로 등재되었습니다.',
  },
];

export function heritageById(id: string): Heritage | undefined {
  return HERITAGES.find((h) => h.id === id);
}
export function heritagesOfKing(kingId: string): Heritage[] {
  return HERITAGES.filter((h) => h.kings.includes(kingId));
}
