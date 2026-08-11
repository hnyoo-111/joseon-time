import { PaintingIllustration } from './PaintingIllustration';

/** Renders the real artwork image when available, falling back to the abstract mock illustration otherwise. */
export function PaintingArtwork({ imageSrc, title }: { imageSrc?: string; title: string }) {
  if (imageSrc) {
    return <img src={imageSrc} alt={title} style={{ width: '100%', height: 'auto', display: 'block' }} />;
  }
  return <PaintingIllustration />;
}
