export type WorkCategory = 'movie' | 'drama' | 'lit' | 'art';

export interface WorkTimelineEntry { y: string; e: string; }

export interface Work {
  id: string;
  title: string;
  cat: WorkCategory;
  year: string;
  kings: string[];
  heritages: string[];
  figures: string[];
  tagline: string;
  desc?: string;
  timeline?: WorkTimelineEntry[];
  /** public/works/{id}.jpg 같은 경로. 없으면 카테고리 아이콘으로 대체 표시됩니다. */
  posterUrl?: string;
}

export const CAT_LABEL: Record<WorkCategory, string> = {
  movie: '영화',
  drama: '드라마',
  lit: '문학',
  art: '회화',
};
