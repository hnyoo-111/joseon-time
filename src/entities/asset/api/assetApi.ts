import JSZip from 'jszip';
import { supabase } from '@/shared/lib/supabaseClient';
import type { Asset, AssetStatus } from '../model/types';

const STORAGE_BUCKET = 'assets';
const SELECT_COLUMNS = 'id, region_id, title, description, category, lon, lat, status, model_url, thumbnail_url, created_at';

interface AssetRow {
  id: string;
  region_id: string;
  title: string;
  description: string | null;
  category: string | null;
  lon: number | null;
  lat: number | null;
  status: AssetStatus;
  model_url: string | null;
  thumbnail_url: string | null;
  created_at: string;
}

function toAsset(row: AssetRow): Asset {
  return {
    id: row.id,
    regionId: row.region_id,
    title: row.title,
    description: row.description ?? undefined,
    category: row.category ?? undefined,
    lon: row.lon,
    lat: row.lat,
    status: row.status,
    modelUrl: row.model_url ?? undefined,
    thumbnailUrl: row.thumbnail_url ?? undefined,
    createdAt: row.created_at,
  };
}

export async function fetchAssetsByRegion(regionId: string): Promise<Asset[]> {
  const { data, error } = await supabase
    .from('assets')
    .select(SELECT_COLUMNS)
    .eq('region_id', regionId)
    .order('created_at', { ascending: false })
    .returns<AssetRow[]>();

  if (error || !data) return [];
  return data.map(toAsset);
}

export interface NewAssetInput {
  regionId: string;
  title: string;
  description?: string;
  category?: string;
  lon: number;
  lat: number;
}

export async function createAsset(input: NewAssetInput): Promise<Asset | null> {
  const { data, error } = await supabase
    .from('assets')
    .insert({
      region_id: input.regionId,
      title: input.title,
      description: input.description || null,
      category: input.category || null,
      lon: input.lon,
      lat: input.lat,
      status: 'draft',
    })
    .select(SELECT_COLUMNS)
    .single<AssetRow>();

  if (error || !data) return null;
  return toAsset(data);
}

export interface CreateAssetFromFileResult {
  asset: Asset | null;
  /** 업로드나 저장 중 문제가 있었지만 자산 행 자체는 만들어졌을 때 표시할 경고 메시지 */
  warning?: string;
  error?: string;
}

/** 파일을 {regionSlug}/{assetId}/{filename} 경로로 업로드하고, 새 3D 자산 행을 만들어 model_url을 채웁니다. */
export async function createAssetFromFile(regionId: string, regionSlug: string, file: File): Promise<CreateAssetFromFileResult> {
  const { data: created, error: insertError } = await supabase
    .from('assets')
    .insert({
      region_id: regionId,
      title: file.name.replace(/\.[^./]+$/, ''),
      category: '3d_model',
      status: 'draft',
    })
    .select(SELECT_COLUMNS)
    .single<AssetRow>();
  if (insertError || !created) {
    return { asset: null, error: insertError?.message ?? '자산 등록에 실패했습니다.' };
  }

  const path = `${regionSlug}/${created.id}/${file.name}`;
  const { error: uploadError } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file);
  if (uploadError) {
    return { asset: toAsset(created), warning: `자산은 등록됐지만 파일 업로드에 실패했습니다: ${uploadError.message}` };
  }

  const { data: pub } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  const { data: updated, error: updateError } = await supabase
    .from('assets')
    .update({ model_url: pub.publicUrl })
    .eq('id', created.id)
    .select(SELECT_COLUMNS)
    .single<AssetRow>();

  if (updateError || !updated) {
    return { asset: toAsset(created), warning: '파일은 업로드됐지만 자산에 연결하는 데 실패했습니다.' };
  }
  return { asset: toAsset(updated) };
}

/** zip 안의 파일 목록에서 대표 3D 모델(.glb 우선, 없으면 .gltf)을 찾습니다. */
function findEntryModelPath(paths: string[]): string | null {
  const glb = paths.find((p) => p.toLowerCase().endsWith('.glb'));
  if (glb) return glb;
  const gltf = paths.filter((p) => p.toLowerCase().endsWith('.gltf')).sort((a, b) => a.split('/').length - b.split('/').length);
  return gltf[0] ?? null;
}

/**
 * zip 파일을 풀어서 내부 폴더 구조 그대로 업로드합니다 (.gltf + .bin + 텍스처처럼
 * 여러 파일이 상대경로로 서로를 참조하는 구조를 그대로 유지하기 위함).
 * zip 안에서 찾은 대표 .glb/.gltf 파일을 model_url로 연결합니다.
 */
