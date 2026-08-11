import type { Painting } from './types';

/**
 * 정조 《화성능행도》(華城陵幸圖) — 1795년 정조의 화성 행차를 그린 병풍화.
 * 원본 이미지: 사용자가 제공한 viewer1.jpg (전체 병풍 중 화성행궁 도착 장면 부근으로 추정되는 부분).
 * 핫스팟 라벨은 이 그림 갈래(반차도·능행도류)에서 일반적으로 쓰이는 명칭으로 표기했습니다 —
 * 그림 속 개별 인물을 "이 사람이 정조다"처럼 단정하지 않고, 장면 단위로 안내합니다.
 */
export const PAINTINGS: Record<string, Painting> = {
  hwaseonghc: {
    workId: 'hwaseonghc',
    title: '화성능행도 (華城陵幸圖)',
    imageSrc: '/hwaseong-neunghaengdo.jpg',
    caption: '정조가 1795년 화성에 행차한 여정을 담은 병풍화의 일부입니다. 김홍도가 도설을 제작해 「원행을묘정리의궤」에 담았고, 김득신·이인문 등이 병풍으로 옮긴 것으로 전해집니다.',
    hotspots: [
      { id: 'h1', label: '화성행궁', x: 48, y: 15, heritageId: 'hwaseong', desc: '혜경궁 홍씨의 회갑을 기리는 진찬례가 열린 화성행궁 일원입니다.' },
      { id: 'h2', label: '어가 행렬', x: 48, y: 38, heritageId: 'hwaseong', desc: '행궁 문을 지나는 어가와 수행 인원의 행렬입니다.' },
      { id: 'h3', label: '의장 행렬', x: 45, y: 65, heritageId: 'hwaseong', desc: '깃발과 병장기를 갖춘 의장(儀仗) 행렬로, 국왕 행차의 격식을 보여줍니다.' },
      { id: 'h4', label: '호위 기마대', x: 82, y: 60, heritageId: 'hwaseong', desc: '행렬을 호위하는 기마 관료와 군사들입니다.' },
    ],
  },
};

export function paintingByWorkId(workId: string): Painting | undefined {
  return PAINTINGS[workId];
}
