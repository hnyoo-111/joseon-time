import { CAT_LABEL, type Work } from '@/entities/work';
import { CAT_COLOR } from '@/shared/config/colors';
import { CatIcon } from './icons';
import { heroGradient } from './heroGradient';

export function StoryCard({ work, onClick }: { work: Work; onClick: () => void }) {
  const color = CAT_COLOR[work.cat];
  return (
    <button className="story-card" onClick={onClick}>
      <div className="story-thumb" style={{ background: heroGradient(color) }}>
        <CatIcon cat={work.cat} color={color} />
      </div>
      <div className="story-body">
        <div className="story-cat" style={{ color }}>{CAT_LABEL[work.cat]}</div>
        <div className="story-title">{work.title}</div>
        <div className="story-year">{work.year}</div>
      </div>
    </button>
  );
}
