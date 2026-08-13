export interface Artifact {
  /** 자산 서버의 폴더명. 모델 URL 을 만드는 유일한 키다. */
  folder: string;
  sketchfabUid: string;
  nameEn: string;
  nameKo: string | null;
  description: string;
  descriptionSource: string | null;
  categories: string[];
  tags: string[];
  thumbnail: string;
  thumbnailSmall: string;
  viewerUrl: string;
  license: string;
  faceCount: number;
  /** 폴리곤 규모 등급(A~D). 배치 설계 문서의 등급 체계와 동일하다. */
  class: string;
  site: string | null;

  // -- 한글명 출처 추적 ------------------------------------------------------
  // 'sketchfab' = 원천 설명문에 박힌 공식 표기, 'khs-llm' = 국가유산청 목록에서 LLM 이 고른 것.
  // 후자는 confidence 로 자동확정 여부가 갈리므로, 미확정이면 화면에 '추정'으로 표시한다.
  nameKoSource?: 'sketchfab' | 'khs-llm' | null;
  /** 소속유산 접두어까지 포함한 국가유산청 원문 표기(예: '경복궁 향곶이'). */
  nameKoFull?: string;
  nameKoConfidence?: number;
  nameKoConfirmed?: boolean;
  nameKoWhy?: string;
}

/** 한글명이 검수되지 않은 LLM 추정치인가 — 그대로 확정 표기하면 안 되는 것들. */
export function isNameKoTentative(a: Artifact): boolean {
  return a.nameKoSource === 'khs-llm' && a.nameKoConfirmed !== true;
}

/** 카드/모달에 노출할 이름 — 국문명이 없는 표본이 많아 영문명으로 대체한다. */
export function artifactLabel(a: Artifact): string {
  return a.nameKo ?? a.nameEn;
}
