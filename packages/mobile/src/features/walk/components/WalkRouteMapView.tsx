import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, type StyleProp, View, type ViewStyle } from "react-native";
import MapView, { Marker } from "react-native-maps";

import { CurrentHeadingBeam } from "@/components/location/CurrentHeadingBeam";
import { MapPin } from "@/components/ui/map-pin/MapPin";
import { mapPinMarkerPlacement } from "@/components/ui/map-pin/mapPinGeometry";
import { RoutePolyline } from "@/components/ui/route-polyline/RoutePolyline";
import { WalkRouteLegend } from "@/features/walk/components/WalkRouteLegend";
import { WalkRoutePolylines } from "@/features/walk/components/WalkRoutePolylines";
import { useMapRouteFit } from "@/features/walk/hooks/useMapRouteFit";
import { regionForBounds, regionForRoundTrip } from "@/features/walk/lib/mapRegion";
import { walkTrailStyle } from "@/features/walk/lib/walkTrailStyle";
import type { WalkRoute } from "@/features/walk/types";
import { useHeadingBeamRadius } from "@/hooks/useHeadingBeamRadius";
import { sanitizeMapRegion, type MapRegion, type MapRegionRequest } from "@/lib/mapRegion";
import type { GeoCoordinates } from "@/services/location/types";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

export type WalkRouteMapViewProps = {
  walkRoute: WalkRoute | null;
  currentPosition: GeoCoordinates | null;
  /**
   * 散歩中に歩いた軌跡（SS-168）。周回ルートの線の上に、細い半透明の線で描く。
   * 一時停止中は点が増えないため、一時停止の前後は直線で結ばれる。
   */
  trail: readonly GeoCoordinates[];
  /** 目的地ピンのラベル。 */
  destinationName: string;
  /** インクリメントされるたびに現在地へ再センタリングする。 */
  recenterNonce: number;
  /** nonce が変わるたびに、その表示範囲へ動かす（`mapLayers` の中の操作。登録済みピンのクラスタのタップ。SS-243）。 */
  regionRequest?: MapRegionRequest | null;
  height?: number;
  style?: StyleProp<ViewStyle>;
  /** 地図上に重ねる追加コンテンツ（ツールボタンなど）。 */
  children?: ReactNode;
  /**
   * `MapView` の子として描く追加レイヤー（登録済みピンなど。SS-118）。`features/walk` は
   * その中身を知らない。増減するレイヤーなので `MapView` の子の末尾に置く
   * （ADR-M-012 D16）。
   */
  mapLayers?: ReactNode;
  /**
   * 表示範囲が確定したとき（初回表示 + パン・ズーム後）に呼ぶ（SS-118）。
   * `sanitizeMapRegion` を通した値だけを渡す。
   */
  onRegionChangeComplete?: (region: MapRegion) => void;
  /** 地図を長押しした地点を受け取る（散歩中のピン登録。SS-124）。省略時は長押しを扱わない。 */
  onLongPress?: (coordinate: GeoCoordinates) => void;
  testID?: string;
};

/** アニメーション付き再センタリングの所要時間（ms）。 */
const ROUTE_FIT_ANIMATION_MS = 400;
/** 現在地への再センタリング（recenterNonce）のアニメーション所要時間（ms）。 */
const RECENTER_ANIMATION_MS = 400;
/** ルートが未取得のときに現在地を中心として表示する緩い往復時間相当（分）。 */
const FALLBACK_DURATION_MIN = 20;
/**
 * マーカーの重なり順。`mapLayers` のマーカー（既定 0）より現在地・目的地を上に描く
 * （同じ座標に登録済みピンがあっても現在地が隠れないように。SS-118）。
 */
const GOAL_PIN_SIZE = 38;
const CURRENT_PIN_SIZE = 30;
const GOAL_MARKER_Z_INDEX = 1;
const CURRENT_MARKER_Z_INDEX = 2;
/**
 * 歩いた軌跡の線の重なり順。周回ルートの線（復路 1・往路 2。`WalkRoutePolylines`）より上に重ねる（SS-168）。
 * `zIndex` が効くのは Android（Google Maps）だけ。iOS（Apple Maps）は効かず、後から足した線・座標が変わった線が上に来る。
 * 軌跡は位置が届くたびに座標が変わるので iOS でも上に来る。描く順序も軌跡を後ろに置き、両方で同じ重なりにする。
 */
const TRAIL_Z_INDEX = 3;
/** 現在地の向きの扇形（SS-169）。半透明の面なので、ルート線・軌跡より下に敷く（Google Maps のみ有効）。 */
const HEADING_BEAM_Z_INDEX = 0;

/**
 * WalkRouteMapView — 散歩中画面の実地図。ルート・歩いた軌跡（SS-168）・目的地・現在地と、
 * 現在地の向き（SS-169）を描く。
 * `showsUserLocation` は使わない。`EXPO_PUBLIC_LOCATION_MODE=mock` のとき OS の青ドットは
 * mock 軌跡と食い違い、点が2つ出て混乱するため、現在地は必ず `locationService` 由来の値で描く。
 * 周回ルートは参考表示。現在地がどちらの区間にいるかは判定しない（SS-33）。
 */
