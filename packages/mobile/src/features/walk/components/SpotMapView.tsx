import { useEffect, useRef } from "react";
import { ActivityIndicator, type StyleProp, View, type ViewStyle } from "react-native";
import MapView, { Marker } from "react-native-maps";

import { MapPin } from "@/components/ui/map-pin/MapPin";
import { WalkRoutePolyline } from "@/features/walk/components/WalkRoutePolyline";
import { CATEGORY_META } from "@/features/walk/data/categories";
import { regionForBounds, regionForRoundTrip } from "@/features/walk/lib/mapRegion";
import type { SpotCandidate, WalkRoute } from "@/features/walk/types";
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
  style?: StyleProp<ViewStyle>;
  height?: number;
  testID?: string;
};

/** アニメーション付き再センタリングの所要時間（ms）。 */
const RECENTER_ANIMATION_MS = 400;

/**
 * SpotMapView — react-native-maps のラッパ。実地図（Android=Google Maps / iOS=Apple Maps）を表示する。
 * `provider` は指定しない（iOS のキーが不要になるため。§5.20）。
 */
export function SpotMapView({
  origin,
  durationMin,
  candidates,
  selectedSpotId,
  onSelectSpot,
  walkRoute = null,
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
    if (walkRoute) return;
    if (!origin) return;
    mapRef.current?.animateToRegion(regionForRoundTrip(origin, durationMin), RECENTER_ANIMATION_MS);
  }, [origin, durationMin, walkRoute]);

  // 依存は walkRoute.destination.placeId のみ（ルートが変わった時だけフィットし直す）。
  useEffect(() => {
    if (!walkRoute) return;
    mapRef.current?.animateToRegion(regionForBounds(walkRoute.bounds), RECENTER_ANIMATION_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- walkRoute 全体ではなく placeId の変化だけを見る
  }, [walkRoute?.destination.placeId]);

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
        ref={mapRef}
        testID={testID}
        style={styles.map}
        initialRegion={initialRegion}
        showsUserLocation
        showsMyLocationButton={false}
        toolbarEnabled={false}
      >
        {walkRoute ? <WalkRoutePolyline path={walkRoute.path} /> : null}
        {candidates.map((spot, index) => {
          const selected = spot.id === selectedSpotId;
          const meta = CATEGORY_META[spot.category];
          return (
            // 選択状態を key に含めて作り直す: tracksViewChanges={false} にすると子 View の変化が
            // ネイティブに反映されないため（react-native-maps の定番回避策）。
            <Marker
              key={`${spot.id}:${selected}`}
              identifier={spot.id}
              coordinate={spot.location}
              onPress={() => onSelectSpot(spot.id)}
              tracksViewChanges={false}
              anchor={{ x: 0.5, y: 1 }}
              testID={`spot-marker-${index}`}
            >
              <MapPin category={selected ? "goal" : meta.pin} size={selected ? 42 : 30} />
            </Marker>
          );
        })}
      </MapView>
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