export async function createAssetFromZip(regionId: string, regionSlug: string, zipFile: File): Promise<CreateAssetFromFileResult> {
  const { data: created, error: insertError } = await supabase
    .from('assets')
    .insert({
      region_id: regionId,
      title: zipFile.name.replace(/\.[^./]+$/, ''),
      category: '3d_model',
      status: 'draft',
    })
    .select(SELECT_COLUMNS)
    .single<AssetRow>();
  if (insertError || !created) {
    return { asset: null, error: insertError?.message ?? '자산 등록에 실패했습니다.' };
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(zipFile);
  } catch {
    return { asset: toAsset(created), warning: 'zip 파일을 여는 데 실패했습니다. 파일이 손상되지 않았는지 확인해주세요.' };
  }

  const entries = Object.values(zip.files).filter((f) => !f.dir);
  if (entries.length === 0) {
    return { asset: toAsset(created), warning: 'zip 안에 파일이 없습니다.' };
  }

  const entryModelPath = findEntryModelPath(entries.map((f) => f.name));
  if (!entryModelPath) {
    return { asset: toAsset(created), warning: 'zip 안에서 .glb 또는 .gltf 파일을 찾지 못했습니다.' };
  }

  const basePath = `${regionSlug}/${created.id}`;
  let uploadFailures = 0;
  for (const entry of entries) {
    const blob = await entry.async('blob');
    const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(`${basePath}/${entry.name}`, blob);
    if (error) uploadFailures += 1;
  }

  const { data: pub } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(`${basePath}/${entryModelPath}`);
  const { data: updated, error: updateError } = await supabase
    .from('assets')
    .update({ model_url: pub.publicUrl })
    .eq('id', created.id)
    .select(SELECT_COLUMNS)
    .single<AssetRow>();

  if (updateError || !updated) {
    return { asset: toAsset(created), warning: '파일은 업로드됐지만 자산에 연결하는 데 실패했습니다.' };
  }
  if (uploadFailures > 0) {
    return { asset: toAsset(updated), warning: `${uploadFailures}개 파일 업로드에 실패했습니다 — 텍스처가 깨져 보일 수 있습니다.` };
  }
  return { asset: toAsset(updated) };
}

export async function updateAssetStatus(id: string, status: AssetStatus): Promise<Asset | null> {
  const { data, error } = await supabase
    .from('assets')
    .update({ status })
    .eq('id', id)
    .select(SELECT_COLUMNS)
    .single<AssetRow>();

  if (error || !data) return null;
  return toAsset(data);
}

export async function updateAssetLocation(id: string, lon: number, lat: number): Promise<Asset | null> {
  const { data, error } = await supabase
    .from('assets')
    .update({ lon, lat })
    .eq('id', id)
    .select(SELECT_COLUMNS)
    .single<AssetRow>();

  if (error || !data) return null;
  return toAsset(data);
}

/**
 * 지도 마커에 쓸 대표 사진을 올립니다 — {regionSlug}/{assetId}/thumbnail.{ext} 경로에
 * 저장하고 thumbnail_url을 채웁니다. 같은 자산에 다시 올리면 덮어씁니다(upsert).
 */
export async function uploadThumbnail(id: string, regionSlug: string, file: File): Promise<Asset | null> {
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `${regionSlug}/${id}/thumbnail.${ext}`;
  const { error: uploadError } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, { upsert: true });
  if (uploadError) return null;

  const { data: pub } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  // 덮어쓴 경우 CDN/브라우저 캐시가 예전 이미지를 계속 보여줄 수 있어 캐시 무력화 쿼리를 붙인다.
  const thumbnailUrl = `${pub.publicUrl}?v=${Date.now()}`;
  const { data, error } = await supabase
    .from('assets')
    .update({ thumbnail_url: thumbnailUrl })
    .eq('id', id)
    .select(SELECT_COLUMNS)
    .single<AssetRow>();

  if (error || !data) return null;
  return toAsset(data);
}

/** model_url/thumbnail_url(public URL)에서 스토리지 객체 경로만 추출합니다. */
function storagePathFromPublicUrl(url: string): string | null {
  const marker = `/object/public/${STORAGE_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(url.slice(idx + marker.length).split('?')[0]);
}

/** 자산 행을 삭제하고, 연결된 파일(모델·썸네일)이 있으면 스토리지에서도 함께 지웁니다(파일 삭제 실패는 무시). */
export async function deleteAsset(id: string, modelUrl?: string, thumbnailUrl?: string): Promise<boolean> {
  const { error } = await supabase.from('assets').delete().eq('id', id);
  if (error) return false;

  const paths = [modelUrl, thumbnailUrl].map((u) => u && storagePathFromPublicUrl(u)).filter((p): p is string => !!p);
  if (paths.length) await supabase.storage.from(STORAGE_BUCKET).remove(paths);
  return true;
}

/** 공개(published) 상태이면서 지도에 표시할 좌표가 있는 자산만 전 지역에서 가져옵니다 (유저 페이지용). */
export async function fetchPublishedAssets(): Promise<Asset[]> {
  const { data, error } = await supabase
    .from('assets')
    .select(SELECT_COLUMNS)
    .eq('status', 'published')
    .not('lon', 'is', null)
    .not('lat', 'is', null)
    .returns<AssetRow[]>();

  if (error || !data) return [];
  return data.map(toAsset);
}
