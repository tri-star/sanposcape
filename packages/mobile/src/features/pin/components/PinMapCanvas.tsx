import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import MapView, {
  Marker,
  type LongPressEvent,
  type MapPressEvent,
  type PoiClickEvent,
} from "react-native-maps";

import { MapPin } from "@/components/ui/map-pin/MapPin";
import {
  regionAroundPoint,
  toPickedCoordinate,
  type PinMapFocusRequest,
  type PinMapPickProps,
} from "@/features/pin/lib/pinLocationPicker";
import { sanitizeMapRegion, type MapRegion } from "@/lib/mapRegion";
import type { GeoCoordinates } from "@/services/location/types";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

type PinMapCanvasCommonProps = {
  /**
   * testID の接頭辞。`${p}-map`（地図を包む View）/ `${p}-map-loading`（initialRegion が null の間）/
   * `${p}-marker`（選択位置）/ `${p}-current-marker`（現在地）を付ける。
   */
  testIDPrefix: string;
  /** 地図を包む View の accessibilityLabel（全画面では title を渡す）。 */
  accessibilityLabel: string;
  /** 地図を包む View の accessibilityHint（下部カード/情報カードのヒント文と揃える）。 */
  accessibilityHint: string;
  /** null の間は地図を出さず読み込み表示にする（現在地の初回取得中）。 */
  initialRegion: MapRegion | null;
  /** 読み込み表示の文言。既定「現在地を取得しています…」。 */
  loadingLabel?: string;
  /** 選択中の位置（(a) のピン）。null ならマーカーを出さない。 */
  selectedLocation: GeoCoordinates | null;
  /** 現在地。null なら出さない。 */
  currentLocation: GeoCoordinates | null;
  /** nonce が変わるたびに target へ animateToRegion する（WalkRouteMapView の recenterNonce と同じ考え方）。 */
  focusRequest: PinMapFocusRequest | null;
  /**
   * `MapView` の子として描く追加レイヤー。増減するレイヤーなので `MapView` の
   * 子の末尾に置き、重なり順は `zIndex` で選択マーカー・現在地マーカーより下にする（mobile ADR-012 D16）。
   */
  mapLayers?: ReactNode;
  /** 表示範囲が確定したとき（初回表示 + パン・ズーム後）に呼ぶ。`sanitizeMapRegion` を通した値だけを渡す。 */
  onRegionChangeComplete?: (region: MapRegion) => void;
};

export type PinMapCanvasProps = PinMapCanvasCommonProps & PinMapPickProps;

const DEFAULT_LOADING_LABEL = "現在地を取得しています…";
const FOCUS_ANIMATION_MS = 400;
/** `mapLayers` のマーカー（既定 0）より選択・現在地マーカーを上に描く（SS-118）。 */
const SELECTED_MARKER_Z_INDEX = 1;
const CURRENT_MARKER_Z_INDEX = 2;

/**
 * PinMapCanvas — ピン関連の地図そのもの（SS-146 で `PinMapFullScreen` から切り出し）。
 * (a) 位置調整は `PinMapFullScreen` 経由で、
 * (d) ピンタブ（SS-146）は直接使う。ヘッダー・通知・ツール・下部カード・safe area は持たない
 * （呼び出し側の責務）。地図の設定を1か所に保つ（ADR-011 D8）。
 * `showsUserLocation` は使わない（`WalkRouteMapView` と同じ理由。`EXPO_PUBLIC_LOCATION_MODE=mock`
 * のとき OS の青い点が mock の位置と食い違って点が2つ出る）。
 */
