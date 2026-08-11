// Mirrors tokens.css — kept in TS for contexts CSS vars can't reach (Canvas 2D marker icons, Cesium colors).
export const COLORS = {
  bg: '#f7f3ea',
  surface: '#fffdf7',
  surface2: '#efe7d2',
  highlight: '#f1ead9',
  border: '#e4dcc8',
  borderStrong: '#d6cbb0',
  ink: '#292725',
  ink2: '#6b6456',
  ink3: '#8c8574',
  navy: '#24354b',
  navy2: '#33455c',
  navySoft: '#babfcc',
  accent: '#b83a32',
  accentHover: '#96302a',
  teal: '#275d52',
  gold: '#d49b35',
} as const;

export const CAT_COLOR: Record<'movie' | 'drama' | 'lit' | 'art', string> = {
  movie: COLORS.accent,
  drama: COLORS.teal,
  lit: COLORS.navy,
  art: COLORS.gold,
};
