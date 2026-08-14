import * as Cesium from 'cesium';
import type { HaenghaengRoute, RouteDayPlan } from './haenghaengRoute';

/**
 * 굳혀 둔 여정 경로 위를 시계(clock)에 맞춰 이동하는 행렬 시뮬레이션.
 * (여정별 일정·기준일은 경로 GeoJSON 의 dayPlan/baseDate 에, 편성은 PROCESSION_CONFIGS 에 있다.)
 *
 * 시간축 설계
 *  - 시뮬레이션 시계는 일정(dayPlan)을 **실제 시간 그대로** 흐른다(화성 8일, 유배길 2일 …).
 *  - 이동 소요 시간은 임의로 정하지 않고 **행렬의 걷는 속도**에서 나온다.
 *    거리 ÷ WALK_SPEED = 소요 시간. 그래서 21.9km 구간이 약 6시간이 된다.
 *  - 시계는 1일차 출발 + 대열 전체가 길 위에 올라온 시점부터 시작한다(첫인상 확보).
 *
 * 대열 설계 — 종대(열차식) 추종
 *  - 이동일 경로를 전부 이어 하나의 폴리라인으로 만들고 **호 길이(arc length)** 로 매개화한다.
 *  - 선두의 진행 거리 s(t) = 걷기 시작한 뒤 경과 시간 × 보행 속도. 각 인원은 경로상
 *    s(t) - gapM 지점에 선다. 즉 열차 객차처럼 **경로 자체를 따라** 뒤따르므로
 *    코너에서 각자 자기 위치의 접선 방향으로 돌고, 대형은 그대로 유지된다.
 *  - 시간 지연 방식(몇 초 전의 선두 위치)이 아니라 거리 방식이라, 행렬이 멈춰도
 *    전원이 경로 위 제자리(선두 뒤 gapM 미터)에 서 있는다 — 한 점에 겹치지 않는다.
 *  - 출발 전(선두 s=0)에는 첫 구간 접선을 뒤로 연장해 궁 앞에 종대로 도열시킨다.
 *
 * 한계(반드시 인지할 것)
 *  - 편성 인원은 전부 Blender 파이프라인 산출물(`public/models/`)이라 `walk` 클립을
 *    갖고 있고, runAnimations 로 원속도 재생한다.
 *  - 아직 이동 거리 동기화는 아니다. 시계 배속을 올리면 이동만 빨라지고 걸음은 그대로다.
 *    거리에 맞추려면 ModelAnimationCollection 의 animationTime 콜백이 필요한데
 *    Entity 의 ModelGraphics 로는 닿지 않아 Model 프리미티브 직접 관리로 바꿔야 한다.
 */

/**
 * 행렬의 이동 속도(m/s). 성인 보행은 1.4 m/s 지만 1,700여 명 규모의 의장 행렬은
 * 대열을 맞춰 훨씬 느리게 움직인다. 3.6km/h 로 잡으면 창덕궁→시흥행궁 21.9km 가
 * 약 6시간이 되어 「윤2월 9일 오전 7시 출발, 저녁 무렵 시흥행궁 도착」 기록과 맞물린다.
 */
export const WALK_SPEED = 1.0;

/** 하루의 길이(초). */
const DAY_SECONDS = 24 * 3600;

export interface ProcessionUnit {
  /** 모델의 원본 폴더명(파이프라인 재굽기 시 식별용). */
  folder: string;
  label: string;
  /** 모델 URL — Blender 파이프라인 산출물(`public/models/*.glb`)만 쓴다. */
  uri: string;
  /** glTF 애니메이션(`walk`)을 재생할지. 정적 스캔 모델은 false. */
  animated?: boolean;
  /** 선두로부터 경로를 따라 뒤로 떨어진 거리(m). */
  gapM: number;
  /** 진행 방향 기준 좌우 오프셋(m). 음수는 왼쪽. */
  lateralM: number;
  /** 머리 위 한글 라벨을 띄울지. 무리마다 대표 한 명에게만 붙인다(전원이면 글자만 빽빽해진다). */
  showLabel?: boolean;
}

/**
 * Blender 로 손본 기수 모델. 원본(raw)을 덮어쓰지 않고 앱 정적 자산으로 따로 둔다.
 *  - 1 Blender 단위 = 1 m, 원점은 양발 사이 바닥, Blender 에서 **-Y 가 정면**
 *    (glTF 내보내기에서 +Z 정면이 되고, Cesium 이 로드 시 +X 진행축으로 자동 보정한다)
 *  - 깃대를 주먹 위치에 정렬, 깃폭은 옆(진행 방향 왼쪽)으로 펼침
 *  - `walk` 클립 1개: 다리 ±11° 스윙 + 상하 bob, 24fps 1초 루프
 */
export const FLAGBEARER_URI = '/models/UijanggunCheongui_Pirip.glb';

// 확보한 모델별 상수 — 반차도의 역할에 대응시킨다(정확한 복식 재현이 아니라 최근접 대체).
const KISU = 'UijanggunCheongui Pirip';          // 기수(깃발)
const NOEJA = 'GunyeongnoejaJujangsu';           // 군영뇌자 — 군졸·가마꾼·수레꾼 대체
const GEUMGUN = 'GeumgunPodallyeong';            // 금군 — 호위·협련군
const UIJANG = 'UijangbongjiHeukdallyeong';      // 의장봉지
const NAECHWI = 'Naechwi';                       // 내취(취타대)
const HORSE_MU = 'MugwandanghagwanPoyungbok';    // 마상 무관 — 대장·제조급 대체
const HORSE_GUN = 'DanghagwanGunbok';            // 마상 당하관 — 감사·승지급 대체
const MUN_HEUK = 'DanghagwanHeukdallyeong';      // 문관(흑단령)
const MUN_JOBOK = 'MunmubaehyanggwanJobok';      // 문관(조복)
const JEGWAN = 'JongheongwanJebok';              // 제관(제복)

