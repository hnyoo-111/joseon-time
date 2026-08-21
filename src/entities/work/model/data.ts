import type { Work } from './types';

export const WORKS: Work[] = [
  { id: 'yukryong', title: '육룡이 나르샤', cat: 'drama', year: '2015', kings: ['taejo'], heritages: ['gyeongbok'], figures: ['태조 이성계', '정도전'], tagline: '조선 건국 전야, 여섯 용의 이야기', posterUrl: '/works/yukryong.jpg' },
  { id: 'ppuri', title: '뿌리깊은 나무', cat: 'drama', year: '2011', kings: ['sejong'], heritages: ['gyeongbok'], figures: ['세종'], tagline: '한글 창제를 둘러싼 궁중 미스터리', posterUrl: '/works/ppuri.jpg' },
  { id: 'wanggwa-saneun-namja', title: '왕과 사는 남자', cat: 'movie', year: '2026', kings: ['danjong'], heritages: ['cheongnyeongpo'], figures: ['단종(이홍위)', '엄흥도'], tagline: '유배된 단종(이홍위)과 그를 몰래 돌본 영월의 촌로 엄흥도의 실화를 그린 사극', desc: '세조의 찬위 이후 노산군으로 강봉되어 청령포로 유배된 단종과, 그를 숨어서 돌본 영월 산골 마을 촌장 엄흥도의 이야기를 그렸습니다. 장항준 감독의 첫 사극 영화로 2026년 2월 개봉해 천만 관객을 넘겼고, 제62회 백상예술대상에서 대상을 수상했습니다.', posterUrl: '/works/wanggwa-saneun-namja.jpg' },
  { id: 'ilwolobongdo', title: '일월오봉도', cat: 'art', year: '조선 후기', kings: ['sejong', 'jeongjo'], heritages: ['gyeongbok', 'changdeok'], figures: [], tagline: '해와 달, 다섯 봉우리로 왕의 권위를 상징하는 어좌 병풍화', desc: '왕의 자리 뒤에 놓여 왕권과 우주 질서를 상징한 궁중 회화입니다.' },
  { id: 'sado', title: '사도', cat: 'movie', year: '2015', kings: ['yeongjo', 'jeongjo'], heritages: ['changdeok'], figures: ['영조', '사도세자', '혜경궁 홍씨'], tagline: '조선 제22대 왕 정조의 아버지, 사도세자의 비극', timeline: [{ y: '1762', e: '사도세자, 뒤주에 갇혀 사망' }, { y: '1776', e: '정조 즉위' }], posterUrl: '/works/sado.jpg' },
  { id: 'gureumi', title: '구르미 그린 달빛', cat: 'drama', year: '2016', kings: ['jeongjo'], heritages: ['changdeok'], figures: ['정조'], tagline: '세손 시절 정조의 궁중 로맨스' },
  { id: 'hanjungnok', title: '한중록', cat: 'lit', year: '1795~1805 저술', kings: ['yeongjo', 'jeongjo'], heritages: ['changdeok'], figures: ['혜경궁 홍씨'], tagline: '혜경궁 홍씨가 남긴 궁중 회고록', desc: '영조와 사도세자, 정조 대의 궁중사를 며느리이자 어머니의 시선으로 기록했습니다.' },
  { id: 'donggwoldo', title: '동궐도', cat: 'art', year: '19세기 초', kings: [], heritages: ['changdeok'], figures: [], tagline: '창덕궁과 창경궁을 그린 궁궐 조감도', desc: '19세기 초 제작된 것으로 추정되는 대형 궁궐 기록화입니다.' },
  { id: 'dongyi', title: '동이', cat: 'drama', year: '2010', kings: ['sukjong'], heritages: ['changgyeong'], figures: ['숙종', '동이'], tagline: '숙종과 무수리 출신 동이의 이야기' },
  { id: 'daebak', title: '대박', cat: 'drama', year: '2016', kings: ['sukjong'], heritages: ['changgyeong'], figures: ['숙종'], tagline: '숙종 대 왕자들의 왕위 다툼' },
  { id: 'inhyeon', title: '인현왕후전', cat: 'lit', year: '조선 후기', kings: ['sukjong'], heritages: ['changgyeong'], figures: ['숙종', '인현왕후', '장희빈'], tagline: '숙종과 인현왕후, 장희빈을 둘러싼 궁중 암투를 그린 고전소설' },
  { id: 'isan', title: '이산', cat: 'drama', year: '2007', kings: ['jeongjo'], heritages: ['hwaseong', 'changdeok'], figures: ['정조'], tagline: '조선 제22대 왕 정조를 다룬 작품', timeline: [{ y: '1776', e: '정조 즉위' }, { y: '1795', e: '화성행차' }, { y: '1796', e: '수원화성 완공' }] },
  { id: 'hwaseonghc', title: '화성능행도', cat: 'art', year: '1795년경', kings: ['jeongjo'], heritages: ['hwaseong'], figures: ['정조', '혜경궁 홍씨'], tagline: '정조가 어머니 혜경궁 홍씨를 모시고 화성에 행차한 여정을 그린 병풍화',
    desc: '정조가 1795년 윤2월 9일부터 16일까지 8일간 어머니 혜경궁 홍씨를 모시고 부친 사도세자의 원소 현륭원에 행차한 뒤 화성행궁에서 성대한 진찬례를 베푼 일을 그렸습니다. 1795년은 사도세자와 혜경궁 홍씨의 탄신 일주갑이 되는 해로, 정조는 세심한 배려와 치밀한 계획 아래 이 행사를 준비했습니다. 김홍도가 도설을 제작해 「원행을묘정리의궤」에 담았고, 이를 바탕으로 김득신·최득현·이인문·이명규·장한종·허식 등이 병풍으로 제작한 것으로 전해집니다. 국왕의 친림과 호위 군사, 관료, 구경 나온 백성까지 다양한 인물을 생동감 있게 담아 조선 후기 기록화의 백미로 꼽힙니다.' },
  { id: 'namhansanseong', title: '남한산성', cat: 'movie', year: '2017', kings: ['injo'], heritages: ['namhan'], figures: ['인조', '최명길', '김상헌'], tagline: '병자호란, 항전과 항복 사이의 47일', timeline: [{ y: '1636', e: '병자호란 발발, 남한산성 籠城' }, { y: '1637', e: '삼전도 항복' }] },
  { id: 'gwanghae', title: '광해, 왕이 된 남자', cat: 'movie', year: '2012', kings: ['gwanghae'], heritages: ['jongmyo'], figures: ['광해군'], tagline: '왕의 자격을 묻는 대역 이야기' },
  { id: 'myeongryang', title: '명량', cat: 'movie', year: '2014', kings: ['seonjo'], heritages: ['uldolmok'], figures: ['선조', '이순신'], tagline: '12척의 배로 왜군을 물리친 명량대첩', timeline: [{ y: '1597', e: '정유재란, 명량해전' }] },
];

export function workById(id: string): Work | undefined {
  return WORKS.find((w) => w.id === id);
}
export function heritageWorks(heritageId: string): Work[] {
  return WORKS.filter((w) => w.heritages.includes(heritageId));
}
