import { useMemo } from "react";
import { type StyleProp, Text, View, type ViewStyle } from "react-native";
import MapView, { Marker } from "react-native-maps";

import { MapPin } from "@/components/ui/map-pin/MapPin";
import { RoutePolyline } from "@/components/ui/route-polyline/RoutePolyline";
import { isValidCoordinate } from "@/lib/geoCoordinate";
import { regionForCoordinates } from "@/lib/mapRegion";
import type { GeoCoordinates } from "@/services/location/types";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

export type WalkTrackMapViewProps = {
  track: readonly GeoCoordinates[];
  destination: GeoCoordinates;
  destinationName: string;
  height?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * WalkTrackMapView — 履歴詳細の軌跡地図。保存済みの記録は不変なので、`WalkRouteMapView` と違い
 * `animateToRegion` は使わず初期表示で確定させる（`useMapRouteFit` は import しない）。
 */
export function WalkTrackMapView({
  track,
  destination,
  destinationName,
  height = 260,
  style,
  testID,
}: WalkTrackMapViewProps) {
  const theme = useTheme();
  const styles = useStyles();

  const initialRegion = useMemo(
    () => regionForCoordinates([...track, destination]),
    [track, destination],
  );

  if (initialRegion === null) {
    return (
      <View
        testID={testID}
        style={[styles.placeholder, { height, backgroundColor: theme.map.canvas }, style]}
      >
        <Text style={styles.placeholderText}>この散歩の軌跡は記録されていません</Text>
      </View>
    );
  }

  return (
    <View style={[{ height }, style]}>
      <MapView
        testID={testID}
        style={styles.map}
        initialRegion={initialRegion}
        showsUserLocation={false}
        showsMyLocationButton={false}
        toolbarEnabled={false}
      >
        <RoutePolyline path={track} />
        {track[0] ? (
          <Marker
            coordinate={track[0]}
            identifier="start"
            anchor={{ x: 0.5, y: 1 }}
            tracksViewChanges={false}
            testID="walk-detail-start-marker"
          >
            <MapPin category="current" size={30} />
          </Marker>
        ) : null}
        {isValidCoordinate(destination) ? (
          <Marker
            coordinate={destination}
            identifier="goal"
            title={destinationName}
            anchor={{ x: 0.5, y: 1 }}
            tracksViewChanges={false}
            testID="walk-detail-goal-marker"
          >
            <MapPin category="goal" icon="flag" size={38} />
          </Marker>
        ) : null}
      </MapView>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  placeholder: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.layout.pageGutter,
  },
  placeholderText: {
    textAlign: "center",
    fontSize: theme.typography.size.sm,
    color: theme.colors.textSecondary,
  },
  map: {
    flex: 1,
  },
}));
