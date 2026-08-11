export interface JourneyStep {
  id: string;
  phase: string;
  title: string;
  year: string;
  lon: number;
  lat: number;
  height: number;
  desc: string;
  heritageId?: string;
  /** true when this step's location is an approximation — must be disclosed in the UI, never presented as verified fact. */
  mock?: boolean;
  mockNote?: string;
  painting?: boolean;
  workId?: string;
  relatedWorks?: string[];
}

export interface Journey {
  id: string;
  year: string;
  title: string;
  subtitle: string;
  heroLine: string;
  kingId: string;
  steps: JourneyStep[];
}