/**
 * 『원행을묘정리의궤』 반차도 편성(전시 캡처 tmp/batch/1~19 + 역할표 default_set 기준).
 *
 * 반차도 순번을 따른다:
 *  ①경기감사 ②총리대신 → 취타대 → ③훈련대장 ④금군별장 ⑤어보마 → ⑥정리사 수어사
 *  → ⑦정가교 ⑧교룡기 → 기수 → ⑨수라가자 → ⑩정리사 총융사 ⑪장용대장 ⑫도승지
 *  ⑬장용영제조 → ⑭혜경궁 홍씨(자궁가교) → ⑮정조대왕 → ⑯청선군주 ⑰청연군주 ⑱병조판서
 *
 * [고증 이탈 — 반드시 인지]
 *  - 실제 반차도는 1,779명 · 말 779필. 여기서는 모델 12종 ~90명으로 흐름만 재현한다.
 *  - 기록상 정조는 정가교(⑦)에 타지 않고 좌마(⑮)로 행차했다. 이 시뮬레이션은 화면
 *    가독성을 위해 정가교 안에 정조를 태웠고(사용자 선택), ⑮ 좌마는 따로 세우지 않는다.
 *  - 어보마·나인·수라가자(수레)는 해당 모델이 없어 인접 역할 인원으로 대체하거나 뺐다.
 *  - 가마는 중국식 모델 근사(Gama.LICENSE.txt), 혜경궁·군주 가교는 빈 가마(GamaEmpty)를 쓴다.
 */
function buildBanchado(): ProcessionUnit[] {
  const units: ProcessionUnit[] = [];
  let g = 0; // 선두로부터의 누적 거리(m). step() 으로만 전진시킨다.
  const step = (m: number) => { g += m; };

  /** 같은 gap 에 좌우로 늘어선 한 행. 라벨은 행의 첫 사람에게만. */
  const row = (folder: string, label: string, laterals: number[], showLabel = false) => {
    laterals.forEach((lateralM, i) => units.push({
      folder, label, gapM: g, lateralM,
      uri: folder === KISU ? FLAGBEARER_URI : `/models/${folder}.glb`,
      animated: true, showLabel: showLabel && i === 0,
    }));
  };
  /** 중앙 단독(반차도 순번이 붙은 요인). */
  const figure = (folder: string, label: string) => row(folder, label, [0], true);
  /** 가마 + 멜대 네 귀의 가마꾼 4명. 멜대 앞뒤 ±2.43m, 봉 간격 좌우 ±0.75m(1.35배 가마 기준). */
  const palanquin = (label: string, uri: string) => {
    units.push({ folder: 'Gama', label, gapM: g, lateralM: 0, uri, showLabel: true });
    for (const dg of [-2.43, 2.43]) {
      for (const dl of [-0.75, 0.75]) {
        units.push({ folder: NOEJA, label: '가마꾼', gapM: g + dg, lateralM: dl, uri: `/models/${NOEJA}.glb`, animated: true });
      }
    }
  };
  /** 같은 대형의 행을 rows 개 연달아 세운다(spacing 간격). 라벨은 첫 행에만. */
  const block = (folder: string, label: string, rows: number, laterals: number[], spacing = 2.8, showLabel = true) => {
    for (let r = 0; r < rows; r++) {
      if (r) step(spacing);
      row(folder, label, laterals, showLabel && r === 0);
    }
  };
  /** 도보 4열 종대 / 좁은 2열 종대 폭. */
  const W4 = [-3.9, -1.3, 1.3, 3.9];
  const W2 = [-2.2, 2.2];

  // -- 선도 ---------------------------------------------------------------
  block(KISU, '선도 기수', 3, W2, 3.5);
  step(4); block(NOEJA, '군영뇌자(길잡이)', 2, W4);
  step(5); figure(HORSE_GUN, '① 경기감사');
  step(3); row(NOEJA, '수행 군졸', [-2.8, 2.8]);
  step(5); figure(HORSE_MU, '② 총리대신(채제공)');
  step(3); row(NOEJA, '수행 군졸', [-2.8, 2.8]);

  // -- 취타대 — 반차도의 취타대는 대규모다. 4열 4행.
  step(5); block(NAECHWI, '취타대(내취)', 4, W4);

  // -- 군 지휘부·호위 ------------------------------------------------------
  step(5); figure(HORSE_MU, '③ 훈련대장');
  step(4); block(GEUMGUN, '금군(호위)', 2, W4);
  step(4); figure(HORSE_GUN, '④ 금군별장');
  step(4); block(GEUMGUN, '금군(호위)', 2, W4, 2.8, false);

  // -- 어보·의장 ----------------------------------------------------------
  // ⑤ 어보마(인장 실은 말)는 대응 모델이 없어 의장봉지가 받들어 가는 것으로 대체.
  step(5); block(UIJANG, '⑤ 의장(어보 봉지)', 3, W4);
  step(5); figure(HORSE_GUN, '⑥ 정리사 수어사');

  // -- ⑦ 정가교(어가) — 협련군이 앞뒤로 겹겹이 감싼다.
  step(5); block(KISU, '어가 전도 기수', 2, W2, 3.5);
  step(5); row(GEUMGUN, '협련군(호위)', [-3.4, 3.4], true);
  step(2.5); row(GEUMGUN, '협련군(호위)', [-3.4, 3.4]);
  step(2.5); palanquin('⑦ 정가교(정조)', '/models/Gama.glb');
  step(2.5); row(GEUMGUN, '협련군(호위)', [-3.4, 3.4]);
  step(2.5); row(GEUMGUN, '협련군(호위)', [-3.4, 3.4]);

  // -- ⑧ 교룡기·기수 -------------------------------------------------------
  step(5); figure(KISU, '⑧ 교룡기');
  step(3.5); block(KISU, '기수', 2, W2, 3.5, false);

  // -- ⑨ 수라가자 ----------------------------------------------------------
  // 수레 모델이 없어 호송 인원만 세운다.
  step(5); block(NOEJA, '⑨ 수라가자 호송', 2, [-1.6, 1.6]);

  // -- ⑩~⑬ 마상 요인 -------------------------------------------------------
  step(5); figure(HORSE_GUN, '⑩ 정리사 총융사');
  step(4.5); figure(HORSE_MU, '⑪ 장용대장');
  step(4.5); figure(HORSE_GUN, '⑫ 도승지');
  step(4.5); figure(HORSE_MU, '⑬ 장용영제조');

  // -- ⑭ 자궁가교(혜경궁 홍씨) — 홍철릭 협련 대군이 감싸는 구간(캡처 9·10).
  step(6); block(GEUMGUN, '자궁가교 협련', 2, W4);
  step(3); row(GEUMGUN, '협련', [-3.4, 3.4]);
  step(2.5); palanquin('⑭ 자궁가교(혜경궁 홍씨)', '/models/GamaEmpty.glb');
  step(2.5); row(GEUMGUN, '협련', [-3.4, 3.4]);
  step(2.5); block(GEUMGUN, '협련', 2, W4, 2.8, false);

  // ⑮ 정조대왕(좌마) — 이 시뮬레이션에서는 정가교(⑦)에 태웠으므로 세우지 않는다.

  // -- ⑯⑰ 군주 가교 --------------------------------------------------------
  step(6); palanquin('⑯ 청선군주 가교', '/models/GamaEmpty.glb');
  step(4); row(MUN_HEUK, '배행 관원', [-2.8, 2.8]);
  step(4); palanquin('⑰ 청연군주 가교', '/models/GamaEmpty.glb');

  // -- 배종 문무관 — 3종 × 4열 3행.
  step(6); block(MUN_JOBOK, '배종 문무관(조복)', 3, W4);
  step(4); block(MUN_HEUK, '배종 당하관(흑단령)', 3, W4);
  step(4); block(JEGWAN, '배향 제관(제복)', 3, W4);

  // -- ⑱ 병조판서·후미 ------------------------------------------------------
  step(5); figure(HORSE_GUN, '⑱ 병조판서');
  step(4); row(HORSE_MU, '후미 장용영(마병)', [-3.8, 3.8], true);
  step(4.5); row(HORSE_MU, '후미 장용영(마병)', [-3.8, 3.8]);
  step(4); block(GEUMGUN, '후미 금군', 2, W4, 2.8, false);
  step(4); block(KISU, '후미 기수', 2, W2, 3.5);

  // -- 측위 대열 -----------------------------------------------------------
  // 반차도의 빼곡한 인상은 본대 양옆을 처음부터 끝까지 따라 걷는 측위 행렬에서 온다.
  // 취타대부터 후미까지 양쪽 6.4m 밖에 6m 간격으로 세우고, 네 명에 하나는 기수다.
  const sideFrom = 28;
  const sideTo = g - 6;
  let i = 0;
  for (let s = sideFrom; s <= sideTo; s += 6, i++) {
    const kisu = i % 4 === 1;
    for (const side of [-6.4, 6.4]) {
      units.push({
        folder: kisu ? KISU : GEUMGUN,
        label: kisu ? '측위 기수' : '측위 군병',
        gapM: s, lateralM: side,
        uri: kisu ? FLAGBEARER_URI : `/models/${GEUMGUN}.glb`,
        animated: true,
      });
    }
  }

  return units;
}

