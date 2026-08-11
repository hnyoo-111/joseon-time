import type { JourneyStep } from '@/entities/journey';

interface JourneyTimelineBarProps {
  steps: JourneyStep[];
  activeIndex: number;
  onSelect: (index: number) => void;
  onPrev: () => void;
  onNext: () => void;
}

export function JourneyTimelineBar({ steps, activeIndex, onSelect, onPrev, onNext }: JourneyTimelineBarProps) {
  return (
    <div className="journey-timeline-bar">
      <button className="jt-prev" disabled={activeIndex === 0} onClick={onPrev}>‹</button>
      <div className="journey-track">
        {steps.map((s, i) => (
          <button
            key={s.id}
            className={'jt-node' + (i === activeIndex ? ' active' : '') + (i < activeIndex ? ' visited' : '')}
            onClick={() => onSelect(i)}
          >
            <div className="jt-dot" />
            <div className="jt-label">{s.title}</div>
          </button>
        ))}
      </div>
      <button className="jt-next" disabled={activeIndex === steps.length - 1} onClick={onNext}>›</button>
    </div>
  );
}
