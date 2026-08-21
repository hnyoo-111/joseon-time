import { KINGS } from '@/entities/king';
import { HERITAGES, heritagesOfKing, TYPE_LABEL } from '@/entities/heritage';
import { useAppStore } from '@/app/model/appStore';
import { TypeIcon } from '@/shared/ui/icons';

export function TimelineSidebar({ collapsed = false }: { collapsed?: boolean }) {
  const { currentTab, setTab, currentKingFilter, setKingFilter, mapFocusHeritageId, openSite, focusHeritage, logVisit } = useAppStore();

  function selectKing(id: string) {
    const rel = heritagesOfKing(id);
    setKingFilter(currentKingFilter === id ? null : id);
    logVisit('king', id, KINGS.find((k) => k.id === id)!.name);
    if (rel[0]) focusHeritage(rel[0].id);
  }

  return (
    <aside className={'sidebar panel-surface' + (collapsed ? ' collapsed' : '')}>
      <div className="panel-head">
        <div className="tabs-row">
          <button className={'tab-btn' + (currentTab === 'king' ? ' active' : '')} onClick={() => setTab('king')}>역대 왕</button>
          <button className={'tab-btn' + (currentTab === 'heritage' ? ' active' : '')} onClick={() => setTab('heritage')}>문화유산</button>
        </div>
      </div>

      <div className="list-scroll">
        {currentTab === 'king' ? (
          <div className="timeline">
            {KINGS.map((k) => {
              const rel = heritagesOfKing(k.id);
              const active = currentKingFilter === k.id;
              return (
                <div key={k.id} className={'t-row' + (active ? ' active' : '')} onClick={() => selectKing(k.id)}>
                  <div className="t-year">{k.reign.split('–')[0]}</div>
                  <div className="t-dot-col"><div className="t-dot" /></div>
                  <div>
                    <div className="t-name">{k.name}</div>
                    <div className="t-meta">{k.order} · {k.reign}</div>
                    <div className="t-heritage">대표 문화유산 · <b>{rel.map((h) => h.name).join(' · ')}</b></div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="h-card-grid">
            {HERITAGES.map((h) => {
              const active = mapFocusHeritageId === h.id;
              return (
                <button key={h.id} className={'h-card' + (active ? ' active' : '')} onClick={() => openSite(h.id)}>
                  <div className="h-card-thumb">
                    {h.imageUrl ? <img src={h.imageUrl} alt="" loading="lazy" /> : <TypeIcon type={h.type} size={30} color="var(--ink-3)" />}
                  </div>
                  <div className="h-card-body">
                    <div className="h-card-title">{h.name}{h.unesco && <span className="h-card-unesco">유네스코</span>}</div>
                    <div className="h-card-meta">{TYPE_LABEL[h.type]} · {h.address}</div>
                    <div className="h-card-desc">{h.tagline}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
