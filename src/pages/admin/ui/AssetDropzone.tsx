import { useRef, useState, type DragEvent } from 'react';
import { createAssetFromFile, createAssetFromZip, type Asset } from '@/entities/asset';

const SINGLE_FILE_EXT = ['.glb', '.gltf'];
const ZIP_EXT = '.zip';

function isAccepted(file: File) {
  const name = file.name.toLowerCase();
  return SINGLE_FILE_EXT.some((ext) => name.endsWith(ext)) || name.endsWith(ZIP_EXT);
}

export function AssetDropzone({ regionId, regionSlug, onUploaded }: { regionId: string; regionSlug: string; onUploaded: (a: Asset) => void }) {
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!isAccepted(file)) { setError('.glb, .gltf 또는 .zip 파일만 업로드할 수 있습니다.'); return; }
    setBusy(true);
    setError(null);
    const isZip = file.name.toLowerCase().endsWith(ZIP_EXT);
    const result = isZip
      ? await createAssetFromZip(regionId, regionSlug, file)
      : await createAssetFromFile(regionId, regionSlug, file);
    setBusy(false);
    if (result.error || !result.asset) { setError(result.error ?? '업로드에 실패했습니다. 다시 시도해주세요.'); return; }
    if (result.warning) setError(result.warning);
    onUploaded(result.asset);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }

  return (
    <div
      className={'admin-dropzone' + (dragOver ? ' drag-over' : '')}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef} type="file" accept=".glb,.gltf,.zip" className="admin-dropzone-input"
        onChange={(e) => handleFiles(e.target.files)}
      />
      {busy ? (
        <div className="admin-dropzone-text">업로드 중…</div>
      ) : (
        <>
          <div className="admin-dropzone-icon">＋</div>
          <div className="admin-dropzone-text">
            3D 모델(.glb / .gltf)이나, .bin·텍스처가 함께 있는 경우 통째로 압축한 .zip을<br />
            여기로 끌어다 놓거나 클릭해서 선택하세요
          </div>
        </>
      )}
      {error && <div className="admin-error">{error}</div>}
    </div>
  );
}
