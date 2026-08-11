import type { HistoricalEvent } from './types';

export const EVENTS: HistoricalEvent[] = [
  { id: 'eulmyo', title: '을묘원행', year: '1795', kings: ['jeongjo'], heritages: ['hwaseong'], works: ['hwaseonghc', 'isan'], desc: '정조가 어머니 혜경궁 홍씨와 함께 아버지 사도세자의 묘소 현륭원을 참배하고, 화성행궁에서 회갑연을 올리기 위해 화성으로 떠난 8일간의 행차입니다. 「원행을묘정리의궤」에 상세히 기록되었습니다.' },
  { id: 'byeongja', title: '병자호란', year: '1636–1637', kings: ['injo'], heritages: ['namhan'], works: ['namhansanseong'], desc: '청의 침공에 맞서 인조가 남한산성에서 47일간 항전하다 삼전도에서 항복한 사건입니다.' },
  { id: 'myeongnyang-battle', title: '명량대첩', year: '1597', kings: ['seonjo'], heritages: ['uldolmok'], works: ['myeongryang'], desc: '이순신이 12척의 배로 왜의 대함대를 물리친 정유재란의 결정적 해전입니다.' },
  { id: 'hangeul', title: '훈민정음 반포', year: '1446', kings: ['sejong'], heritages: ['gyeongbok'], works: ['ppuri'], desc: '세종이 백성을 위해 창제한 새로운 문자, 훈민정음을 세상에 반포한 사건입니다.' },
  { id: 'injobanjeong', title: '인조반정', year: '1623', kings: ['gwanghae', 'injo'], heritages: ['jongmyo'], works: ['gwanghae'], desc: '서인 세력이 광해군을 몰아내고 인조를 왕위에 올린 정변입니다.' },
  { id: 'gisahwanguk', title: '기사환국', year: '1689', kings: ['sukjong'], heritages: ['changgyeong'], works: ['inhyeon', 'dongyi', 'daebak'], desc: '장희빈 소생 왕자의 원자 책봉을 둘러싸고 서인이 축출되고 남인이 집권한 정치적 사건입니다.' },
  { id: 'danjong-pyewi', title: '단종의 폐위와 유배', year: '1455–1457', kings: ['danjong'], heritages: ['cheongnyeongpo', 'gwanpungheon'], works: ['gongjuui-namja'], desc: '숙부 수양대군이 계유정난(1453)으로 실권을 장악한 뒤, 1455년 12살 단종을 강제로 퇴위시켰습니다. 1457년 사육신의 복위 운동이 발각되자 노산군으로 강봉되어 청령포로 유배되었고, 그해 관풍헌에서 짧은 생을 마쳤습니다.' },
];

export function eventById(id: string): HistoricalEvent | undefined {
  return EVENTS.find((e) => e.id === id);
}
export function heritageEvents(heritageId: string): HistoricalEvent[] {
  return EVENTS.filter((e) => e.heritages.includes(heritageId));
}
export function eventOfWork(workId: string): HistoricalEvent | undefined {
  return EVENTS.find((e) => e.works.includes(workId));
}