export const DEFAULT_UNITS: ProcessionUnit[] = buildBanchado();

/**
 * 1457년 단종(노산군) 유배 호송 편성 — 실록: 첨지중추원사 어득해가 군졸 50명으로 호송.
 *
 * 화려한 의장·악대가 있는 행차가 아니라 실용적인 **압송·격리** 행렬이다.
 * 험한 산길을 지나므로 좁고 긴 **1열 종대**를 기본으로, 세 그룹으로 짠다:
 *  1) 선두 — 사령이 길을 트고 전방 호위가 따른다
 *  2) 중앙 — 단종은 가마(남여) 탑승(GamaDanjong: 수수한 흑단령 차림 합성).
 *     가마 앞뒤·양옆에 군사가 붙어 사방 밀착 감시하고, 뒤로 시종·내관이 따른다
 *  3) 후미 — 어득해가 뒤에서 총괄 지휘하고, 잔여 군사 다수가 후방에 집중.
 *     물자 짐꾼과 최후미 경계가 끝을 맺는다
 * 50명을 26명으로 축약. 궁녀·짐말은 대응 모델이 없어 시종·짐꾼으로 대체.
 * 수로 구간(2·3일차)은 배 모델이 없어 행렬이 강 위를 그대로 이동하는 근사다(화면 고지).
 */
function buildDanjongEscort(): ProcessionUnit[] {
  const units: ProcessionUnit[] = [];
  let g = 0;
  const one = (folder: string, label: string, lateralM = 0, showLabel = false) => {
    units.push({ folder, label, gapM: g, lateralM, uri: `/models/${folder}.glb`, animated: true, showLabel });
  };

  // -- 1) 선두: 길 안내·전방 감시 -----------------------------------------
  one(NOEJA, '선두 사령', 0, true);
  g += 2.5; one(NOEJA, '선두 사령');
  g += 4; one(GEUMGUN, '전방 호위 군사', 0, true);
  g += 2.5; one(GEUMGUN, '전방 호위 군사');
  g += 2.5; one(GEUMGUN, '전방 호위 군사');

  // -- 2) 중앙: 단종 가마 + 사방 밀착 감시 ---------------------------------
  g += 4; one(GEUMGUN, '밀착 감시(전방)');
  g += 4.5; // 가마 중심
  units.push({ folder: 'GamaDanjong', label: '단종(노산군)', gapM: g, lateralM: 0, uri: '/models/GamaDanjong.glb', showLabel: true });
  for (const dg of [-2.43, 2.43]) {
    for (const dl of [-0.75, 0.75]) {
      units.push({ folder: NOEJA, label: '가마꾼', gapM: g + dg, lateralM: dl, uri: `/models/${NOEJA}.glb`, animated: true });
    }
  }
  // 양옆 밀착 감시 — 탈출·접근을 막는 핵심 대형
  units.push({ folder: GEUMGUN, label: '밀착 감시(측면)', gapM: g, lateralM: -1.7, uri: `/models/${GEUMGUN}.glb`, animated: true });
  units.push({ folder: GEUMGUN, label: '밀착 감시(측면)', gapM: g, lateralM: 1.7, uri: `/models/${GEUMGUN}.glb`, animated: true });
  g += 4.5; one(GEUMGUN, '밀착 감시(후방)');
  g += 3; one(MUN_HEUK, '수행 내관', 0, true);
  g += 2.5; one(MUN_HEUK, '수행 시종');

  // -- 3) 후미: 총괄 지휘·물자·후방 경계 -----------------------------------
  g += 4.5; one(HORSE_MU, '어득해(호송 책임·첨지중추원사)', 0, true);
  g += 4; one(GEUMGUN, '후미 호위 군사', 0, true);
  g += 2.5; one(GEUMGUN, '후미 호위 군사');
  g += 2.5; one(GEUMGUN, '후미 호위 군사');
  g += 2.5; one(GEUMGUN, '후미 호위 군사');
  g += 2.5; one(GEUMGUN, '후미 호위 군사');
  g += 4; one(NOEJA, '짐꾼(물자)', 0, true);
  g += 2.5; one(NOEJA, '짐꾼(물자)');
  g += 4; one(GEUMGUN, '최후미 경계', 0, true);
  return units;
}

