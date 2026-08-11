import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { TYPE_LABEL, type Heritage } from '@/entities/heritage';
import { heritageWorks } from '@/entities/work';
import { heritageEvents } from '@/entities/event';
import { kingById } from '@/entities/king';
import { JOURNEY_BY_HERITAGE } from '@/entities/journey';
import { paintingByWorkId } from '@/entities/painting';
import { useAppStore } from '@/app/model/appStore';
import { Chip, Divider, SectionLabel, RelRow, NextActions, type NextAction } from '@/shared/ui/Primitives';
import { StoryCard } from '@/shared/ui/StoryCard';

export function SitePanel({ heritage }: { heritage: Heritage }) {
  const navigate = useNavigate();
  const { openWork, openEvent, setKingFilter, setTab, logVisit } = useAppStore();
  const [descOpen, setDescOpen] = useState(false);

  const works = heritageWorks(heritage.id);
  const worksArt = works.filter((w) => w.cat === 'art');
  const worksScreen = works.filter((w) => w.cat !== 'art');
  const events = heritageEvents(heritage.id);
  const journeyId = JOURNEY_BY_HERITAGE[heritage.id];

  function goKing(kingId: string) {
    setTab('king');
    setKingFilter(kingId);
  }

  const nextItems: NextAction[] = [];
  if (heritage.kings[0]) {
    const k = kingById(heritage.kings[0])!;
    nextItems.push({ label: `${k.name} 만나보기`, onClick: () => goKing(k.id) });
  }
  if (worksArt.length && paintingByWorkId(worksArt[0].id)) {
    nextItems.push({ label: `그림 속 ${heritage.name} 들여다보기`, onClick: () => navigate(`/painting/${worksArt[0].id}`) });
  }
  if (events[0]) {
    nextItems.push({ label: `${events[0].title} 사건 보기`, onClick: () => openEvent(events[0].id) });
  }

  return (
    <>
      {heritage.hanja && <div className="hanja">{heritage.hanja}</div>}
      <div className="p-title">{heritage.name}</div>
      <div className="p-tagline">{heritage.tagline}</div>
      <div className="p-meta">{heritage.address}</div>
      <div className="p-meta">{heritage.year}</div>
      <div className="chip-row">
        <Chip>{TYPE_LABEL[heritage.type]}</Chip>
        {heritage.unesco && <Chip accent>UNESCO 세계유산</Chip>}
      </div>

      <Divider />
      <SectionLabel>관련 왕</SectionLabel>
      {heritage.kings.map((kid) => {
        const k = kingById(kid)!;
        return <RelRow key={kid} title={k.name} sub={`${k.order} · ${k.reign}`} onClick={() => goKing(kid)} />;
      })}

      {events.length > 0 && (
        <>
          <Divider />
          <SectionLabel>관련 사건</SectionLabel>
          {events.map((ev) => (
            <RelRow key={ev.id} title={ev.title} sub={ev.year} onClick={() => openEvent(ev.id)} />
          ))}
        </>
      )}

      {worksScreen.length > 0 && (
        <>
          <Divider />
          <SectionLabel>이 장소를 다룬 드라마·영화·문학</SectionLabel>
          <div className="story-grid">
            {worksScreen.map((w) => <StoryCard key={w.id} work={w} onClick={() => openWork(w.id)} />)}
          </div>
        </>
      )}

      {worksArt.length > 0 && (
        <>
          <Divider />
          <SectionLabel>관련 회화</SectionLabel>
          <div className="story-grid">
            {worksArt.map((w) => <StoryCard key={w.id} work={w} onClick={() => openWork(w.id)} />)}
          </div>
        </>
      )}

      <Divider />
      {journeyId ? (
        <button className="primary-btn" onClick={() => { logVisit('journey', journeyId, heritage.name + ' 시간여행'); navigate(`/journey/${journeyId}`); }}>
          이 시대 여행하기 →
        </button>
      ) : (
        <div className="primary-btn muted">이 장소의 시간여행은 준비 중입니다</div>
      )}
      <button className="ghost-btn" onClick={() => setDescOpen((v) => !v)}>
        {descOpen ? '접기' : '문화재 자세히 보기'}
      </button>
      {descOpen && <div className="desc-block">{heritage.desc}</div>}

      <NextActions items={nextItems} />
    </>
  );
}
