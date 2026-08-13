import { useEffect, useState } from 'react';
import { ARTIFACTS, artifactLabel, isNameKoTentative, type Artifact } from '@/entities/artifact';
import { ArtifactViewer } from '@/widgets/artifact-viewer';

const PER_PAGE = 10;

export function ArtifactsPage() {
  const [selected, setSelected] = useState<Artifact | null>(null);
  const [page, setPage] = useState(1);

  const pageCount = Math.max(1, Math.ceil(ARTIFACTS.length / PER_PAGE));
  const start = (page - 1) * PER_PAGE;
  const shown = ARTIFACTS.slice(start, start + PER_PAGE);

  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelected(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected]);

  const goTo = (next: number) => {
    setPage(Math.min(pageCount, Math.max(1, next)));
    // 페이지를 넘기면 목록 첫 줄부터 보이게 — 아래쪽에 머물러 있으면 뭐가 바뀌었는지 알기 어렵다.
    document.querySelector('.aa-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // 페이지 번호는 현재 위치 기준 최대 7개만 노출하고 양 끝은 생략 부호로 접는다.
  const numbers: (number | '…')[] = [];
  for (let n = 1; n <= pageCount; n += 1) {
    if (n === 1 || n === pageCount || Math.abs(n - page) <= 2) numbers.push(n);
    else if (numbers[numbers.length - 1] !== '…') numbers.push('…');
  }

  return (
    <div className="artifact-archive">
      <div className="aa-head">
        <div className="panel-eyebrow">Artifact Archive</div>
        <h2 className="aa-title">유물 아카이브</h2>
        <p className="aa-sub">
          한양도성 타임머신·발굴 성과로 복원된 3D 유물 {ARTIFACTS.length}건입니다. 카드를 누르면 모델을 직접 돌려볼 수 있습니다.
        </p>
        <p className="aa-range">
          {start + 1}–{Math.min(start + PER_PAGE, ARTIFACTS.length)} / {ARTIFACTS.length}건 · {page}쪽 (전체 {pageCount}쪽)
        </p>
      </div>

      <div className="aa-grid">
        {shown.map((a) => (
          <button className="aa-card" key={a.folder} onClick={() => setSelected(a)}>
            <div className="aa-thumb">
              <img src={a.thumbnail} alt={artifactLabel(a)} loading="lazy" />
            </div>
            <div className="aa-card-body">
              <div className="aa-card-title">
                {artifactLabel(a)}
                {isNameKoTentative(a) && (
                  <span className="aa-tentative" title="국가유산청 공식 목록과 자동 대조한 추정 명칭입니다">추정</span>
                )}
              </div>
              {a.nameKo && <div className="aa-card-en">{a.nameEn}</div>}
              <div className="aa-chips">
                {a.site && <span className="aa-chip aa-chip-site">{a.site}</span>}
                {a.tags.slice(0, 3).map((t) => (
                  <span className="aa-chip" key={t}>{t}</span>
                ))}
              </div>
            </div>
          </button>
        ))}
      </div>

      <nav className="aa-pager" aria-label="유물 목록 페이지">
        <button className="aa-page-btn" onClick={() => goTo(page - 1)} disabled={page === 1}>이전</button>
        {numbers.map((n, i) =>
          n === '…' ? (
            <span className="aa-page-gap" key={`gap-${i}`}>…</span>
          ) : (
            <button
              key={n}
              className={`aa-page-btn${n === page ? ' is-current' : ''}`}
              onClick={() => goTo(n)}
              aria-current={n === page ? 'page' : undefined}
            >
              {n}
            </button>
          ),
        )}
        <button className="aa-page-btn" onClick={() => goTo(page + 1)} disabled={page === pageCount}>다음</button>
      </nav>

      {/* 공공누리 출처 표시 — 국가유산청 이용 안내(instructionsForUse3)에 따른 필수 고지 */}
      <footer className="aa-legal">
        <p>
          본 저작물은 국가유산청 <strong>‘국가유산 디지털 서비스’</strong>에서 공공누리 제1유형으로 개방한 자료를 이용하였습니다.
          3D 모델은 Korea Heritage Service 가 제작해 CC BY(출처표시)로 공개한 자산입니다.
        </p>
        <p>
          출처 · <a href="https://digital.khs.go.kr/" target="_blank" rel="noreferrer noopener">국가유산청 국가유산 디지털 서비스</a>
          <span className="aa-legal-sep">|</span>
          본 서비스는 국가유산청과 무관한 별도의 아카이브로, 기관의 후원이나 승인을 받지 않았습니다.
        </p>
      </footer>

      {selected && (
        <div className="aa-modal" onClick={() => setSelected(null)}>
          <div className="aa-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="aa-modal-head">
              <div>
                <div className="aa-modal-title">{artifactLabel(selected)}</div>
                <div className="aa-modal-sub">
                  {selected.nameKo ? `${selected.nameEn} · ` : ''}
                  {selected.faceCount.toLocaleString()} faces · 등급 {selected.class}
                  {selected.site ? ` · ${selected.site}` : ''}
                </div>
              </div>
              <button className="jl-close" onClick={() => setSelected(null)} title="닫기">✕</button>
            </div>

            <div className="aa-modal-body">
              <ArtifactViewer folder={selected.folder} />
              <div className="aa-modal-info">
                <p className="aa-desc">{selected.description}</p>
                <div className="aa-chips">
                  {selected.tags.map((t) => (
                    <span className="aa-chip" key={t}>{t}</span>
                  ))}
                </div>
                <div className="aa-credit">
                  {selected.nameKoSource === 'khs-llm' && (
                    <>
                      명칭 대조 · 국가유산청 국가유산 디지털 서비스 목록
                      {selected.nameKoConfirmed ? '' : ' (추정 — 검수 전)'}
                      <br />
                    </>
                  )}
                  {selected.descriptionSource && <>해설 출처 · {selected.descriptionSource}<br /></>}
                  라이선스 · {selected.license}
                  <br />
                  <a href={selected.viewerUrl} target="_blank" rel="noreferrer noopener">원본 모델 보기 ↗</a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
