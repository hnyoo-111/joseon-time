import artifacts from './artifacts.json';
import type { Artifact } from './types';

export const ARTIFACTS: Artifact[] = artifacts.artifacts as Artifact[];

export function artifactByFolder(folder: string): Artifact | undefined {
  return ARTIFACTS.find((a) => a.folder === folder);
}
