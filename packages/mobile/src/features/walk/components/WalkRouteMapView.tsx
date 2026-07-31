import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { ActivityIndicator, type StyleProp, View, type ViewStyle } from "react-native";
import MapView, { Marker } from "react-native-maps";

import { MapPin } from "@/components/ui/map-pin/MapPin";
import { WalkRoutePolyline } from "@/features/walk/components/WalkRoutePolyline";
import { regionForBounds, regionForRoundTrip } from "@/features/walk/lib/mapRegion";
import type { WalkRoute } from "@/features/walk/types";
import type { GeoCoordinates } from "@/services/location/types";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

export type WalkRouteMapViewProps = {
  walkRoute: WalkRoute | null;
  currentPosition: GeoCoordinates | null;
  /** 目的地ピンのラベル。 */
  destinationName: string;
  /** インクリメントされるたびに現在地へ再センタリングする。 */
  recenterNonce: number;
  height?: number;
  style?: StyleProp<ViewStyle>;
  /** 地図上に重ねる追加コンテンツ（ツールボタンなど）。 */
  children?: ReactNode;
  testID?: string;
};

/** アニメーション付き再センタリングの所要時間（ms）。 */
const ROUTE_FIT_ANIMATION_MS = 400;
/** 現在地への再センタリング（recenterNonce）のアニメーション所要時間（ms）。 */
const RECENTER_ANIMATION_MS = 400;
/** ルートが未取得のときに現在地を中心として表示する緩い往復時間相当（分）。 */
const FALLBACK_DURATION_MIN = 20;

/**
 * WalkRouteMapView — 散歩中画面の実地図。ルート・目的地・現在地を描く。
 * `showsUserLocation` は使わない。`EXPO_PUBLIC_LOCATION_MODE=mock` のとき OS の青ドットは
 * mock 軌跡と食い違い、点が2つ出て混乱するため、現在地は必ず `locationService` 由来の値で描く。
 */
export function WalkRouteMapView({
  walkRoute,
  currentPosition,
  destinationName,
  recenterNonce,
  height = 322,
  style,
  children,
  testID,
}: WalkRouteMapViewProps) {
  const theme = useTheme();
  const styles = useStyles();
  const mapRef = useRef<MapView>(null);
  const isFirstRecenter = useRef(true);

  const initialRegion = walkRoute
    ? regionForBounds(walkRoute.bounds)
    : currentPosition
      ? regionForRoundTrip(currentPosition, FALLBACK_DURATION_MIN)
      : null;

  // ルートが後から届いたときの初回フィット。
  useEffect(() => {
    if (!walkRoute) return;
    mapRef.current?.animateToRegion(regionForBounds(walkRoute.bounds), ROUTE_FIT_ANIMATION_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- walkRoute 全体ではなく placeId の変化だけを見る
  }, [walkRoute?.destination.placeId]);

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
    <View style={[{ height }, style]}>
      <MapView
        ref={mapRef}
        testID={testID}
        style={styles.map}
        initialRegion={initialRegion}
        showsUserLocation={false}
        showsMyLocationButton={false}
        toolbarEnabled={false}
      >
        {walkRoute ? <WalkRoutePolyline path={walkRoute.path} /> : null}
        {walkRoute ? (
          <Marker
            coordinate={walkRoute.destination.location}
            identifier="goal"
            anchor={{ x: 0.5, y: 1 }}
            tracksViewChanges={false}
            testID="walk-active-goal-marker"
          >
            <MapPin category="goal" icon="flag" size={38} />
          </Marker>
        ) : null}
        {currentPosition ? (
          <Marker
            coordinate={currentPosition}
            identifier="current"
            anchor={{ x: 0.5, y: 1 }}
            tracksViewChanges={false}
            testID="walk-active-current-marker"
          >
            <MapPin category="current" size={30} />
          </Marker>
        ) : null}
      </MapView>
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
