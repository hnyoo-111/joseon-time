# 조선의 시간 — FSD 프로토타입

React + TypeScript + Vite + Cesium. [Feature-Sliced Design](https://feature-sliced.design/) 레이어 구조로 구성했습니다.

## 실행

```bash
npm install
npm run dev      # 개발 서버
npm run build    # 타입체크 + 프로덕션 빌드
```

## 페이지 (라우트)

| 경로 | 페이지 | 설명 |
|---|---|---|
| `/` | 메인(랜딩) | 시간 이야기를 고르는 첫 화면 |
| `/map` | 지도(Explore) | 왕/문화유산 타임라인 + Cesium 지도 + 상세 패널 |
| `/journey/:journeyId` | 시간여행 | 풀스크린 지도 + 스텝별 스토리 |
| `/painting/:workId` | 그림뷰어 | 회화 목업 + 핫스팟 → 실제 장소 이동 |

## 레이어 구조

```
src/
  app/        앱 초기화, 라우팅, 전역 상태(zustand), 전역 스타일
  pages/      위 4개 라우트의 엔트리 컴포넌트
  widgets/    header, timeline-sidebar, detail-panel, map-view(Cesium), map-controls,
              time-compare, journey-timeline-bar, journey-log
  features/   global-search 등 사용자 액션 단위
  entities/   king, heritage, work, event, journey, painting — 도메인 모델 + mock 데이터
  shared/     디자인 토큰(tokens.css), 공통 UI 프리미티브(kit.css, Primitives.tsx), 아이콘
```

`@/*`는 `src/*`로 매핑된 경로 별칭입니다.

## 알아두면 좋은 것들

- **`widgets/map-view`가 유일한 Cesium 인스턴스 소스**입니다. `/map`과 `/journey/:id`는 각자 별도의
  `<MapView>`를 마운트합니다 — 페이지 전환 시 Cesium이 다시 초기화되지만(약 1~2초), 대신 각 페이지가
  완전히 독립적으로 유지됩니다(FSD 원칙에 더 부합). 지도를 두 라우트 간에 영구적으로 공유하려면
  `app/layouts`에 두 라우트를 감싸는 레이아웃을 만들고 `MapView`를 그쪽으로 옮기면 됩니다.
- `entities/journey`의 시간여행 스텝 중 `mock: true`가 붙은 항목은 정확한 좌표가 확인되지 않아
  근사 배치한 것입니다 — 실제 데이터를 확보하면 이 플래그와 `mockNote`를 지우고 좌표만 교체하면 됩니다.
- `widgets/map-view/lib/cesiumSetup.ts`의 `CESIUM_ION_TOKEN`/`CESIUM_ION_ASSET_ID`는 기존
  프로토타입(`joseon_time.html`)과 동일한 값을 그대로 옮겼습니다.
