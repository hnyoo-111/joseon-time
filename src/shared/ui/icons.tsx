import type { HeritageType } from '@/entities/heritage';
import type { WorkCategory } from '@/entities/work';

const TYPE_PATHS: Record<HeritageType, string> = {
  palace: 'M3 21h18M4 21V9l8-5 8 5v12M4 9l8 5 8-5',
  fortress: 'M4 21V11h3V9h2v2h2V9h2v2h2V9h2v2h3v10z',
  shrine: 'M4 8h16M6 8V6l6-2 6 2v2M7 8v13M17 8v13M4 21h16',
  tomb: 'M3 21c0-5 4-9 9-9s9 4 9 9M3 21h18',
  temple: 'M12 2l3 4H9zM7 6h10l2 4H5zM4 10h16l1 4H3zM6 14h12v7H6z',
  site: 'M6 21V4l11 4-6 3 6 3-11 4',
};

export function TypeIcon({ type, color = '#fff', size = 16 }: { type: HeritageType; color?: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size}>
      <path d={TYPE_PATHS[type]} fill="none" stroke={color} strokeWidth={1.7} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function KingIcon({ color = '#fff', size = 16 }: { color?: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size}>
      <path d="M3 8l4 3 5-6 5 6 4-3-2 11H5z" fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
    </svg>
  );
}

export function EventIcon({ color = '#fff', size = 20 }: { color?: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size}>
      <path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
      <circle cx="12" cy="12" r="4" fill="none" stroke={color} strokeWidth={1.6} />
    </svg>
  );
}

export function CatIcon({ cat, color = '#fff', size = 20 }: { cat: WorkCategory; color?: string; size?: number }) {
  if (cat === 'movie' || cat === 'drama') {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size}>
        <rect x="3" y="7" width="18" height="13" rx="1.5" fill="none" stroke={color} strokeWidth={1.6} />
        <path d="M3 7l3-4h3l-3 4M9 7l3-4h3l-3 4M15 7l3-4h3l-3 4" fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
      </svg>
    );
  }
  if (cat === 'lit') {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size}>
        <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z" fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
        <path d="M4 19V4.5" stroke={color} strokeWidth={1.6} />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width={size} height={size}>
      <circle cx="12" cy="12" r="9" fill="none" stroke={color} strokeWidth={1.6} />
      <circle cx="9" cy="10" r="1.2" fill={color} />
      <circle cx="14" cy="9" r="1.2" fill={color} />
      <circle cx="15" cy="14" r="1.2" fill={color} />
    </svg>
  );
}

export function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.6" y2="16.6" />
    </svg>
  );
}

export function CompassIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </svg>
  );
}

export function FitIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M9 21H3v-6M15 3h6v6M21 3l-7 7M3 21l7-7" />
    </svg>
  );
}

export function LayersIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinejoin="round">
      <path d="M12 3l9 5-9 5-9-5 9-5z" />
      <path d="M3 13l9 5 9-5" />
    </svg>
  );
}

export function RouteIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 3v18" />
      <path d="M5 4h11l-2 4 2 4H5" />
    </svg>
  );
}

export function AssetBoxIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinejoin="round">
      <path d="M12 2 3 7v10l9 5 9-5V7l-9-5Z" />
      <path d="M3 7l9 5 9-5" />
      <path d="M12 12v10" />
    </svg>
  );
}

export function InfoIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5" />
      <circle cx="12" cy="7.8" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function CheckIcon({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path d="M3 12l2-2 4 4L18 5l3 3" />
      <path d="M3 19h18" />
    </svg>
  );
}