export function PinMapCanvas({
  testIDPrefix: p,
  accessibilityLabel,
  accessibilityHint,
  initialRegion,
  loadingLabel = DEFAULT_LOADING_LABEL,
  pickGesture,
  onPick,
  selectedLocation,
  currentLocation,
  focusRequest,
  mapLayers,
  onRegionChangeComplete,
}: PinMapCanvasProps) {
  const theme = useTheme();
  const styles = useStyles();
  const mapRef = useRef<MapView>(null);
  const lastNonceRef = useRef<number | null>(null);
  // `onMapReady` は画面を離れて戻るたびにも呼ばれる。カメラは離れる前の位置のままなので、
  // `initialRegion` を表示範囲として報告するのは初回だけにする（`WalkRouteMapView` と同じ）。
  const hasReportedInitialRegion = useRef(false);

  useEffect(() => {
    if (focusRequest === null) return;
    if (lastNonceRef.current === focusRequest.nonce) return;
    lastNonceRef.current = focusRequest.nonce;
    mapRef.current?.animateToRegion(regionAroundPoint(focusRequest.target), FOCUS_ANIMATION_MS);
  }, [focusRequest]);

  const handlePick = (e: MapPressEvent | PoiClickEvent | LongPressEvent) => {
    const picked = toPickedCoordinate(e.nativeEvent.coordinate);
    if (picked !== null) onPick?.(picked);
  };

  const handleRegionChangeComplete = (region: MapRegion) => {
    const sanitized = sanitizeMapRegion(region);
    if (sanitized !== null) onRegionChangeComplete?.(sanitized);
  };

  if (initialRegion === null) {
    return (
      <View
        testID={`${p}-map-loading`}
        style={[styles.loading, { backgroundColor: theme.map.canvas }]}
      >
        <ActivityIndicator color={theme.colors.primary} />
        <Text style={styles.loadingLabel}>{loadingLabel}</Text>
      </View>
    );
  }

  return (
    <View
      testID={`${p}-map`}
      collapsable={false}
      accessible
      accessibilityLabel={accessibilityLabel}
      // 地図（MapView/Marker）はジェスチャー操作前提で、支援技術での代替入力手段は
      // 用意していない（既知の限界。ADR-011 参照）。せめて何をすれば選べるかを
      // accessibilityHint で伝える。文言は下部カードの hint と揃える（pickGesture ごとに
      // 呼び出し側が渡す文言が変わる）。
      accessibilityHint={accessibilityHint}
      style={styles.mapWrap}
    >
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={initialRegion}
        showsUserLocation={false}
        showsMyLocationButton={false}
        toolbarEnabled={false}
        onPress={pickGesture === "tap" ? handlePick : undefined}
        onPoiClick={pickGesture === "tap" ? handlePick : undefined}
        onLongPress={pickGesture === "none" ? undefined : handlePick}
        // マーカーのタップでカメラを動かさない（登録済みピンはタップで詳細へ移るため。SS-118）。
        moveOnMarkerPress={false}
        onMapReady={() => {
          if (hasReportedInitialRegion.current) return;
          hasReportedInitialRegion.current = true;
          handleRegionChangeComplete(initialRegion);
        }}
        onRegionChangeComplete={handleRegionChangeComplete}
      >
        {selectedLocation !== null ? (
          <Marker
            coordinate={selectedLocation}
            anchor={{ x: 0.5, y: 1 }}
            tracksViewChanges={false}
            zIndex={SELECTED_MARKER_Z_INDEX}
            testID={`${p}-marker`}
          >
            <MapPin category="park" icon="map-pin" size={38} />
          </Marker>
        ) : null}
        {currentLocation !== null ? (
          <Marker
            coordinate={currentLocation}
            anchor={{ x: 0.5, y: 1 }}
            tracksViewChanges={false}
            zIndex={CURRENT_MARKER_Z_INDEX}
            testID={`${p}-current-marker`}
          >
            <MapPin category="current" size={30} />
          </Marker>
        ) : null}
        {mapLayers}
      </MapView>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[3],
  },
  loadingLabel: {
    fontSize: theme.typography.size.sm,
    color: theme.colors.textSecondary,
  },
  mapWrap: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
}));
