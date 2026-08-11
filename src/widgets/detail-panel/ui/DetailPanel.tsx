import { useAppStore } from '@/app/model/appStore';
import { heritageById } from '@/entities/heritage';
import { workById } from '@/entities/work';
import { eventById } from '@/entities/event';
import { Breadcrumb, type BreadcrumbSegment } from '@/shared/ui/Primitives';
import { CheckIcon } from '@/shared/ui/icons';
import { SitePanel } from './SitePanel';
import { WorkPanel } from './WorkPanel';
import { EventPanel } from './EventPanel';

export function DetailPanel({ collapsed }: { collapsed: boolean }) {
  const { panelStack, jumpBreadcrumb } = useAppStore();

  if (!panelStack.length) {
    return (
      <aside className={'detail-panel panel-surface' + (collapsed ? ' collapsed' : '')}>
        <div className="panel-empty-state">
          <CheckIcon />
          <div className="es-title">문화재를 선택해보세요</div>
          <div className="es-sub">왼쪽에서 왕을 고르거나<br />지도의 마커를 클릭하면<br />관련 이야기가 여기 나타납니다.</div>
        </div>
      </aside>
    );
  }

  const siteFrame = panelStack[0];
  const site = heritageById(siteFrame.id)!;
  const top = panelStack[panelStack.length - 1];

  const segments: BreadcrumbSegment[] = panelStack.map((frame, i) => {
    const label = frame.type === 'site' ? site.name : frame.type === 'work' ? workById(frame.id)!.title : eventById(frame.id)!.title;
    return { label, onClick: () => jumpBreadcrumb(i) };
  });

  return (
    <aside className={'detail-panel panel-surface' + (collapsed ? ' collapsed' : '')}>
      <div className="panel-scroll">
        <div className="panel-inner">
          <Breadcrumb segments={segments} />
          {top.type === 'site' && <SitePanel heritage={site} />}
          {top.type === 'work' && <WorkPanel work={workById(top.id)!} />}
          {top.type === 'event' && <EventPanel event={eventById(top.id)!} />}
        </div>
      </div>
    </aside>
  );
}
