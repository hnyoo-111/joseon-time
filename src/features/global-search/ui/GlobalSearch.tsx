import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KINGS } from '@/entities/king';
import { HERITAGES, TYPE_LABEL } from '@/entities/heritage';
import { WORKS, CAT_LABEL } from '@/entities/work';
import { EVENTS } from '@/entities/event';
import { useAppStore } from '@/app/model/appStore';
import { SearchIcon } from '@/shared/ui/icons';

interface SearchGroup {
  label: string;
  items: { title: string; sub: string; action: () => void }[];
}

export function GlobalSearch() {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { setKingFilter, openSite, openWork, openEvent, setTab, logVisit } = useAppStore();

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  function selectKing(id: string) {
    setTab('king');
    setKingFilter(id);
    logVisit('king', id, KINGS.find((k) => k.id === id)!.name);
    const rel = HERITAGES.filter((h) => h.kings.includes(id));
    navigate('/map');
    if (rel[0]) openSite(rel[0].id);
    setQuery(''); setOpen(false);
  }
  function selectHeritage(id: string) {
    navigate('/map');
    openSite(id);
    setQuery(''); setOpen(false);
  }
  function selectWork(id: string) {
    const w = WORKS.find((x) => x.id === id)!;
    navigate('/map');
    if (w.heritages[0]) openSite(w.heritages[0]);
    openWork(id);
    setQuery(''); setOpen(false);
  }
  function selectEvent(id: string) {
    const ev = EVENTS.find((x) => x.id === id)!;
    navigate('/map');
    if (ev.heritages[0]) openSite(ev.heritages[0]);
    openEvent(id);
    setQuery(''); setOpen(false);
  }

  const groups: SearchGroup[] = query
    ? [
      { label: '왕', items: KINGS.filter((k) => k.name.includes(query)).map((k) => ({ title: k.name, sub: k.reign, action: () => selectKing(k.id) })) },
      { label: '문화재', items: HERITAGES.filter((h) => h.name.includes(query)).map((h) => ({ title: h.name, sub: TYPE_LABEL[h.type], action: () => selectHeritage(h.id) })) },
      { label: '작품', items: WORKS.filter((w) => w.cat !== 'art' && w.title.includes(query)).map((w) => ({ title: w.title, sub: `${CAT_LABEL[w.cat]} · ${w.year}`, action: () => selectWork(w.id) })) },
      { label: '회화', items: WORKS.filter((w) => w.cat === 'art' && w.title.includes(query)).map((w) => ({ title: w.title, sub: w.year, action: () => selectWork(w.id) })) },
      { label: '사건', items: EVENTS.filter((e) => e.title.includes(query)).map((e) => ({ title: e.title, sub: e.year, action: () => selectEvent(e.id) })) },
    ].filter((g) => g.items.length > 0)
    : [];

  return (
    <div className="search-wrap" ref={wrapRef}>
      <div className="search-box">
        <SearchIcon />
        <input
          className="search-input"
          placeholder="왕, 문화재, 사건, 작품을 검색해보세요"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
        />
      </div>
      {open && query && (
        <div className="search-results" style={{ display: 'block' }}>
          {groups.length === 0 ? (
            <div className="search-empty">"{query}"에 대한 검색 결과가 없습니다.</div>
          ) : (
            groups.map((g) => (
              <div className="search-group" key={g.label}>
                <div className="search-group-label">{g.label}</div>
                {g.items.slice(0, 5).map((it, i) => (
                  <div className="search-item" key={i} onClick={it.action}>
                    <span className="si-title">{it.title}</span>
                    <span className="si-sub">{it.sub}</span>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
