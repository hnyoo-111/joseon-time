import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { artifactModelUrl } from '@/entities/artifact';

interface Props {
  /** 자산 서버 폴더명. 바뀌면 씬을 통째로 다시 만든다. */
  folder: string;
}

type Status =
  | { kind: 'loading'; percent: number }
  | { kind: 'ready' }
  | { kind: 'error'; message: string };

/** 로드된 GLTF 씬의 지오메트리/머티리얼/텍스처를 남김없이 반환한다. */
function disposeObject(root: THREE.Object3D) {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (!material) continue;
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) value.dispose();
      }
      material.dispose();
    }
  });
}

export function ArtifactViewer({ folder }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>({ kind: 'loading', percent: 0 });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    setStatus({ kind: 'loading', percent: 0 });

    const scene = new THREE.Scene();
    // 아카이브 지면색(--surface)과 같은 흰 바탕. 밝은 배경에서는 유물이 공중에 뜬 것처럼
    // 보이기 쉬워, 아래쪽에 접지 그림자를 깔아 바닥을 만든다(모델 로드 후 추가).
    scene.background = new THREE.Color('#fffdf7');

    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 2000);
    camera.position.set(0, 0, 3);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    // 어두운 배경 때보다 노출을 낮춘다 — 흰 바탕에서 같은 값이면 밝은 면이 날아간다.
    renderer.toneMappingExposure = 0.95;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(renderer.domElement);

    // 3점 조명 — HDR 환경맵 없이도 유물의 굴곡이 읽히도록 구성한다.
    const key = new THREE.DirectionalLight(0xfff4e2, 2.4);
    key.position.set(3, 4, 3);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    const fill = new THREE.DirectionalLight(0xdce6ff, 1.0);
    fill.position.set(-4, 1, 2);
    const rim = new THREE.DirectionalLight(0xffffff, 1.2);
    rim.position.set(0, 2, -5);
    // 흰 배경에서는 주변광이 세면 형태가 뭉개진다. 어두운 배경 때보다 낮춘다.
    scene.add(key, fill, rim, new THREE.AmbientLight(0xffffff, 0.5));

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.2;
    // 관람자가 직접 돌리기 시작하면 자동 회전은 방해가 되므로 그 순간 멈춘다.
    const stopAutoRotate = () => { controls.autoRotate = false; };
    controls.addEventListener('start', stopAutoRotate);

    const resize = () => {
      const { clientWidth, clientHeight } = host;
      if (!clientWidth || !clientHeight) return;
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(clientWidth, clientHeight, false);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    let disposed = false;
    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      controls.update();
      renderer.render(scene, camera);
    };
    tick();

    let model: THREE.Object3D | null = null;
    let shadowPlane: THREE.Mesh | null = null;
    const loader = new GLTFLoader();
    loader.load(
      artifactModelUrl(folder),
      (gltf) => {
        if (disposed) {
          disposeObject(gltf.scene);
          return;
        }
        model = gltf.scene;

        // 모델마다 원점과 스케일이 제각각이라, 바운딩 박스로 원점 정렬 후 화면에 맞춘다.
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        model.position.sub(center);

        const radius = Math.max(size.length() / 2, 0.001);
        const distance = radius / Math.sin((camera.fov * Math.PI) / 360);
        camera.near = distance / 100;
        camera.far = distance * 100;
        camera.position.set(distance * 0.6, distance * 0.35, distance * 0.85);
        camera.updateProjectionMatrix();
        controls.target.set(0, 0, 0);
        controls.minDistance = distance * 0.15;
        controls.maxDistance = distance * 6;
        controls.update();

        // 접지 그림자 — 모델 크기가 제각각이라 조명 위치·그림자 카메라를 반지름 기준으로 맞춘다.
        model.traverse((node) => {
          if ((node as THREE.Mesh).isMesh) node.castShadow = true;
        });
        key.position.set(radius * 3, radius * 4, radius * 3);
        const span = radius * 2.5;
        key.shadow.camera.left = -span;
        key.shadow.camera.right = span;
        key.shadow.camera.top = span;
        key.shadow.camera.bottom = -span;
        key.shadow.camera.near = radius * 0.05;
        key.shadow.camera.far = radius * 20;
        key.shadow.camera.updateProjectionMatrix();

        shadowPlane = new THREE.Mesh(
          new THREE.PlaneGeometry(radius * 10, radius * 10),
          new THREE.ShadowMaterial({ opacity: 0.14 }),
        );
        shadowPlane.rotation.x = -Math.PI / 2;
        shadowPlane.position.y = -size.y / 2;
        shadowPlane.receiveShadow = true;
        scene.add(shadowPlane);

        scene.add(model);
        setStatus({ kind: 'ready' });
      },
      (event) => {
        if (disposed) return;
        // 서버가 Content-Length 를 주지 않으면 total 이 0이라 비율을 계산할 수 없다.
        const percent = event.total > 0 ? Math.round((event.loaded / event.total) * 100) : 0;
        setStatus({ kind: 'loading', percent });
      },
      () => {
        if (disposed) return;
        setStatus({ kind: 'error', message: '3D 모델을 불러오지 못했습니다. 자산 서버 연결을 확인해 주세요.' });
      },
    );

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.removeEventListener('start', stopAutoRotate);
      controls.dispose();
      if (model) {
        scene.remove(model);
        disposeObject(model);
      }
      if (shadowPlane) {
        scene.remove(shadowPlane);
        shadowPlane.geometry.dispose();
        (shadowPlane.material as THREE.Material).dispose();
      }
      scene.clear();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [folder]);

  return (
    <div className="artifact-viewer">
      <div className="av-canvas" ref={hostRef} />
      {status.kind === 'loading' && (
        <div className="av-overlay">
          <span className="av-spinner" />
          <span className="av-overlay-text">
            3D 모델을 불러오는 중{status.percent > 0 ? ` · ${status.percent}%` : ''}
          </span>
        </div>
      )}
      {status.kind === 'error' && (
        <div className="av-overlay">
          <span className="av-overlay-text av-error">{status.message}</span>
        </div>
      )}
      {status.kind === 'ready' && (
        <div className="av-hint">드래그로 회전 · 휠로 확대 · 우클릭 드래그로 이동</div>
      )}
    </div>
  );
}
