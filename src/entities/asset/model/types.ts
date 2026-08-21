export type AssetStatus = 'draft' | 'in_review' | 'published';

export interface Asset {
  id: string;
  regionId: string;
  title: string;
  description?: string;
  category?: string;
  lon: number | null;
  lat: number | null;
  status: AssetStatus;
  modelUrl?: string;
  thumbnailUrl?: string;
  createdAt: string;
}

export const STATUS_LABEL: Record<AssetStatus, string> = {
  draft: '임시저장',
  in_review: '검수중',
  published: '공개',
};