export const DANJONG_UNITS: ProcessionUnit[] = buildDanjongEscort();

/** 여정별 행렬 구성 — 경로 GeoJSON 과 편성의 짝. JourneyPage 가 여정 id 로 찾는다. */
export interface ProcessionConfig {
  routeUrl: string;
  units: ProcessionUnit[];
  /** 진입 즉시 점프할 여정 지역 상공 — 경로·모델을 기다리는 동안 한반도 전경 대신
   *  이 지역을 보여주고, 지형 타일을 미리 스트리밍시켜 행렬 프레이밍의 정확도를 높인다. */
  home: { lon: number; lat: number; height: number };
}

export const PROCESSION_CONFIGS: Record<string, ProcessionConfig> = {
  hwaseonghaenghaeng: {
    routeUrl: `${import.meta.env.BASE_URL}routes/hwaseong-haenghaeng.geojson`,
    units: DEFAULT_UNITS,
    home: { lon: 126.99, lat: 37.43, height: 90000 },   // 서울~수원 회랑
  },
  'danjong-yubae': {
    routeUrl: `${import.meta.env.BASE_URL}routes/danjong-yubae.geojson`,
    units: DANJONG_UNITS,
    home: { lon: 128.33, lat: 37.22, height: 45000 },   // 주천~청령포 회랑
  },
};

/**
 * 일정(dayPlan)은 경로 GeoJSON 의 properties 에 실려 온다 — 경로와 일정은 한 몸의 자료라
 * 앱에 하드코딩하지 않는다(bake_*_route.py 가 굽는다). legId 가 있는 날만 이동한다.
 */
export type DayPlan = RouteDayPlan;

export interface DayWindow extends DayPlan {
  /** 하루의 시작(00:00) */
  dayStart: Cesium.JulianDate;
  dayStop: Cesium.JulianDate;
  /** 이동이 있는 날의 이동 구간. 없으면 null. */
  moveStart: Cesium.JulianDate | null;
  moveStop: Cesium.JulianDate | null;
  distanceKm: number;
  /** 이동 소요 시간(시간 단위) */
  hours: number;
}

export interface Procession {
  entities: Cesium.Entity[];
  start: Cesium.JulianDate;
  stop: Cesium.JulianDate;
  days: DayWindow[];
  /** 시각 → 선두 위치와 진행 방위각(라디안). 팔로우 카메라가 쓴다. */
  poseAt: (time: Cesium.JulianDate, backM?: number) => { position: Cesium.Cartesian3; heading: number } | null;
  /** 팔로우 카메라가 붙는 지점 — 왕이 탄 가마의 선두 기준 뒤 거리(m). 없으면 0(선두). */
  focusGapM: number;
}

/** 현재 시각을 화면 표기에 쓰기 좋은 형태로 풀어 준다. */
export interface ProcessionTick {
  dayIndex: number;
  lunar: string;
  label: string;
  /** 'HH:MM' */
  clock: string;
  /** 하루 안에서의 진행도 0~1 */
  dayProgress: number;
  /** 전체 일정에서의 진행도 0~1 */
  totalProgress: number;
  moving: boolean;
}

function legCoordinates(route: HaenghaengRoute): Record<string, number[][]> {
  const out: Record<string, number[][]> = {};
  for (const entity of route.dataSource.entities.values) {
    const props = entity.properties;
    if (!props || props.kind?.getValue() !== 'leg') continue;
    const positions = entity.polyline?.positions?.getValue(Cesium.JulianDate.now());
    if (!positions) continue;
    out[props.id.getValue()] = positions.map((p: Cesium.Cartesian3) => {
      const c = Cesium.Cartographic.fromCartesian(p);
      return [Cesium.Math.toDegrees(c.longitude), Cesium.Math.toDegrees(c.latitude)];
    });
  }
  return out;
}

