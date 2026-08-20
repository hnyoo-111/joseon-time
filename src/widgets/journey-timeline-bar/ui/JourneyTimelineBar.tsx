import type { JourneyStep } from '@/entities/journey';
import type { DayWindow, ProcessionTick } from '@/widgets/map-view';

interface ProcessionPlayer {
  days: DayWindow[];
  tick: ProcessionTick | null;
  playing: boolean;
  tracking: boolean;
  historicalOn: boolean;
  onTogglePlay: () => void;
  onSeekDay: (dayIndex: number) => void;
  onToggleTracking: () => void;
  onToggleHistorical: () => void;
}

interface JourneyTimelineBarProps {
  steps: JourneyStep[];
  activeIndex: number;
  onSelect: (index: number) => void;
  onPrev: () => void;
  onNext: () => void;
  /** 행렬 시뮬레이션이 있는 여정(화성행차·단종 유배길)에서만 전달된다. */
  procession?: ProcessionPlayer;
}

export function JourneyTimelineBar({ steps, activeIndex, onSelect, onPrev, onNext, procession }: JourneyTimelineBarProps) {
  if (!procession) {
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

  const { days, tick, playing, tracking, historicalOn, onTogglePlay, onSeekDay, onToggleTracking, onToggleHistorical } = procession;
  const activeDay = tick?.dayIndex ?? 0;

  return (
    <div className="journey-player">
      <div className="jp-chapters">
        <button className="jp-nav" disabled={activeIndex === 0} onClick={onPrev}>‹</button>
        <div className="jp-chapter-track">
          {steps.map((s, i) => (
            <button
              key={s.id}
              className={'jp-chip' + (i === activeIndex ? ' active' : '') + (i < activeIndex ? ' visited' : '')}
              onClick={() => onSelect(i)}
            >
              {s.title}
            </button>
          ))}
        </div>
        <button className="jp-nav" disabled={activeIndex === steps.length - 1} onClick={onNext}>›</button>
      </div>

      <div className="jp-transport">
        <button className="jp-play" onClick={onTogglePlay} title={playing ? '일시정지' : '재생'}>
          {playing ? '❚❚' : '▶'}
        </button>
        <div className="jp-clock">{tick?.clock ?? '--:--'}</div>

        <div className="jp-scrubber">
          {days.map((d, i) => {
            const state = i < activeDay ? 'past' : i === activeDay ? 'now' : 'future';
            return (
              <button
                key={d.day}
                className={`jp-day is-${state}${d.legId ? ' is-move' : ' is-stay'}`}
                onClick={() => onSeekDay(i)}
                title={`${d.day}일차 · ${d.lunar} · ${d.legId ? `${d.distanceKm.toFixed(1)}km 이동` : '체류'}`}
              >
                <span className="jp-day-n">{d.day}</span>
                {i === activeDay && <span className="jp-day-progress" style={{ width: `${(tick?.dayProgress ?? 0) * 100}%` }} />}
              </button>
            );
          })}
        </div>

        <div className="jp-now">
          <span className="jp-now-day">{tick ? `${activeDay + 1}일차 · ${tick.lunar}` : '준비 중'}</span>
          <span className="jp-now-label">{tick?.label ?? ''}</span>
          {tick?.moving && <span className="jp-moving">이동 중</span>}
        </div>

        <button className={`jp-toggle${tracking ? ' active' : ''}`} onClick={onToggleTracking} title="행렬 따라가기">🎯</button>
        <button className={`jp-toggle${historicalOn ? ' active' : ''}`} onClick={onToggleHistorical} title="1919년 지형도 겹쳐 보기">🗺</button>
      </div>
    </div>
  );
}
