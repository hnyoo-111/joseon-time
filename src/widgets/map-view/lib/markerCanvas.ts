import type { HeritageType } from '@/entities/heritage';
import { COLORS } from '@/shared/config/colors';

const iconCache: Record<string, string> = {};

function drawTypeGlyph(ctx: CanvasRenderingContext2D, type: HeritageType, cx: number, cy: number, s: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = '#fff';
  ctx.fillStyle = '#fff';
  ctx.lineWidth = Math.max(1.3, s * 0.16);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (type === 'palace') {
    ctx.moveTo(-s, s * 0.55); ctx.lineTo(-s, -s * 0.05); ctx.lineTo(0, -s); ctx.lineTo(s, -s * 0.05); ctx.lineTo(s, s * 0.55);
    ctx.moveTo(-s * 1.05, s * 0.55); ctx.lineTo(s * 1.05, s * 0.55);
  } else if (type === 'fortress') {
    ctx.moveTo(-s, s * 0.6); ctx.lineTo(-s, 0); ctx.lineTo(-s * 0.5, 0); ctx.lineTo(-s * 0.5, -s * 0.5);
    ctx.lineTo(0, -s * 0.5); ctx.lineTo(0, 0); ctx.lineTo(s * 0.5, 0); ctx.lineTo(s * 0.5, -s * 0.5);
    ctx.lineTo(s, -s * 0.5); ctx.lineTo(s, s * 0.6); ctx.closePath();
  } else if (type === 'shrine') {
    ctx.moveTo(-s, -s * 0.55); ctx.lineTo(s, -s * 0.55);
    ctx.moveTo(-s * 0.6, -s * 0.55); ctx.lineTo(-s * 0.6, s * 0.6);
    ctx.moveTo(s * 0.6, -s * 0.55); ctx.lineTo(s * 0.6, s * 0.6);
  } else if (type === 'tomb') {
    ctx.arc(0, s * 0.3, s * 0.85, Math.PI, 0);
    ctx.moveTo(-s, s * 0.3); ctx.lineTo(s, s * 0.3);
  } else if (type === 'site') {
    ctx.moveTo(-s * 0.5, s * 0.7); ctx.lineTo(-s * 0.5, -s * 0.7);
    ctx.lineTo(s * 0.7, -s * 0.35); ctx.lineTo(-s * 0.5, 0);
  } else if (type === 'temple') {
    ctx.moveTo(-s * 0.9, s * 0.6); ctx.lineTo(-s * 0.9, s * 0.1); ctx.lineTo(s * 0.9, s * 0.1); ctx.lineTo(s * 0.9, s * 0.6);
    ctx.moveTo(-s * 1.05, s * 0.1); ctx.lineTo(0, -s * 0.7); ctx.lineTo(s * 1.05, s * 0.1);
  } else {
    ctx.arc(0, 0, s * 0.6, 0, Math.PI * 2);
  }
  ctx.stroke();
  ctx.restore();
}

export function markerCanvas(type: HeritageType, selected: boolean): string {
  const key = type + (selected ? '-sel' : '-def');
  if (iconCache[key]) return iconCache[key];
  const size = selected ? 40 : 30;
  const r = selected ? 15 : 11;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.save();
  ctx.shadowColor = 'rgba(24,20,14,0.35)';
  ctx.shadowBlur = 5;
  ctx.shadowOffsetY = 2;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2);
  ctx.fillStyle = selected ? COLORS.accent : COLORS.navy;
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2);
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#fff';
  ctx.stroke();
  drawTypeGlyph(ctx, type, size / 2, size / 2, selected ? 8 : 6);
  const url = c.toDataURL();
  iconCache[key] = url;
  return url;
}
