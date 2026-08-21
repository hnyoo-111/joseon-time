export type HeritageType = 'palace' | 'fortress' | 'shrine' | 'tomb' | 'temple' | 'site';

export interface Heritage {
  id: string;
  name: string;
  hanja: string;
  type: HeritageType;
  tagline: string;
  address: string;
  year: string;
  lon: number;
  lat: number;
  height: number;
  kings: string[];
  unesco: boolean;
  desc: string;
  imageUrl?: string;
}

export const TYPE_LABEL: Record<HeritageType, string> = {
  palace: '궁궐',
  fortress: '성곽',
  shrine: '사당',
  tomb: '왕릉',
  temple: '사찰',
  site: '역사적 장소',
};
