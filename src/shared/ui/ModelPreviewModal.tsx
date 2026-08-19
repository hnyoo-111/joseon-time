import { useEffect, useRef } from 'react';
import '@google/model-viewer';

type ModelViewerEl = HTMLElement & { src: string };

export function ModelPreviewModal({ title, src, onClose }: { title: string; src: string; onClose: () => void }) {
  const ref = useRef<ModelViewerEl>(null);

  // model-viewer(커스텀 엘리먼트)는 React가 JSX prop으로 넘긴 src를 초기 렌더 타이밍에
  // 제대로 못 집어드는 경우가 있어, mount 이후 DOM에 직접 값을 넣어줍니다.
  useEffect(() => {
    if (ref.current) ref.current.src = src;
  }, [src]);

  return (
    <div className="admin-preview-overlay" onClick={onClose}>
      <div className="admin-preview-card" onClick={(e) => e.stopPropagation()}>
        <div className="admin-preview-head">
          <div className="admin-preview-title">{title}</div>
          <button className="admin-preview-close" onClick={onClose}>✕</button>
        </div>
        <model-viewer
          ref={ref}
          alt={title}
          camera-controls
          auto-rotate
          shadow-intensity="1"
          exposure="1"
          style={{ width: '100%', height: '480px', background: '#EFE9DD' }}
        />
        <div className="admin-preview-hint">드래그로 회전 · 스크롤로 확대/축소</div>
      </div>
    </div>
  );
}
