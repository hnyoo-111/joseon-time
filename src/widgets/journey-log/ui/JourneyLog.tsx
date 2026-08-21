import { forwardRef, useImperativeHandle, useState } from 'react';
import { useAppStore } from '@/app/model/appStore';

const LOG_TYPE_LABEL: Record<string, string> = {
  king: '왕', site: '문화재', work: '작품', event: '사건', painting: '그림', journey: '시간여행', step: '여정',
};

export interface JourneyLogHandle {
  open: () => void;
}

export const JourneyLog = forwardRef<JourneyLogHandle>(function JourneyLog(_, ref) {
  const visitedLog = useAppStore((s) => s.visitedLog);
  const [open, setOpen] = useState(false);

  useImperativeHandle(ref, () => ({ open: () => setOpen(true) }), []);

  if (!open) return null;

  return (
    <div className="journey-log-modal" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div className="jl-card">
        <div className="jl-head">
          <div>
            <div className="jl-head-title">오늘 당신이 여행한 조선</div>
            <div className="jl-head-sub">
              {visitedLog.length ? `${visitedLog.length}개의 이야기를 발견했습니다.` : '아직 발견한 이야기가 없습니다.'}
            </div>
          </div>
          <button className="jl-close" onClick={() => setOpen(false)}>✕</button>
        </div>
        <div className="jl-body">
          {visitedLog.length === 0 ? (
            <div className="jl-empty">아직 발견한 이야기가 없습니다.<br />왕이나 문화재를 눌러 조선 여행을 시작해보세요.</div>
          ) : (
            visitedLog.map((v, i) => (
              <div className="jl-item" key={i}>
                <div className="jl-dot">{i + 1}</div>
                <div>
                  <div className="jl-item-title">{v.label}</div>
                  <div className="jl-item-type">{LOG_TYPE_LABEL[v.type]}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
});
