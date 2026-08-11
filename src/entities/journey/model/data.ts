import type { Journey } from './types';

/**
 * Time Travel 시나리오 두 편.
 * ※ 프로토타입용 mock 데이터입니다. 핵심 서사(누가·언제·왜)는 실제 역사 기록에 근거하되,
 * 경유지 등 정확한 GPS 좌표가 확인되지 않은 지점은 근사 배치하고 각 스텝에 mock 표시를 남겼습니다.
 *
 * - 1795 정조의 화성행차: 출발지(창덕궁)·목적지(수원화성)·행차 목적(현륭원 참배, 혜경궁 홍씨 회갑연)·
 *   8일 여정·한강 배다리(주교) 이용 등은 「원행을묘정리의궤」에 근거.
 * - 1457 단종의 유배길: 폐위(1455)·유배(1457)·청령포·관풍헌·장릉(1698년 복위 후 조성)은 정사에 근거.
 *   「통곡의 길」은 영월군이 조성한 현대 트레일(단종유배길)의 구간명을 참고.
 */
export const JOURNEYS: Journey[] = [
  {
    id: 'hwaseonghaenghaeng',
    year: '1795',
    title: '정조의 화성행차',
    subtitle: '창덕궁에서 수원화성까지',
    heroLine: '정조는 어머니 혜경궁 홍씨와 함께 화성을 향한 여정을 시작합니다.',
    kingId: 'jeongjo',
    steps: [
      { id: 's1', phase: '출발', title: '창덕궁', year: '1795', lon: 126.9910, lat: 37.5794, height: 44, heritageId: 'changdeok', desc: '정조는 어머니 혜경궁 홍씨의 회갑을 기념하고 아버지 사도세자의 묘소 현륭원을 참배하기 위해 창덕궁을 나서 화성으로 향합니다.' },
      { id: 's2', phase: '경유', title: '한강 배다리', year: '1795', lon: 126.9410, lat: 37.5130, height: 10, mock: true, mockNote: '경유지의 정확한 위경도는 남아있는 기록만으로 확인하기 어려워, 배다리가 놓였던 노량진 인근으로 근사 배치한 프로토타입용 참고 위치입니다.', desc: '한강을 건너기 위해 배를 여러 척 엮어 만든 임시 다리, 배다리(舟橋)를 건넙니다. 대규모 행렬의 도하를 위한 당대의 토목 기술이 집약된 순간입니다.' },
      { id: 's3', phase: '도착', title: '수원화성', year: '1795', lon: 127.0122, lat: 37.2850, height: 75, heritageId: 'hwaseong', desc: '8일간의 여정 끝에 새로운 성곽 도시 화성에 도착합니다. 정조가 개혁의 이상을 담아 새로 쌓은 도시입니다.' },
      { id: 's4', phase: '행사', title: '화성행궁', year: '1795', lon: 127.0099, lat: 37.2839, height: 60, mock: true, mockNote: '화성행궁의 좌표는 정확한 실측값이 아니라 수원화성 인근으로 근사 배치한 참고 위치입니다.', desc: '화성행궁 봉수당에서 혜경궁 홍씨의 회갑을 기리는 진찬연(회갑연)이 성대하게 열립니다. 조선 후기 최대 규모의 왕실 행사 중 하나입니다.' },
      { id: 's5', phase: '기록', title: '화성능행도', year: '1795년경', lon: 127.0122, lat: 37.2850, height: 75, painting: true, workId: 'hwaseonghc', desc: '이 여정은 병풍화 「화성능행도」로 기록되어 오늘날까지 전해집니다. 그림 속 장소를 실제 지도에서 찾아볼 수 있습니다.' },
      { id: 's6', phase: '오늘날', title: '오늘날의 이야기', year: '2007 · 1795', lon: 127.0122, lat: 37.2850, height: 75, relatedWorks: ['isan', 'hwaseonghc'], desc: '이 여정은 오늘날 드라마 「이산」 등 다양한 콘텐츠로 재해석되어 우리에게 전해지고 있습니다.' },
    ],
  },
  {
    id: 'danjong-yubae',
    year: '1457',
    title: '단종의 유배길',
    subtitle: '청령포에서 장릉까지',
    heroLine: '열다섯 어린 임금은 상왕의 자리에서 밀려나 영월 청령포로 향합니다.',
    kingId: 'danjong',
    steps: [
      { id: 'd1', phase: '유배 길', title: '통곡의 길', year: '1457', lon: 128.35, lat: 37.22, height: 300, mock: true,
        mockNote: '영월군이 지정한 「단종유배길」 트레일의 한 구간 이름입니다. 정확한 역사적 좌표가 아닌, 오늘날 트레일 지도(솔치재~주천3층석탑 인근)를 참고해 근사 배치했습니다.',
        desc: '오늘날 영월군은 단종의 이야기를 따라 걷는 「단종유배길」을 조성했습니다. 그중 한 구간은 「통곡의 길」이라 불립니다.' },
      { id: 'd2', phase: '유배', title: '청령포', year: '1457', lon: 128.4693, lat: 37.1863, height: 10, heritageId: 'cheongnyeongpo',
        desc: '노산군으로 강봉된 단종은 삼면이 강으로 둘러싸이고 한쪽은 절벽인 청령포에 유배됩니다. 배 없이는 드나들 수 없는 고립된 곳이었습니다.' },
      { id: 'd3', phase: '이거', title: '관풍헌', year: '1457', lon: 128.4630, lat: 37.1838, height: 10, heritageId: 'gwanpungheon', mock: true,
        mockNote: '관풍헌의 좌표는 실측값이 아니라 영월읍 일대로 근사 배치한 참고 위치입니다.',
        desc: '그해 여름 홍수로 청령포가 물에 잠기자, 단종은 영월 관아인 관풍헌으로 거처를 옮깁니다.' },
      { id: 'd4', phase: '사건', title: '사사(賜死)', year: '1457', lon: 128.4630, lat: 37.1838, height: 10, mock: true,
        mockNote: '사건이 벌어진 정확한 지점은 관풍헌 인근으로 추정될 뿐, 별도로 확정된 좌표가 아닙니다.',
        desc: '사육신의 단종 복위 운동이 발각된 뒤 단종은 서인으로 강봉되었고, 그해 관풍헌에서 열일곱의 짧은 생을 마감합니다.' },
      { id: 'd5', phase: '기억', title: '장릉', year: '1698년 왕릉 조성', lon: 128.4738, lat: 37.2003, height: 10, heritageId: 'jangneung',
        desc: '단종이 묻힌 곳입니다. 죽은 지 241년 만인 1698년(숙종 24년) 왕으로 복위되면서 왕릉의 격식을 갖췄고, 오늘날 조선왕릉의 일부로 유네스코 세계유산에 올라 있습니다.' },
      { id: 'd6', phase: '오늘날', title: '오늘날의 이야기', year: '2011 · 1457', lon: 128.4693, lat: 37.1863, height: 10, relatedWorks: ['gongjuui-namja'],
        desc: '단종을 폐위시킨 계유정난과 그 전후의 이야기는 오늘날 드라마 「공주의 남자」 등 다양한 콘텐츠로 재해석되고 있습니다.' },
    ],
  },
];

export const JOURNEY_BY_HERITAGE: Record<string, string> = {
  hwaseong: 'hwaseonghaenghaeng',
  changdeok: 'hwaseonghaenghaeng',
  cheongnyeongpo: 'danjong-yubae',
  gwanpungheon: 'danjong-yubae',
  jangneung: 'danjong-yubae',
};

export function journeyById(id: string): Journey | undefined {
  return JOURNEYS.find((j) => j.id === id);
}
