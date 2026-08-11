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
}

export const CAT_LABEL: Record<WorkCategory, string> = {
  movie: '영화',
  drama: '드라마',
  lit: '문학',
  art: '회화',
};