export function WalkRouteMapView({
  walkRoute,
  currentPosition,
  trail,
  destinationName,
  recenterNonce,
  regionRequest = null,
  height = 322,
  style,
  children,
  mapLayers,
  onRegionChangeComplete,
  onLongPress,
  testID,
}: WalkRouteMapViewProps) {
  const theme = useTheme();
  const styles = useStyles();
  const trailStyle = walkTrailStyle(theme);
  const mapRef = useRef<MapView>(null);
  const isFirstRecenter = useRef(true);
  // `onMapReady` は画面を離れて戻る（ネイティブの地図が window から外れて付き直す）たびにも
  // 呼ばれる。そのときのカメラは離れる前の位置のままなので、`initialRegion` を表示範囲として
  // 報告するのは初回だけにする（2回目以降は `onRegionChangeComplete` に任せる）。
  const hasReportedInitialRegion = useRef(false);
  // 地図が付き直した回数（`onMapReady` の回数）。軌跡の線の key に使い、付き直すたびに線を作り直す。
  // Android の react-native-maps は、付き直すときに線を「最初に地図へ足した時点の座標」で作り直すため、
  // 作り直さないと軌跡が描き始めの数点に戻る（SS-211）。
  const [mapAttachCount, setMapAttachCount] = useState(0);
  const headingBeam = useHeadingBeamRadius();

  const initialRegion = walkRoute
    ? regionForBounds(walkRoute.bounds)
    : currentPosition
      ? regionForRoundTrip(currentPosition, FALLBACK_DURATION_MIN)
      : null;

  // ルートが後から届いたときの初回フィット（`SpotMapView` と共通の hook）。
  useMapRouteFit(mapRef, walkRoute, ROUTE_FIT_ANIMATION_MS);

  // 現在地への再センタリング（初回の 0 は除く）。
  useEffect(() => {
    if (isFirstRecenter.current) {
      isFirstRecenter.current = false;
      return;
    }
    if (!currentPosition) return;
    mapRef.current?.animateToRegion(
      regionForRoundTrip(currentPosition, FALLBACK_DURATION_MIN),
      RECENTER_ANIMATION_MS,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- currentPosition は最新値を使うだけで依存に含めない
  }, [recenterNonce]);

  const lastRegionNonceRef = useRef<number | null>(null);
  useEffect(() => {
    if (regionRequest === null) return;
    if (lastRegionNonceRef.current === regionRequest.nonce) return;
    lastRegionNonceRef.current = regionRequest.nonce;
    mapRef.current?.animateToRegion(regionRequest.region, RECENTER_ANIMATION_MS);
  }, [regionRequest]);

  if (!initialRegion) {
    return (
      <View
        testID={testID}
        style={[styles.placeholder, { height, backgroundColor: theme.map.canvas }, style]}
      >
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={[{ height }, style]} onLayout={headingBeam.onMapLayout}>
      <MapView
        ref={mapRef}
        testID={testID}
        style={styles.map}
        initialRegion={initialRegion}
        showsUserLocation={false}
        showsMyLocationButton={false}
        toolbarEnabled={false}
        // マーカーのタップでカメラを動かさない（登録済みピンはタップで詳細へ移るため、
        // 戻ったときに地図がずれないようにする。SS-118）。
        moveOnMarkerPress={false}
        onLongPress={onLongPress ? (event) => onLongPress(event.nativeEvent.coordinate) : undefined}
        onMapReady={() => {
          setMapAttachCount((n) => n + 1);
          if (hasReportedInitialRegion.current) return;
          hasReportedInitialRegion.current = true;
          const sanitized = sanitizeMapRegion(initialRegion);
          if (!sanitized) return;
          headingBeam.onMapRegion(sanitized);
          onRegionChangeComplete?.(sanitized);
        }}
        onRegionChangeComplete={(region) => {
          const sanitized = sanitizeMapRegion(region);
          if (!sanitized) return;
          headingBeam.onMapRegion(sanitized);
          onRegionChangeComplete?.(sanitized);
        }}
      >
        {walkRoute ? <WalkRoutePolylines walkRoute={walkRoute} /> : null}
        <RoutePolyline
          key={`trail-${mapAttachCount}`}
          path={trail}
          color={trailStyle.color}
          strokeWidth={trailStyle.strokeWidth}
          zIndex={TRAIL_Z_INDEX}
        />
        {walkRoute ? (
          <Marker
            coordinate={walkRoute.destination.location}
            identifier="goal"
            title={destinationName}
            {...mapPinMarkerPlacement(GOAL_PIN_SIZE)}
            tracksViewChanges={false}
            zIndex={GOAL_MARKER_Z_INDEX}
            testID="walk-active-goal-marker"
          >
            <MapPin category="goal" icon="flag" size={GOAL_PIN_SIZE} />
          </Marker>
        ) : null}
        {currentPosition ? (
          <Marker
            coordinate={currentPosition}
            identifier="current"
            {...mapPinMarkerPlacement(CURRENT_PIN_SIZE)}
            tracksViewChanges={false}
            zIndex={CURRENT_MARKER_Z_INDEX}
            testID="walk-active-current-marker"
          >
            <MapPin category="current" size={CURRENT_PIN_SIZE} />
          </Marker>
        ) : null}
        {mapLayers}
        {/* 向きが取れない・フォーカスが無い間は描かない（増減する）ので、末尾に置く（ADR-M-012 D16）。
            重なり順は zIndex で決める（iOS は効かない。ADR-M-023）。 */}
        <CurrentHeadingBeam
          center={currentPosition}
          radiusMeters={headingBeam.radiusMeters}
          zIndex={HEADING_BEAM_Z_INDEX}
        />
      </MapView>
      {/* ルートが未取得でも、軌跡が描ければ「歩いた道」の凡例を出す（項目が無ければ凡例は null を返す）。 */}
      <WalkRouteLegend walkRoute={walkRoute} trail={trail} testID="walk-active-route-legend" />
      {children}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  placeholder: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  map: {
    flex: 1,
  },
}));
