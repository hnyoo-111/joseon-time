// config.js 템플릿 — 이 파일을 config.js로 복사한 뒤 값을 채운다. config.js는 커밋 금지.
// 서버(릴리스)와 로컬 개발의 차이는 assetBase·modelFile 두 값뿐이다.
window.JOSEON_CONFIG = {
  // Cesium ion 액세스 토큰 — 반드시 도메인 제한(allowed URLs) 토큰만 사용할 것.
  // 브라우저에 전달되는 것이 전제이므로 비밀이 아니다. 방어선은 도메인 제한이다.
  cesiumIonToken: '',

  // 서버 릴리스:      'asset/'  + 'scene.glb'      (S7 최적화 산출물, 같은 오리진)
  // 로컬 원본 확인용: 'heritage/asset/' + 'scene.gltf'
  assetBase: 'asset/',
  modelFile: 'scene.glb'
};
