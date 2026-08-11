import type { ReactNode } from 'react';

export function Divider() {
  return <div className="divider" />;
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="section-label">{children}</div>;
}

export function Chip({ children, accent = false }: { children: ReactNode; accent?: boolean }) {
  return <span className={'chip' + (accent ? ' accent' : '')}>{children}</span>;
}

export function RelRow({ title, sub, onClick }: { title: string; sub: string; onClick: () => void }) {
  return (
    <button className="rel-row" onClick={onClick}>
      <div>
        <div className="rel-row-title">{title}</div>
        <div className="rel-row-sub">{sub}</div>
      </div>
      <div className="rel-row-arrow">→</div>
    </button>
  );
}

export interface NextAction { label: string; onClick: () => void; }

export function NextActions({ items }: { items: NextAction[] }) {
  if (!items.length) return null;
  return (
    <>
      <Divider />
      <SectionLabel>다음으로 발견해보세요</SectionLabel>
      <div className="next-actions">
        {items.map((it, i) => (
          <button key={i} className="na-btn" onClick={it.onClick}>
            <span>{it.label}</span>
            <span className="na-arrow">→</span>
          </button>
        ))}
      </div>
    </>
  );
}

export interface BreadcrumbSegment { label: string; onClick: () => void; }

export function Breadcrumb({ segments }: { segments: BreadcrumbSegment[] }) {
  if (!segments.length) return null;
  return (
    <div className="breadcrumb">
      {segments.map((s, i) => (
        <span key={i}>
          {i > 0 && <span className="bc-sep">›</span>}
          <b onClick={s.onClick}>{s.label}</b>
        </span>
      ))}
    </div>
  );
}
