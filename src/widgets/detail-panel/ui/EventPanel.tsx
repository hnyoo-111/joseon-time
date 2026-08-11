import type { HistoricalEvent } from '@/entities/event';
import { heritageById, TYPE_LABEL } from '@/entities/heritage';
import { kingById } from '@/entities/king';
import { workById } from '@/entities/work';
import { useAppStore } from '@/app/model/appStore';
import { Divider, SectionLabel, Chip, RelRow, NextActions, type NextAction } from '@/shared/ui/Primitives';

export function EventPanel({ event }: { event: HistoricalEvent }) {
  const { goBack, openSite, openWork, setKingFilter, setTab } = useAppStore();

  const evHeritages = event.heritages.map((id) => heritageById(id)).filter(Boolean) as ReturnType<typeof heritageById>[];
  const evKings = event.kings.map((id) => kingById(id)).filter(Boolean) as ReturnType<typeof kingById>[];
  const evWorks = event.works.map((id) => workById(id)).filter(Boolean) as ReturnType<typeof workById>[];

  function goKing(kingId: string) {
    setTab('king');
    setKingFilter(kingId);
  }

  const nextItems: NextAction[] = [];
  if (evHeritages[0]) nextItems.push({ label: `${evHeritages[0]!.name} 실제 장소 보기`, onClick: () => openSite(evHeritages[0]!.id) });
  if (evKings[0]) nextItems.push({ label: `${evKings[0]!.name} 만나보기`, onClick: () => goKing(evKings[0]!.id) });
  if (evWorks[0]) nextItems.push({ label: `${evWorks[0]!.title} 작품으로 보기`, onClick: () => openWork(evWorks[0]!.id) });

  return (
    <>
      <button className="back-btn" onClick={goBack}>← 뒤로</button>
      <div className="p-title">{event.title}</div>
      <div className="p-meta">{event.year}</div>
      <div className="desc-block">{event.desc}</div>

      <Divider />
      <SectionLabel>관련 왕</SectionLabel>
      {evKings.map((k) => (
        <RelRow key={k!.id} title={k!.name} sub={`${k!.order} · ${k!.reign}`} onClick={() => goKing(k!.id)} />
      ))}

      <Divider />
      <SectionLabel>관련 문화유산</SectionLabel>
      {evHeritages.map((h) => (
        <RelRow key={h!.id} title={h!.name} sub={TYPE_LABEL[h!.type]} onClick={() => openSite(h!.id)} />
      ))}

      {evWorks.length > 0 && (
        <>
          <Divider />
          <SectionLabel>관련 작품</SectionLabel>
          <div className="chip-row">
            {evWorks.map((w) => (
              <span key={w!.id} onClick={() => openWork(w!.id)} style={{ cursor: 'pointer' }}>
                <Chip>{w!.title}</Chip>
              </span>
            ))}
          </div>
        </>
      )}

      <NextActions items={nextItems} />
    </>
  );
}
