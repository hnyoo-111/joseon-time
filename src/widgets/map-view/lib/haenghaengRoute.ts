import * as Cesium from 'cesium';

/**
 * 1795년 을묘원행(정조 화성행차) 경로 레이어.
 *
 * 경로는 빌드 전에 굳혀 둔 GeoJSON 을 읽는다(data/scripts/bake_haenghaeng_route.py).
 * 도로망 출처: 「근대 교통로 DB」(https://www.hisgeo.info/wiki/근대_교통로_DB)의 1914년 교통로.
 * 자동차 도로 이전의 도로망이라 현대 도로망보다 1795년 행차로에 가깝지만, 여전히
 * **근사**다 — 값이 흔들리면 안 되므로 굳혀 서빙하고, 화면에 출처·근사임을 표기한다.
 */
export const ROUTE_URL = `${import.meta.env.BASE_URL}routes/hwaseong-haenghaeng.geojson`;

/** 행차로는 한 줄기이므로 한 색으로 둔다. 융릉 참배 왕복만 갈래길이라 색을 나눈다. */
const DAY_COLOR: Record<number, Cesium.Color> = {
  1: Cesium.Color.fromCssColorString('#c0392b'),
  2: Cesium.Color.fromCssColorString('#c0392b'),
  4: Cesium.Color.fromCssColorString('#8e44ad'),
  7: Cesium.Color.fromCssColorString('#c0392b'),
  8: Cesium.Color.fromCssColorString('#c0392b'),
};

export interface RouteLeg {
  id: string;
  day: number;
  label: string;
  distanceKm: number;
}

export interface HaenghaengRoute {
  dataSource: Cesium.GeoJsonDataSource;
  legs: RouteLeg[];
  totalDistanceKm: number;
  /** 근사 경로임을 알리는 고지 문구 — 화면에 그대로 노출해야 한다. */
  disclaimer: string;
}

/**
 * 경로를 뷰어에 추가한다. 반환한 dataSource 의 show 로 토글하고,
 * 화면에서 벗어날 때 removeRoute 로 정리한다.
 */
export async function addHaenghaengRoute(viewer: Cesium.Viewer): Promise<HaenghaengRoute> {
  const raw = await fetch(ROUTE_URL).then((r) => {
    if (!r.ok) throw new Error(`행차 경로를 불러오지 못했습니다 (HTTP ${r.status})`);
    return r.json();
  });

  const dataSource = await Cesium.GeoJsonDataSource.load(raw, { clampToGround: true });
  dataSource.name = 'hwaseong-haenghaeng';

  const legs: RouteLeg[] = [];
  for (const entity of dataSource.entities.values) {
    const props = entity.properties;
    if (!props) continue;
    const kind = props.kind?.getValue();

    if (kind === 'leg' && entity.polyline) {
      const day = props.day.getValue() as number;
      const direction = props.direction?.getValue() as string | undefined;
      // 환궁길은 갈 때와 같은 도로다. 겹쳐 그리면 나란한 두 줄로 보여 다른 길처럼 읽히므로
      // 지도에는 가는 길(outbound)과 참배 왕복(spur)만 그린다. 이동 자체는 그대로 재생된다.
      if (direction === 'inbound') entity.show = false;
      const color = DAY_COLOR[day] ?? Cesium.Color.DIMGRAY;
      entity.polyline.width = new Cesium.ConstantProperty(5);
      entity.polyline.material = new Cesium.PolylineOutlineMaterialProperty({
        color,
        outlineColor: Cesium.Color.WHITE.withAlpha(0.55),
        outlineWidth: 1.5,
      });
      entity.polyline.clampToGround = new Cesium.ConstantProperty(true);
      legs.push({
        id: props.id.getValue(),
        day,
        label: props.label.getValue(),
        distanceKm: props.distanceKm.getValue(),
      });
      continue;
    }

    if (kind === 'waypoint') {
      // 터만 남은 지점(approx)은 테두리를 점선 느낌의 옅은 색으로 구분한다 —
      // 확인된 위치와 근사 위치를 같은 모양으로 그리면 없는 사실을 만드는 셈이다.
      const approx = props.confidence?.getValue() === 'approx';
      entity.point = new Cesium.PointGraphics({
        pixelSize: approx ? 9 : 11,
        color: approx ? Cesium.Color.fromCssColorString('#b8a06a') : Cesium.Color.fromCssColorString('#c0392b'),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      });
      entity.label = new Cesium.LabelGraphics({
        text: `${props.name.getValue()}${approx ? ' (근사)' : ''}`,
        font: '600 13px "Malgun Gothic", sans-serif',
        fillColor: Cesium.Color.fromCssColorString('#292725'),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -14),
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        translucencyByDistance: new Cesium.NearFarScalar(4.0e4, 1.0, 3.0e5, 0.0),
      });
    }
  }

  legs.sort((a, b) => a.day - b.day);
  await viewer.dataSources.add(dataSource);

  return {
    dataSource,
    legs,
    totalDistanceKm: raw.properties?.totalDistanceKm ?? 0,
    disclaimer: raw.properties?.disclaimer ?? '',
  };
}

export function removeRoute(viewer: Cesium.Viewer, route: HaenghaengRoute | null) {
  if (!route) return;
  viewer.dataSources.remove(route.dataSource, true);
}

/** 경로 전체가 화면에 들어오도록 카메라를 맞춘다. */
export function flyToRoute(viewer: Cesium.Viewer, route: HaenghaengRoute) {
  viewer.flyTo(route.dataSource, {
    duration: 1.6,
    offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-55), 0),
  });
}