export function buildProcession(
  viewer: Cesium.Viewer,
  route: HaenghaengRoute,
  units: ProcessionUnit[] = DEFAULT_UNITS,
): Procession {
  const coordsByLeg = legCoordinates(route);
  const kmByLeg = Object.fromEntries(route.legs.map((l) => [l.id, l.distanceKm]));

  // 기준 시각은 1일차 00:00. 양력 환산은 자료마다 달라 단정하지 않고, 화면에는 음력 날짜만 쓴다.
  const base = Cesium.JulianDate.fromIso8601(route.baseDate);
  const at = (sec: number) => Cesium.JulianDate.addSeconds(base, sec, new Cesium.JulianDate());
  const dayPlan = route.dayPlan;

  // 이동일들의 경로를 전부 이어 하나의 폴리라인으로 만든다. 전 일정이 이어진다 —
  // day1 도착점 = day2 출발점(시흥행궁), day2 도착 = day4 출발 = 화성행궁, day4 는 융릉 왕복이라
  // 화성으로 돌아오고, day7·8 이 귀로다. 그래서 하나의 호(arc)로 매개화할 수 있다.
  const pathPositions: Cesium.Cartesian3[] = [];
  const cum: number[] = [];        // pathPositions[i] 까지의 누적 호 길이(m)
  let totalS = 0;
  /** 이동일별 (출발 시각, 시작·끝 호 길이). 시간 → 선두 진행 거리 변환에 쓴다. */
  const moves: { startSec: number; s0: number; s1: number }[] = [];

  const days: DayWindow[] = [];

  dayPlan.forEach((plan, i) => {
    const dayOffset = i * DAY_SECONDS;
    const coords = plan.legId ? coordsByLeg[plan.legId] : undefined;
    const distanceKm = plan.legId ? (kmByLeg[plan.legId] ?? 0) : 0;

    let moveStart: Cesium.JulianDate | null = null;
    let moveStop: Cesium.JulianDate | null = null;
    let seconds = 0;

    if (coords && coords.length > 1) {
      const from = dayOffset + plan.startHour * 3600;
      const s0 = totalS;
      coords.forEach(([lon, lat]) => {
        const c = Cesium.Cartesian3.fromDegrees(lon, lat, 0);
        if (pathPositions.length) {
          const d = Cesium.Cartesian3.distance(pathPositions[pathPositions.length - 1], c);
          if (d < 0.5) return; // 전날 도착점과 같은 좌표 — 이음새 중복 제거
          totalS += d;
        }
        pathPositions.push(c);
        cum.push(totalS);
      });
      // 소요 시간은 표기용 km 가 아니라 실제 폴리라인 호 길이에서 얻는다(속도 일관성).
      seconds = (totalS - s0) / WALK_SPEED;
      moveStart = at(from);
      moveStop = at(from + seconds);
      moves.push({ startSec: from, s0, s1: totalS });
    }

    days.push({
      ...plan,
      dayStart: at(dayOffset),
      dayStop: at(dayOffset + DAY_SECONDS),
      moveStart,
      moveStop,
      distanceKm,
      hours: seconds / 3600,
    });
  });

  const start = at(0);
  const stop = at(dayPlan.length * DAY_SECONDS);

  viewer.clock.startTime = start.clone();
  viewer.clock.stopTime = stop.clone();
  // 시계는 1일차 출발 시각 + **대열 전체가 길 위에 올라올 만큼 행진한 뒤**에서 시작한다.
  // 정확히 출발 시각이면 행렬이 아직 경로 밖(첫 구간 접선의 후방 연장선)에 도열해 있는데,
  // 고갯마루 출발(단종 솔치재)에서는 그 직선이 산비탈을 관통해 첫인상이 엉망이 된다.
  const columnLen = units.length ? Math.max(...units.map((u) => u.gapM)) : 0;
  viewer.clock.currentTime = Cesium.JulianDate.addSeconds(
    start, (dayPlan[0]?.startHour ?? 7) * 3600 + columnLen / WALK_SPEED + 30, new Cesium.JulianDate());
  viewer.clock.clockRange = Cesium.ClockRange.LOOP_STOP;
  // 기본은 배속 없음 — 행렬이 실제 걷는 속도(1 m/s)로 움직인다.
  // 배속을 걸면 그만큼 빨리 감기는 것이고, 걸음 자체는 언제나 보행 속도다.
  viewer.clock.multiplier = 1;
  viewer.clock.shouldAnimate = true;

  const availability = new Cesium.TimeIntervalCollection([new Cesium.TimeInterval({ start, stop })]);

  // -- 호 길이 기반 종대 추종 ---------------------------------------------------
  // 각 인원은 "경로상 선두보다 gapM 미터 뒤" 지점에 선다. 코너에서는 각자 자기 지점의
  // 접선 방향으로 돌기 때문에 행렬이 강체처럼 통째로 회전하지 않고 열차처럼 굽어 돈다.

  /** 첫 구간 접선(정규화). 출발 전 s<0 도열을 뒤로 연장하는 데 쓴다. */
  const dir0 = pathPositions.length > 1
    ? Cesium.Cartesian3.normalize(
        Cesium.Cartesian3.subtract(pathPositions[1], pathPositions[0], new Cesium.Cartesian3()),
        new Cesium.Cartesian3())
    : new Cesium.Cartesian3(1, 0, 0);

  /** 시각(기준시 이후 초) → 선두의 진행 거리(m). 이동 시간 밖에서는 마지막 도착 거리로 고정. */
  function leadArcAt(tSec: number): number {
    let s = 0;
    for (const m of moves) {
      if (tSec < m.startSec) break;
      s = Math.min(m.s1, m.s0 + (tSec - m.startSec) * WALK_SPEED);
    }
    return s;
  }

  /** 경로상 호 길이 s 지점의 좌표. s<0 이면 첫 구간 접선을 따라 뒤로 연장한다. */
  function pointAt(s: number, result: Cesium.Cartesian3): Cesium.Cartesian3 {
    if (!pathPositions.length) return Cesium.Cartesian3.clone(Cesium.Cartesian3.ZERO, result);
    if (s <= 0) {
      Cesium.Cartesian3.multiplyByScalar(dir0, s, result);
      return Cesium.Cartesian3.add(pathPositions[0], result, result);
    }
    if (s >= totalS) return Cesium.Cartesian3.clone(pathPositions[pathPositions.length - 1], result);
    let lo = 0;
    let hi = cum.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= s) lo = mid; else hi = mid;
    }
    const segLen = cum[hi] - cum[lo];
    const f = segLen > 0 ? (s - cum[lo]) / segLen : 0;
    return Cesium.Cartesian3.lerp(pathPositions[lo], pathPositions[hi], f, result);
  }

  const fwdA = new Cesium.Cartesian3();
  const fwdB = new Cesium.Cartesian3();

  /** s 지점의 진행 방향(정규화). 꼭짓점에서 방향이 튀지 않게 앞뒤 2m 를 잇는다. */
  function forwardAt(s: number, result: Cesium.Cartesian3): Cesium.Cartesian3 {
    pointAt(s - 2, fwdA);
    pointAt(s + 2, fwdB);
    Cesium.Cartesian3.subtract(fwdB, fwdA, result);
    if (Cesium.Cartesian3.magnitude(result) < 0.01) return Cesium.Cartesian3.clone(dir0, result);
    return Cesium.Cartesian3.normalize(result, result);
  }

  // 시계가 같은 프레임 안에서 위치·방향 콜백을 여러 번 부르므로 선두 거리만 캐싱한다.
  const arcCache = { key: '', leadS: 0 };
  function leadArcCached(time: Cesium.JulianDate): number {
    const key = time.toString();
    if (arcCache.key !== key) {
      arcCache.key = key;
      arcCache.leadS = leadArcAt(Cesium.JulianDate.secondsDifference(time, base));
    }
    return arcCache.leadS;
  }

  const posScratch = new Cesium.Cartesian3();
  const fwdScratch = new Cesium.Cartesian3();
  const enuScratch = new Cesium.Matrix4();
  const invScratch = new Cesium.Matrix4();
  const localScratch = new Cesium.Cartesian3();

  /** 인원 하나의 실제 좌표: 경로상 s 지점 + 자기 진행 방향 기준 좌우 오프셋. */
  function unitPosition(time: Cesium.JulianDate, gapM: number, rightM: number, result: Cesium.Cartesian3) {
    const s = leadArcCached(time) - gapM;
    pointAt(s, posScratch);
    if (!rightM) return Cesium.Cartesian3.clone(posScratch, result);
    forwardAt(s, fwdScratch);
    // ENU 로 옮겨 방위각을 구하고, 오른쪽 방향(방위각 +90°)으로 rightM 만큼 민다.
    const enu = Cesium.Transforms.eastNorthUpToFixedFrame(posScratch, Cesium.Ellipsoid.WGS84, enuScratch);
    const inv = Cesium.Matrix4.inverseTransformation(enu, invScratch);
    const local = Cesium.Matrix4.multiplyByPointAsVector(inv, fwdScratch, localScratch);
    const heading = Math.atan2(local.x, local.y);
    const east = rightM * Math.cos(heading);
    const north = -rightM * Math.sin(heading);
    localScratch.x = east; localScratch.y = north; localScratch.z = 0;
    return Cesium.Matrix4.multiplyByPoint(enu, localScratch, result);
  }

  const entities = units.map((unit) => {
    const position = new Cesium.CallbackPositionProperty(
      (time, result) => unitPosition(time as Cesium.JulianDate, unit.gapM, unit.lateralM, result ?? new Cesium.Cartesian3()),
      false,
    );
    // 방향은 각자 자기 지점의 접선을 따른다 — 코너에서 앞사람부터 차례로 도는 이유.
    // 회전은 Cesium 이동체 규약(rotationMatrixFromPositionVelocity)을 그대로 따른다.
    // 추가 보정은 하지 않는다 — Blender 에서 -Y 정면으로 굳힌 모델은 glTF 내보내기에서
    // +Z 정면(glTF 표준)이 되고, Cesium 이 로드 시 +Z-forward 를 +X-forward 로 이미
    // 돌려 놓는다(ModelUtility.getAxisCorrectionMatrix). 여기서 또 돌리면 90° 옆을 본다.
    const orientation = new Cesium.CallbackProperty((time) => {
      const s = leadArcCached(time as Cesium.JulianDate) - unit.gapM;
      pointAt(s, posScratch);
      forwardAt(s, fwdScratch);
      const m = Cesium.Transforms.rotationMatrixFromPositionVelocity(posScratch, fwdScratch, Cesium.Ellipsoid.WGS84);
      return Cesium.Quaternion.fromRotationMatrix(m);
    }, false);

    return viewer.entities.add({
      name: unit.label,
      availability,
      position,
      orientation,
      model: {
        uri: unit.uri,
        // walk 클립은 1초에 한 주기이고 행렬 보행 속도도 1 m/s 라 클립 원속도가 곧 걸음이다.
        // 다만 시계 배속(clock.multiplier)을 올리면 이동만 빨라지고 걸음은 그대로다.
        runAnimations: unit.animated ?? false,
        // minimumPixelSize 는 멀리서도 보이라고 모델을 키운다. maximumScale 을 크게 두면
        // 사람이 수백 m 크기로 부풀어 지면에서 떠오르고 서로 겹쳐 보이므로 상한을 좁게 잡는다.
        minimumPixelSize: 16,
        maximumScale: 3,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      },
      // 머리 위 한글 라벨 — 무리 대표 한 명에게만 붙인다(전원이면 글자만 빽빽해진다).
      // 멀어지면(400m~) 글자가 겹쳐 보이므로 가까울 때만 표시한다.
      label: unit.showLabel ? {
        text: unit.label,
        font: '13px sans-serif',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        eyeOffset: new Cesium.Cartesian3(0, 3, 0),
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        pixelOffset: new Cesium.Cartesian2(0, -28),
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 400),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      } : undefined,
    });
  });

  /** 팔로우 카메라용 — 선두 위치와 진행 방위각. */
  function poseAt(time: Cesium.JulianDate, backM = 0) {
    if (!pathPositions.length) return null;
    const s = leadArcCached(time) - backM;
    const position = pointAt(s, new Cesium.Cartesian3());
    forwardAt(s, fwdScratch);
    const enu = Cesium.Transforms.eastNorthUpToFixedFrame(position, Cesium.Ellipsoid.WGS84, enuScratch);
    const inv = Cesium.Matrix4.inverseTransformation(enu, invScratch);
    const local = Cesium.Matrix4.multiplyByPointAsVector(inv, fwdScratch, localScratch);
    return { position, heading: Math.atan2(local.x, local.y) };
  }

  // 팔로우 카메라의 기준점 — 왕이 탄 가마(uri 에 'Gama' 포함). 없으면 선두.
  const focusGapM = units.find((u) => u.uri.includes('Gama'))?.gapM ?? 0;

  return { entities, start, stop, days, poseAt, focusGapM };
}

