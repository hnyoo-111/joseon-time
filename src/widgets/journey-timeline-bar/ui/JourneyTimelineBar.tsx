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

// 재생 바 아이콘 — 전부 채움(filled) 스타일로 통일한다(선/채움을 섞으면 한 그룹인데도 이질감이 생긴다).
function SkipBackIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24"><path d="M19 5v14L8 12 19 5Z" fill="currentColor" /><rect x="4" y="5" width="2.4" height="14" rx="1" fill="currentColor" /></svg>
  );
}
function SkipForwardIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24"><path d="M5 5v14l11-7L5 5Z" fill="currentColor" /><rect x="17.6" y="5" width="2.4" height="14" rx="1" fill="currentColor" /></svg>
  );
}
function PlayIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24"><path d="M6 4l14 8-14 8V4Z" fill="currentColor" /></svg>;
}
function PauseIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24"><rect x="5" y="4" width="5" height="16" rx="1.5" fill="currentColor" /><rect x="14" y="4" width="5" height="16" rx="1.5" fill="currentColor" /></svg>
  );
}
function CameraIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24"><rect x="2" y="6" width="14" height="12" rx="2.5" fill="currentColor" /><path d="M17.3 10.6 22 7.3a1 1 0 0 1 1.6.8v7.8a1 1 0 0 1-1.6.8l-4.7-3.3v-2.8Z" fill="currentColor" /></svg>
  );
}
function MapIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24">
      <path d="M9 3.8 3.4 5.9a1 1 0 0 0-.65.94v13.7a.5.5 0 0 0 .68.47L9 19v-15.2Z" fill="currentColor" />
      <path d="M10.6 3.8v15.2l4.8 1.7V5.5l-4.8-1.7Z" fill="currentColor" opacity="0.7" />
      <path d="M17 5.5v15.2l3.65-1.36a1 1 0 0 0 .65-.94V4.3a.5.5 0 0 0-.68-.47L17 5.5Z" fill="currentColor" />
    </svg>
  );
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
          <button className="jp-step-btn" onClick={() => onSeekDay(Math.max(0, activeDay - 1))} disabled={activeDay === 0} title="이전 날짜"><SkipBackIcon /></button>
          <button className="jp-play" onClick={onTogglePlay} title={playing ? '일시정지' : '재생'}>
            {playing ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button className="jp-step-btn" onClick={() => onSeekDay(Math.min(days.length - 1, activeDay + 1))} disabled={activeDay === days.length - 1} title="다음 날짜"><SkipForwardIcon /></button>
        </div>

        <div className="jp-datetime">
          <div className="jp-date-main">{tick ? `${activeDay + 1}일차 · ${tick.lunar}` : '준비 중'} <span className="jp-clock">{tick?.clock ?? '--:--'}</span></div>
          <div className="jp-date-sub">
            {tick?.label ?? ''}
            {tick?.moving && <span className="jp-moving">이동 중</span>}
          </div>
        </div>

        <div className="jp-spacer" />
        <button className={`jp-toggle${tracking ? ' active' : ''}`} onClick={onToggleTracking} title="행렬 따라가기"><CameraIcon /><span> 따라가기</span></button>
        <button className={`jp-toggle${historicalOn ? ' active' : ''}`} onClick={onToggleHistorical} title="1919년 지형도 겹쳐 보기"><MapIcon /><span> 1919 지형도</span></button>
      </div>

      <div className="jp-row2">
        <span className="jp-edge-label">{days[0] ? `${days[0].lunar} 출발` : ''}</span>
        <div className="jp-slider-col">
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
          <div className="jp-slider-nums">
            {days.map((d) => (
              <span key={d.day} className={`jp-num${d.legId ? ' is-move' : ''}`}>{d.day}</span>
            ))}
          </div>
        </div>
        <span className="jp-edge-label">{days[days.length - 1] ? `${days[days.length - 1].lunar} 도착` : ''}</span>
      </div>
    </div>
  );
}
