import { Fragment, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/shared/lib/supabaseClient';
import { fetchAdminProfile, type AdminProfile } from '@/entities/admin';
import { fetchAssetsByRegion, createAsset, updateAssetStatus, updateAssetLocation, deleteAsset, STATUS_LABEL, type Asset } from '@/entities/asset';
import { AssetDropzone } from './AssetDropzone';
import { ModelPreviewModal } from '@/shared/ui/ModelPreviewModal';

type LoadState = 'loading' | 'unauthenticated' | 'ready';

function formatCoord(v: number | null) {
  return v === null ? '—' : v.toFixed(4);
}

export function AdminPage() {
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>('loading');
  const [email, setEmail] = useState('');
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [form, setForm] = useState({ title: '', category: '', lon: '', lat: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [previewAsset, setPreviewAsset] = useState<Asset | null>(null);
  const [editingCoordId, setEditingCoordId] = useState<string | null>(null);
  const [coordDraft, setCoordDraft] = useState({ lon: '', lat: '' });
  const [coordSaving, setCoordSaving] = useState(false);
  const [coordError, setCoordError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (!user) { if (!cancelled) setState('unauthenticated'); return; }
      setEmail(user.email ?? '');
      const p = await fetchAdminProfile(user.id);
      if (cancelled) return;
      if (!p) { setState('unauthenticated'); return; }
      setProfile(p);
      const list = await fetchAssetsByRegion(p.regionId);
      if (cancelled) return;
      setAssets(list);
      setState('ready');
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (state === 'unauthenticated') navigate('/admin/login');
  }, [state, navigate]);

  const groups = useMemo(() => {
    const map = new Map<string, Asset[]>();
    for (const a of assets) {
      const key = a.category || '미분류';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    return Array.from(map.entries());
  }, [assets]);

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate('/admin/login');
  }

  async function handleAddAsset(e: FormEvent) {
    e.preventDefault();
    if (!profile) return;
    const lon = Number(form.lon), lat = Number(form.lat);
    if (!form.title.trim()) { setFormError('제목을 입력해주세요.'); return; }
    if (Number.isNaN(lon) || Number.isNaN(lat)) { setFormError('위경도는 숫자로 입력해주세요.'); return; }
    setSaving(true);
    setFormError(null);
    const created = await createAsset({
      regionId: profile.regionId, title: form.title.trim(),
      category: form.category.trim() || undefined, description: form.description.trim() || undefined,
      lon, lat,
    });
    setSaving(false);
    if (!created) { setFormError('저장에 실패했습니다. 다시 시도해주세요.'); return; }
    setAssets((prev) => [created, ...prev]);
    setForm({ title: '', category: '', lon: '', lat: '', description: '' });
  }

  function startEditCoord(a: Asset) {
    setEditingCoordId(a.id);
    setCoordDraft({ lon: a.lon !== null ? String(a.lon) : '', lat: a.lat !== null ? String(a.lat) : '' });
    setCoordError(null);
  }

  async function handleSaveCoord(id: string) {
    const lon = Number(coordDraft.lon), lat = Number(coordDraft.lat);
    if (Number.isNaN(lon) || Number.isNaN(lat)) { setCoordError('위경도는 숫자로 입력해주세요.'); return; }
    setCoordSaving(true);
    const updated = await updateAssetLocation(id, lon, lat);
    setCoordSaving(false);
    if (!updated) { setCoordError('저장에 실패했습니다.'); return; }
    setAssets((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    setEditingCoordId(null);
  }

  async function handleDelete(a: Asset) {
    if (!window.confirm(`"${a.title}"을(를) 삭제할까요? 되돌릴 수 없습니다.`)) return;
    setDeletingId(a.id);
    const ok = await deleteAsset(a.id, a.modelUrl);
    setDeletingId(null);
    if (!ok) return;
    setAssets((prev) => prev.filter((x) => x.id !== a.id));
    if (previewAsset?.id === a.id) setPreviewAsset(null);
  }

  async function handleTogglePublish(a: Asset) {
    setTogglingId(a.id);
    const next = a.status === 'published' ? 'draft' : 'published';
    const updated = await updateAssetStatus(a.id, next);
    setTogglingId(null);
    if (!updated) return;
    setAssets((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
  }

  if (state !== 'ready' || !profile) {
    return <div className="admin-loading">불러오는 중…</div>;
  }

  return (
    <div className="admin-page">
      <div className="admin-topbar">
        <div>
          <div className="admin-topbar-kicker">조선의 시간 · 관리자</div>
          <div className="admin-topbar-title">{profile.regionName} 담당자 대시보드</div>
        </div>
        <div className="admin-topbar-right">
          <span className="admin-user-email">{email}</span>
          <button className="admin-btn-ghost" onClick={handleLogout}>로그아웃</button>
        </div>
      </div>

      <div className="admin-body">
        <div className="admin-panel">
          <div className="admin-panel-title">3D 모델 업로드</div>
          <AssetDropzone
            regionId={profile.regionId}
            regionSlug={profile.regionSlug}
            onUploaded={(a) => setAssets((prev) => [a, ...prev])}
          />

          <div className="admin-panel-title admin-panel-title-spaced">좌표로 직접 등록</div>
          <form className="admin-form" onSubmit={handleAddAsset}>
            <label className="admin-field-label">제목</label>
            <input className="admin-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            <label className="admin-field-label">분류</label>
            <input className="admin-input" placeholder="예: artifact, 3d_model" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            <div className="admin-field-row">
              <div>
                <label className="admin-field-label">경도(lon)</label>
                <input className="admin-input" value={form.lon} onChange={(e) => setForm({ ...form, lon: e.target.value })} required />
              </div>
              <div>
                <label className="admin-field-label">위도(lat)</label>
                <input className="admin-input" value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} required />
              </div>
            </div>
            <label className="admin-field-label">설명</label>
            <textarea className="admin-input admin-textarea" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            {formError && <div className="admin-error">{formError}</div>}
            <button type="submit" className="admin-btn-primary" disabled={saving}>
              {saving ? '저장 중…' : '임시저장으로 등록'}
            </button>
          </form>
        </div>

        <div className="admin-panel admin-panel-wide">
          <div className="admin-panel-title">{profile.regionName} 등록 자산 ({assets.length})</div>
          {assets.length === 0 ? (
            <div className="admin-empty">아직 등록된 자산이 없습니다.</div>
          ) : (
            <table className="admin-table admin-layer-table">
              <thead>
                <tr><th>이름</th><th>좌표</th><th>상태</th><th>공개</th><th>등록일</th><th></th><th></th></tr>
              </thead>
              <tbody>
                {groups.map(([category, items]) => (
                  <Fragment key={category}>
                    <tr className="admin-group-row">
                      <td colSpan={7}>{category} <span className="admin-group-count">{items.length}</span></td>
                    </tr>
                    {items.map((a) => (
                      <tr key={a.id}>
                        <td>{a.title}</td>
                        <td>
                          {editingCoordId === a.id ? (
                            <div className="admin-coord-edit">
                              <input
                                className="admin-input admin-coord-input" placeholder="lon"
                                value={coordDraft.lon} onChange={(e) => setCoordDraft({ ...coordDraft, lon: e.target.value })}
                              />
                              <input
                                className="admin-input admin-coord-input" placeholder="lat"
                                value={coordDraft.lat} onChange={(e) => setCoordDraft({ ...coordDraft, lat: e.target.value })}
                              />
                              <button className="admin-link admin-link-btn" disabled={coordSaving} onClick={() => handleSaveCoord(a.id)}>저장</button>
                              <button className="admin-link admin-link-btn admin-link-muted" onClick={() => setEditingCoordId(null)}>취소</button>
                              {coordError && <div className="admin-error admin-coord-error">{coordError}</div>}
                            </div>
                          ) : (
                            <button className="admin-coord-display" onClick={() => startEditCoord(a)}>
                              {formatCoord(a.lon)}, {formatCoord(a.lat)}
                            </button>
                          )}
                        </td>
                        <td><span className={`admin-status admin-status-${a.status}`}>{STATUS_LABEL[a.status]}</span></td>
                        <td>
                          <button
                            className={'admin-switch' + (a.status === 'published' ? ' on' : '')}
                            disabled={togglingId === a.id}
                            onClick={() => handleTogglePublish(a)}
                            aria-label="공개 여부 전환"
                          >
                            <span className="admin-switch-knob" />
                          </button>
                        </td>
                        <td>{new Date(a.createdAt).toLocaleDateString('ko-KR')}</td>
                        <td>
                          {a.modelUrl && (
                            <button className="admin-link admin-link-btn" onClick={() => setPreviewAsset(a)}>미리보기 →</button>
                          )}
                        </td>
                        <td>
                          <button
                            className="admin-link admin-link-btn admin-link-danger"
                            disabled={deletingId === a.id}
                            onClick={() => handleDelete(a)}
                          >
                            삭제
                          </button>
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {previewAsset && previewAsset.modelUrl && (
        <ModelPreviewModal
          title={previewAsset.title}
          src={previewAsset.modelUrl}
          onClose={() => setPreviewAsset(null)}
        />
      )}
    </div>
  );
}
