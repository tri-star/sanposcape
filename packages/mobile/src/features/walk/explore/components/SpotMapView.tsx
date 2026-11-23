import { useEffect, useRef } from "react";
import { ActivityIndicator, type StyleProp, View, type ViewStyle } from "react-native";
import MapView, { Marker } from "react-native-maps";

import { MAP_PROVIDER } from "@/config/mapProvider";
import { MapPin } from "@/components/ui/map-pin/MapPin";
import { mapPinMarkerPlacement } from "@/components/ui/map-pin/mapPinGeometry";
import { WalkRouteLegend } from "@/features/walk/route/components/WalkRouteLegend";
import { WalkRoutePolylines } from "@/features/walk/route/components/WalkRoutePolylines";
import { CATEGORY_META } from "@/features/walk/explore/data/categories";
import { useMapRouteFit } from "@/features/walk/route/hooks/useMapRouteFit";
import { regionForRoundTrip } from "@/features/walk/route/lib/mapRegion";
import type { SpotCandidate } from "@/features/walk/explore/types";
import type { WalkDestination } from "@/features/walk/shared/types";
import type { WalkRoute } from "@/features/walk/route/types";
import type { GeoCoordinates } from "@/services/location/types";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

export type SpotMapViewProps = {
  origin: GeoCoordinates | null;
  durationMin: number;
  candidates: readonly SpotCandidate[];
  selectedSpotId: string | null;
  onSelectSpot: (id: string) => void;
  /** 選択中スポットへの徒歩ルート。null ならルートを描かない。 */
  walkRoute?: WalkRoute | null;
  /**
   * 候補から選ぶのではなく固定の目的地（ピンを目的地にして開いたとき。SS-170）。
   * 渡すとゴールのピンで描く（`candidates` は空で渡す）。
   */
  fixedDestination?: WalkDestination | null;
  style?: StyleProp<ViewStyle>;
  height?: number;
  testID?: string;
};

/** アニメーション付き再センタリングの所要時間（ms）。 */
const RECENTER_ANIMATION_MS = 400;
const SPOT_PIN_SIZE = 30;
const SELECTED_PIN_SIZE = 42;

/**
 * SpotMapView — react-native-maps のラッパ。実地図（Android=Google Maps / iOS=キーを入れたビルドは Google Maps、それ以外は Apple Maps）を表示する。
 * `provider` は `MAP_PROVIDER`（`src/config/mapProvider.ts`。SS-267）。候補は Google Places の内容なので、Google の地図に出すのが規約上の前提（ADR-001 の SS-267 追補）。
 */
export function SpotMapView({
  origin,
  durationMin,
  candidates,
  selectedSpotId,
  onSelectSpot,
  walkRoute = null,
  fixedDestination = null,
  style,
  height = 296,
  testID,
}: SpotMapViewProps) {
  const theme = useTheme();
  const styles = useStyles();
  const mapRef = useRef<MapView>(null);

  // `MapView` の `initialRegion` はマウント時の1回しか読まれないため、
  // 以後の再センタリングは下の useEffect（`animateToRegion`）が担う。
  const initialRegion = origin ? regionForRoundTrip(origin, durationMin) : null;

  useEffect(() => {
    // ルート表示中は往復半径での再センタリングをしない（線が画面外に出るのを防ぐ）。
    // この抑止は WalkRouteMapView には無い SpotMapView 固有の挙動のため、共通 hook には含めない。
    if (walkRoute) return;
    if (!origin) return;
    mapRef.current?.animateToRegion(regionForRoundTrip(origin, durationMin), RECENTER_ANIMATION_MS);
  }, [origin, durationMin, walkRoute]);

  // ルートが届いたときの bounds フィット（`WalkRouteMapView` と共通の hook）。
  useMapRouteFit(mapRef, walkRoute, RECENTER_ANIMATION_MS);

  if (!origin || !initialRegion) {
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
        // iOS もキーを入れたビルドでは Google Maps（SS-267。`src/config/mapProvider.ts`）。
        provider={MAP_PROVIDER}
        ref={mapRef}
        testID={testID}
        style={styles.map}
        initialRegion={initialRegion}
        showsUserLocation
        showsMyLocationButton={false}
        toolbarEnabled={false}
      >
        {walkRoute ? <WalkRoutePolylines walkRoute={walkRoute} /> : null}
        {fixedDestination ? (
          <Marker
            key={fixedDestination.placeId}
            identifier={fixedDestination.placeId}
            coordinate={fixedDestination.location}
            title={fixedDestination.name}
            accessibilityLabel={fixedDestination.name}
            tracksViewChanges={false}
            {...mapPinMarkerPlacement(SELECTED_PIN_SIZE)}
            testID="walk-start-destination-marker"
          >
            <MapPin category="goal" size={SELECTED_PIN_SIZE} />
          </Marker>
        ) : null}
        {candidates.map((spot, index) => {
          const selected = spot.id === selectedSpotId;
          const meta = CATEGORY_META[spot.category];
          const pinSize = selected ? SELECTED_PIN_SIZE : SPOT_PIN_SIZE;
          return (
            // 選択状態を key に含めて作り直す: tracksViewChanges={false} にすると子 View の変化が
            // ネイティブに反映されないため（react-native-maps の定番回避策）。
            <Marker
              key={`${spot.id}:${selected}`}
              identifier={spot.id}
              coordinate={spot.location}
              title={spot.name}
              accessibilityLabel={spot.name}
              onPress={() => onSelectSpot(spot.id)}
              tracksViewChanges={false}
              {...mapPinMarkerPlacement(pinSize)}
              testID={`spot-marker-${index}`}
            >
              <MapPin category={selected ? "goal" : meta.pin} size={pinSize} />
            </Marker>
          );
        })}
      </MapView>
      {walkRoute ? (
        <WalkRouteLegend walkRoute={walkRoute} testID="walk-start-route-legend" />
      ) : null}
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
