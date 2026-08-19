import { useNavigate } from 'react-router-dom';
import { CAT_LABEL, type Work } from '@/entities/work';
import { heritageById } from '@/entities/heritage';
import { kingById } from '@/entities/king';
import { eventOfWork } from '@/entities/event';
import { paintingByWorkId } from '@/entities/painting';
import { useAppStore } from '@/app/model/appStore';
import { Divider, SectionLabel, Chip, NextActions, type NextAction } from '@/shared/ui/Primitives';
import { TypeIcon, KingIcon, EventIcon } from '@/shared/ui/icons';

export function WorkPanel({ work }: { work: Work }) {
  const navigate = useNavigate();
  const { goBack, openSite, openEvent, setKingFilter, setTab } = useAppStore();

  const relHeritages = work.heritages.map((id) => heritageById(id)).filter(Boolean) as ReturnType<typeof heritageById>[];
  const relEvent = eventOfWork(work.id);
  const relKings = work.kings.map((id) => kingById(id)).filter(Boolean) as ReturnType<typeof kingById>[];
  const painting = paintingByWorkId(work.id);

  function goKing(kingId: string) {
    setTab('king');
    setKingFilter(kingId);
  }

  const nextItems: NextAction[] = [];
  if (relHeritages[0]) nextItems.push({ label: `실제 장소 ${relHeritages[0]!.name} 보기`, onClick: () => openSite(relHeritages[0]!.id) });
  if (relKings[0]) nextItems.push({ label: `${relKings[0]!.name} 만나보기`, onClick: () => goKing(relKings[0]!.id) });
  if (painting) nextItems.push({ label: '그림 속으로 들어가기', onClick: () => navigate(`/painting/${work.id}`) });

  return (
    <>
      <button className="back-btn" onClick={goBack}>← 뒤로</button>
      {work.posterUrl && (
        <img className="p-poster" src={work.posterUrl} alt={`${work.title} 포스터`} />
      )}
      <div className="p-title">{work.title}</div>
      <div className="p-tagline">{work.tagline}</div>
      <div className="p-meta">{CAT_LABEL[work.cat]}</div>
      <div className="p-meta">{work.year}</div>
      {painting && (
        <button className="ghost-btn" onClick={() => navigate(`/painting/${work.id}`)}>그림 속으로 들어가기 →</button>
      )}
      {work.desc && <div className="desc-block">{work.desc}</div>}

      {work.timeline && work.timeline.length > 0 && (
        <>
          <Divider />
          <SectionLabel>작품 속 역사</SectionLabel>
          {work.timeline.map((t, i) => (
            <div className="timeline-item" key={i}>
              <div className="ty">{t.y}</div>
              <div className="te">{t.e}</div>
            </div>
          ))}
        </>
      )}

      {work.figures.length > 0 && (
        <>
          <Divider />
          <SectionLabel>관련 인물</SectionLabel>
          <div className="chip-row">
            {work.figures.map((f) => <Chip key={f}>{f}</Chip>)}
          </div>
        </>
      )}

      {(relKings.length > 0 || relEvent || relHeritages.length > 0) && (
        <>
          <Divider />
          <SectionLabel>이 작품의 실제 역사</SectionLabel>
          <div className="chain">
            {relKings.map((k) => (
              <div className="chain-item" key={k!.id} onClick={() => goKing(k!.id)}>
                <div className="chain-dot"><KingIcon /></div>
                <div><div className="chain-label">왕</div><div className="chain-title">{k!.name}</div></div>
              </div>
            ))}
            {relEvent && (
              <div className="chain-item" onClick={() => openEvent(relEvent.id)}>
                <div className="chain-dot"><EventIcon /></div>
                <div><div className="chain-label">사건</div><div className="chain-title">{relEvent.title}</div></div>
              </div>
            )}
            {relHeritages.map((h) => (
              <div className="chain-item" key={h!.id} onClick={() => openSite(h!.id)}>
                <div className="chain-dot"><TypeIcon type={h!.type} /></div>
                <div><div className="chain-label">문화재</div><div className="chain-title">{h!.name}</div></div>
              </div>
            ))}
          </div>
        </>
      )}

      <NextActions items={nextItems} />
    </>
  );
}