/** 시계 시각 → 화면 표기용 정보. */
export function describeTime(procession: Procession, time: Cesium.JulianDate): ProcessionTick {
  const elapsed = Cesium.JulianDate.secondsDifference(time, procession.start);
  const total = Cesium.JulianDate.secondsDifference(procession.stop, procession.start);
  const idx = Math.min(procession.days.length - 1, Math.max(0, Math.floor(elapsed / DAY_SECONDS)));
  const day = procession.days[idx];
  const withinDay = elapsed - idx * DAY_SECONDS;
  const h = Math.floor(withinDay / 3600);
  const m = Math.floor((withinDay % 3600) / 60);

  const moving = !!(day.moveStart && day.moveStop
    && Cesium.JulianDate.lessThanOrEquals(day.moveStart, time)
    && Cesium.JulianDate.lessThanOrEquals(time, day.moveStop));

  return {
    dayIndex: idx,
    lunar: day.lunar,
    label: day.label,
    clock: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
    dayProgress: Math.min(1, Math.max(0, withinDay / DAY_SECONDS)),
    totalProgress: Math.min(1, Math.max(0, elapsed / total)),
    moving,
  };
}

/** 특정 날짜의 시작(이동일이면 출발 시각)으로 시계를 옮긴다. */
export function seekToDay(viewer: Cesium.Viewer, procession: Procession, dayIndex: number) {
  const day = procession.days[dayIndex];
  if (!day) return;
  viewer.clock.currentTime = (day.moveStart ?? Cesium.JulianDate.addSeconds(day.dayStart, day.startHour * 3600, new Cesium.JulianDate())).clone();
}

