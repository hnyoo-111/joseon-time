import { Link, NavLink, useMatch, useNavigate, useParams } from 'react-router-dom';
import { GlobalSearch } from '@/features/global-search/ui/GlobalSearch';
import { journeyById } from '@/entities/journey';

export function Header() {
  const journeyMatch = useMatch('/journey/:journeyId');
  const params = useParams();
  const navigate = useNavigate();
  const journey = journeyMatch ? journeyById(params.journeyId || '') : undefined;

  return (
    <div className="topbar">
      <div className="brand">
        <span className="kicker">Digital Heritage Archive</span>
        <Link to="/"><h1>조선의 시간</h1></Link>
      </div>
      {!journey && (
        <nav className="topnav">
          <NavLink to="/map" className={({ isActive }) => (isActive ? 'active' : '')}>지도</NavLink>
          <NavLink to="/artifacts" className={({ isActive }) => (isActive ? 'active' : '')}>유물 아카이브</NavLink>
        </nav>
      )}
      {journey ? (
        <div className="travel-badge">
          <span className="tb-dot" />
          <button className="tb-exit" onClick={() => navigate('/map')}>탐색 모드로 돌아가기</button>
        </div>
      ) : (
        <GlobalSearch />
      )}
    </div>
  );
}
