export interface PaintingHotspot {
  id: string;
  label: string;
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  heritageId: string;
  desc: string;
}

export interface Painting {
  workId: string;
  title: string;
  /** Path (under /public) to the artwork image. Omit to fall back to the abstract mock illustration. */
  imageSrc?: string;
  /** Shown next to the artwork: real attribution/provenance when imageSrc is set, or a "this is a mock" disclaimer otherwise. */
  caption: string;
  hotspots: PaintingHotspot[];
}