/**
 * 현재 시각의 행렬 전체(선두~후미)가 화면에 들어오게, 대열 진행 방향의 측면에서
 * 비스듬히 내려다보는 카메라로 날아간다. 진입 연출과 일차 점프가 함께 쓴다.
 * 팔로우 카메라가 켜져 있으면 그쪽이 시점을 잡고 있으므로 개입하지 않는다.
 * @returns 비행을 시작했으면 true (위치를 못 얻어 못 날았으면 false)
 */
/**
 * 진입·일차 점프 카메라 기본값 — 개발 중에는 콘솔의 __camTune 으로 실험하고 여기 확정한다.
 *  el=내려다보는 앙각(도) · mul=행렬 크기 대비 거리 배율 · min=거리 하한(m)
 *  ridge=카메라 지점의 능선 위 최소 여유(m)
 */
const CAM_DEFAULTS = { el: 10, mul: 1.0, min: 240, ridge: 80 };

export function flyToProcession(viewer: Cesium.Viewer, procession: Procession, duration = 2.0): boolean {
  if (followListener) return true;
  const t = viewer.clock.currentTime;
  const es = procession.entities;
  const head = es[0]?.position?.getValue(t);
  const tail = es[es.length - 1]?.position?.getValue(t);
  if (!head || !tail) return false;
  const mid = Cesium.Cartesian3.midpoint(head, tail, new Cesium.Cartesian3());
  const radius = Cesium.Cartesian3.distance(head, tail) * 0.6 + 60;
  // 대열 진행 방향의 방위각 — 옆·앞에서 비스듬히 내려다보는 각을 만든다.
  const inv = Cesium.Matrix4.inverseTransformation(
    Cesium.Transforms.eastNorthUpToFixedFrame(mid), new Cesium.Matrix4());
  const d = Cesium.Matrix4.multiplyByPointAsVector(
    inv, Cesium.Cartesian3.subtract(head, tail, new Cesium.Cartesian3()), new Cesium.Cartesian3());
  const columnHeading = Math.atan2(d.x, d.y);

  // 경로 좌표는 타원체 높이 0 으로 굽는다. 산악 지대(영월 ~300m)에서는 두 가지를 지형에
  // 맞춰야 한다: (1) 행렬 중심의 높이, (2) **카메라 위치 자체** — 골짜기 옆 능선 안으로
  // 카메라가 들어가면 산 속을 보게 된다. 카메라 지점의 지형 높이를 재서 능선 위로 띄운다.
  // [개발 편의] 브라우저 콘솔에서 값을 바꾸고 일차 버튼을 다시 누르면 즉시 반영된다:
  //   __camTune = { el: 20, mul: 1.2, min: 200, side: -115, ridge: 60 }
  // 마음에 드는 값을 찾으면 CAM_DEFAULTS 에 확정한다.
  const tune = (import.meta.env.DEV
    ? (window as unknown as { __camTune?: Record<string, number> }).__camTune
    : undefined) ?? {};
  const el = Cesium.Math.toRadians(tune.el ?? CAM_DEFAULTS.el);
  const range = Math.max(radius * (tune.mul ?? CAM_DEFAULTS.mul), tune.min ?? CAM_DEFAULTS.min);
  const ridgeMargin = tune.ridge ?? CAM_DEFAULTS.ridge;
  const horiz = range * Math.cos(el);
  const carto = Cesium.Cartographic.fromCartesian(mid);

  // 카메라를 놓을 쪽은 좌우 양쪽(±115°) 중 **지형이 낮은 쪽(골짜기 쪽)**을 고른다 —
  // 산비탈 쪽에 놓으면 능선 위로 끌어올려도 답답한 사면 부감이 된다.
  const sides = (tune.side !== undefined ? [tune.side, tune.side] : [115, -115]).map((deg) => {
    const viewHeading = columnHeading + Cesium.Math.toRadians(deg);
    const az = viewHeading + Math.PI;
    return {
      viewHeading,
      az,
      camCarto: new Cesium.Cartographic(
        carto.longitude + (horiz * Math.sin(az)) / (6371000 * Math.cos(carto.latitude)),
        carto.latitude + (horiz * Math.cos(az)) / 6371000),
    };
  });

  const fly = (centerH: number, camGrounds: number[]) => {
    // 지형이 낮은 쪽 선택
    const i = camGrounds[0] <= camGrounds[1] ? 0 : 1;
    const side = sides[i];
    const camGroundH = camGrounds[i];
    const center = Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, centerH + 2);
    const east = horiz * Math.sin(side.az);
    const north = horiz * Math.cos(side.az);
    let up = range * Math.sin(el);
    // 능선 검사 — 카메라 지점의 지형보다 ridgeMargin(m) 이상 높게
    const minCamH = camGroundH + ridgeMargin;
    if (centerH + up < minCamH) up = minCamH - centerH;
    const enu = Cesium.Transforms.eastNorthUpToFixedFrame(center);
    const camPos = Cesium.Matrix4.multiplyByPoint(enu, new Cesium.Cartesian3(east, north, up), new Cesium.Cartesian3());
    const pitch = -Math.atan2(up, horiz);
    viewer.camera.flyTo({
      destination: camPos,
      orientation: { heading: side.viewHeading, pitch, roll: 0 },
      duration,
    });
  };

  // 행렬 중심과 좌우 카메라 후보, 세 곳의 지형 높이가 **모두 준비될 때까지 기다렸다가** 난다.
  // 첫 진입 시에는 월드 터레인이 아직 로딩 전이라 높이가 없거나 0 으로 잡혀 카메라가
  // 엉뚱한 높이에 놓였다(일차 버튼을 나중에 누르면 지형이 로딩된 뒤라 멀쩡했던 이유).
  // 그 사이 새 비행 요청이 오면 이전 대기는 토큰으로 무효화한다.
  const token = ++flightToken;
  const tryFly = (attempt: number) => {
    if (token !== flightToken) return;  // 더 새 비행이 요청됨 — 이 대기는 폐기
    if (followListener) return;         // 대기 중 팔로우 카메라가 켜졌으면 개입하지 않는다
    const h0 = viewer.scene.globe.getHeight(carto);
    const g0 = viewer.scene.globe.getHeight(sides[0].camCarto);
    const g1 = viewer.scene.globe.getHeight(sides[1].camCarto);
    // tilesLoaded 까지 요구 — 원거리 저해상도 타일의 높이(오차 수십 m)로 날지 않게 한다.
    if (h0 !== undefined && g0 !== undefined && g1 !== undefined && viewer.scene.globe.tilesLoaded) {
      fly(h0, [g0, g1]);
    } else if (attempt < 25) {
      setTimeout(() => tryFly(attempt + 1), 400);
    } else {
      fly(h0 ?? 0, [g0 ?? 0, g1 ?? 0]); // 10초를 기다려도 없으면 그냥 난다
    }
  };
  tryFly(0);
  return true;
}

