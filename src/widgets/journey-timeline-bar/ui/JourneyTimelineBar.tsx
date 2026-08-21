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
  const totalProgress = tick?.totalProgress ?? (days.length ? activeDay / days.length : 0);

  return (
    <div className="journey-player">
      <div className="jp-row1">
        <div className="jp-transport-btns">
          <button className="jp-step-btn" onClick={() => onSeekDay(Math.max(0, activeDay - 1))} disabled={activeDay === 0} title="이전 날짜">⏮</button>
          <button className="jp-play" onClick={onTogglePlay} title={playing ? '일시정지' : '재생'}>
            {playing ? '❚❚' : '▶'}
          </button>
          <button className="jp-step-btn" onClick={() => onSeekDay(Math.min(days.length - 1, activeDay + 1))} disabled={activeDay === days.length - 1} title="다음 날짜">⏭</button>
        </div>

        <div className="jp-datetime">
          <div className="jp-date-main">{tick ? `${activeDay + 1}일차 · ${tick.lunar}` : '준비 중'} <span className="jp-clock">{tick?.clock ?? '--:--'}</span></div>
          <div className="jp-date-sub">
            {tick?.label ?? ''}
            {tick?.moving && <span className="jp-moving">이동 중</span>}
          </div>
        </div>

        <div className="jp-spacer" />
        <button className={`jp-toggle${tracking ? ' active' : ''}`} onClick={onToggleTracking} title="행렬 따라가기">🎯 따라가기</button>
        <button className={`jp-toggle${historicalOn ? ' active' : ''}`} onClick={onToggleHistorical} title="1919년 지형도 겹쳐 보기">🗺 1919 지형도</button>
      </div>

      <div className="jp-row2">
        <span className="jp-edge-label">{days[0] ? `${days[0].day}일차 · ${days[0].lunar}` : ''}</span>
        <div className="jp-slider" onClick={(e) => {
          const track = e.currentTarget.getBoundingClientRect();
          const ratio = Math.min(1, Math.max(0, (e.clientX - track.left) / track.width));
          onSeekDay(Math.min(days.length - 1, Math.floor(ratio * days.length)));
        }}>
          {days.map((d, i) => (
            <div key={d.day} className={`jp-slider-seg${d.legId ? ' is-move' : ' is-stay'}${i < activeDay ? ' is-past' : ''}`} title={`${d.day}일차 · ${d.lunar} · ${d.legId ? `${d.distanceKm.toFixed(1)}km 이동` : '체류'}`} />
          ))}
          <div className="jp-slider-fill" style={{ width: `${totalProgress * 100}%` }} />
          <div className="jp-slider-handle" style={{ left: `${totalProgress * 100}%` }} />
        </div>
        <span className="jp-edge-label">{days[days.length - 1] ? `${days[days.length - 1].day}일차 · ${days[days.length - 1].lunar}` : ''}</span>
      </div>
    </div>
  );
}
