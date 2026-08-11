import { useState } from 'react';

export function TimeCompare({ visible }: { visible: boolean }) {
  const [value, setValue] = useState(100); // 0 = 1796, 100 = 2026
  const pastAmount = (100 - value) / 100;
  const overlayOpacity = (pastAmount * 0.5).toFixed(2);

  let caption: string;
  if (value >= 92) caption = '2026년 현재의 모습입니다.';
  else if (value <= 8) caption = '1796년 무렵의 조선을 상상해본 모식 표현입니다 — 실제 고지도가 아닌 프로토타입용 오버레이입니다.';
  else caption = `${Math.round(1796 + (2026 - 1796) * (value / 100))}년 무렵으로 이동 중입니다.`;

  return (
    <>
      <div className="historical-overlay" style={{ opacity: visible ? Number(overlayOpacity) : 0 }} />
      <div className={'time-compare' + (visible ? ' show' : '')} style={{ display: visible ? 'block' : 'none' }}>
        <div className="tc-row">
          <span className="tc-year-label">1796</span>
          <input
            type="range" min={0} max={100} value={value} className="tc-slider"
            onChange={(e) => setValue(Number(e.target.value))}
          />
          <span className="tc-year-label now">2026</span>
        </div>
        <div className="tc-caption">{caption}</div>
      </div>
    </>
  );
}