export function removeProcession(viewer: Cesium.Viewer, procession: Procession | null) {
  if (!procession) return;
  flightToken++; // 지형을 기다리던 진입 비행이 있으면 폐기 — 화면을 떠난 뒤 발사되면 안 된다
  if (followListener) {
    viewer.scene.preRender.removeEventListener(followListener);
    followListener = null;
    viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
  }
  procession.entities.forEach((e) => viewer.entities.remove(e));
}

// 팔로우 카메라 리스너 — 행렬은 한 번에 하나만 있으므로 모듈 스코프로 관리한다.
let followListener: (() => void) | null = null;
// 진입 카메라의 지형 대기 토큰 — 새 비행 요청이 오면 이전 대기를 폐기한다.
let flightToken = 0;

/**
 * 행렬을 따라다니는 카메라. 왕이 탄 가마 **뒤에서 진행 방향을 바라보며** 같이 움직인다 —
 * 가마가 가까이 보이고 그 앞으로 행렬이 뻗어가는 구도다(사용자 요청으로 정면 뷰에서 변경).
 * 끄면 시점 고정을 풀고 자유 시점으로 돌아간다.
 */
export function trackLead(viewer: Cesium.Viewer, procession: Procession, on: boolean) {
  if (followListener) {
    viewer.scene.preRender.removeEventListener(followListener);
    followListener = null;
  }
  if (!on) {
    viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    return;
  }
  viewer.trackedEntity = undefined;
  // 기준점은 왕이 탄 가마(focusGapM). 매 프레임 카메라를 강제로 되돌리는 대신
  // **가마를 따라 움직이는 기준 프레임**(lookAtTransform)만 갱신한다 — 프레임이 잡혀 있으면
  // Cesium 컨트롤러가 원점(가마) 궤도 조작을 지원하므로, 따라가는 동안에도 마우스로
  // 자유롭게 돌리고 줌할 수 있고 그 시점이 유지된 채 함께 이동한다.
  // 프레임의 +X 를 진행 방향에 맞춰 두면, 행렬이 코너를 돌 때 시점도 함께 돈다.
  const carto = new Cesium.Cartographic();
  const frame = new Cesium.Matrix4();
  const rotZ = new Cesium.Matrix3();
  const localPos = new Cesium.Cartesian3();
  const localDir = new Cesium.Cartesian3();
  const localUp = new Cesium.Cartesian3();
  let initialized = false;
  followListener = () => {
    const pose = procession.poseAt(viewer.clock.currentTime, procession.focusGapM);
    if (!pose) return;
    // 경로 좌표는 타원체 높이 0 으로 구웠으므로, 지형 높이를 얹어 눈높이를 맞춘다.
    Cesium.Cartographic.fromCartesian(pose.position, Cesium.Ellipsoid.WGS84, carto);
    const ground = viewer.scene.globe.getHeight(carto) ?? 0;
    const target = Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, ground + 2.5);
    Cesium.Transforms.eastNorthUpToFixedFrame(target, Cesium.Ellipsoid.WGS84, frame);
    Cesium.Matrix3.fromRotationZ(Cesium.Math.PI_OVER_TWO - pose.heading, rotZ);
    Cesium.Matrix4.multiplyByMatrix3(frame, rotZ, frame);
    if (!initialized) {
      // 최초 1회: 가마 뒤 70m·위 22m 에서 진행 방향을 본다(-X 가 대열 뒤쪽).
      viewer.camera.lookAtTransform(frame, new Cesium.Cartesian3(-66.6, 0, 21.6));
      initialized = true;
      return;
    }
    // 사용자가 돌려 놓은 프레임 로컬 시점을 보존한 채 프레임만 전진시킨다.
    Cesium.Cartesian3.clone(viewer.camera.position, localPos);
    Cesium.Cartesian3.clone(viewer.camera.direction, localDir);
    Cesium.Cartesian3.clone(viewer.camera.up, localUp);
    viewer.camera.lookAtTransform(frame);
    Cesium.Cartesian3.clone(localPos, viewer.camera.position);
    Cesium.Cartesian3.clone(localDir, viewer.camera.direction);
    Cesium.Cartesian3.clone(localUp, viewer.camera.up);
    Cesium.Cartesian3.cross(viewer.camera.direction, viewer.camera.up, viewer.camera.right);
  };
  viewer.scene.preRender.addEventListener(followListener);
}
