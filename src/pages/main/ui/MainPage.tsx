import { useNavigate } from 'react-router-dom';

interface StoryPick {
  year: string;
  title: string;
  sub: string;
  journeyId: string;
}

const STORY_PICKS: StoryPick[] = [
  { year: '1795', title: '정조의 화성행차를 따라가다', sub: '창덕궁에서 수원화성까지', journeyId: 'hwaseonghaenghaeng' },
  { year: '1457', title: '단종의 유배길을 따라가다', sub: '청령포에서 장릉까지', journeyId: 'danjong-yubae' },
];

export function MainPage() {
  const navigate = useNavigate();

  return (
    <div className="landing" style={{ ['--landing-bg-image' as string]: "url('/Joseon.png')" }}>
      <div className="landing-inner">
        <div className="landing-kicker">Digital Heritage Archive</div>
        <h1 className="landing-title">조선의 시간</h1>
        <p className="landing-tagline">시간을 선택하면,<br />그날의 조선이 펼쳐집니다.</p>
        <div className="landing-prompt">오늘은 어느 조선으로 떠나볼까요?</div>
        <div className="landing-grid">
          {STORY_PICKS.map((p, i) => (
            <button key={i} className="story-pick featured" onClick={() => navigate(`/journey/${p.journeyId}`)}>
              <div className="sp-year">{p.year}</div>
              <div className="sp-title">{p.title}</div>
              <div className="sp-sub">{p.sub}</div>
              <div className="sp-cta">시간여행 시작 →</div>
            </button>
          ))}
        </div>
        <button className="landing-skip" onClick={() => navigate('/map')}>시간여행 없이 지도부터 둘러보기 →</button>
      </div>
    </div>
  );
}
