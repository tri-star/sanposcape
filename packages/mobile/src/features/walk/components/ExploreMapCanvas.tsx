import { useEffect, useMemo, useRef } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import MapView, { Marker, Polyline, type Region } from "react-native-maps";

import { IconButton } from "@/components/ui/icon-button/IconButton";
import type { WalkingRouteResponse } from "@/api/generated/model/walkingRouteResponse";
import type { ExploreSpot } from "@/features/walk/lib/exploreMapping";
import type { LocationCoordinates } from "@/services/location/types";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

const FALLBACK_REGION: Region = {
  latitude: 35.681236,
  longitude: 139.767125,
  latitudeDelta: 0.03,
  longitudeDelta: 0.03,
};

export type ExploreMapCanvasProps = {
  origin: LocationCoordinates | null;
  spots: readonly ExploreSpot[];
  selectedSpotId: string | null;
  route: WalkingRouteResponse | undefined;
  onSelectSpot: (id: string) => void;
  onCurrentLocation: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * 散歩開始専用の native map。散歩中画面は既存の静的 MapCanvas を継続利用する。
 */
export function ExploreMapCanvas({
  origin,
  spots,
  selectedSpotId,
  route,
  onSelectSpot,
  onCurrentLocation,
  style,
  testID,
}: ExploreMapCanvasProps) {
  const mapRef = useRef<MapView>(null);
  const theme = useTheme();
  const styles = useStyles();
  const region = useMemo<Region>(
    () => (origin ? { ...origin, latitudeDelta: 0.02, longitudeDelta: 0.02 } : FALLBACK_REGION),
    [origin],
  );

  useEffect(() => {
    if (origin) mapRef.current?.animateToRegion(region, 350);
  }, [origin, region]);

  useEffect(() => {
    if (!route) return;
    mapRef.current?.fitToCoordinates([route.bounds.south_west, route.bounds.north_east], {
      animated: true,
      edgePadding: { top: 44, right: 44, bottom: 44, left: 44 },
    });
  }, [route]);

  return (
    <View style={[styles.root, style]}>
      <MapView ref={mapRef} initialRegion={region} style={StyleSheet.absoluteFill} testID={testID}>
        {origin ? (
          <Marker coordinate={origin} title="現在地" identifier="current-location" />
        ) : null}
        {spots.map((spot) => (
          <Marker
            key={spot.id}
            coordinate={{ latitude: spot.latitude, longitude: spot.longitude }}
            title={spot.name}
            description={`往復 ${spot.roundTripDurationMinutes}分`}
            identifier={`spot-${spot.id}`}
            pinColor={selectedSpotId === spot.id ? theme.colors.primary : undefined}
            onPress={() => onSelectSpot(spot.id)}
            accessibilityLabel={`${spot.name}、往復${spot.roundTripDurationMinutes}分`}
            testID={`map-marker-${spot.id}`}
          />
        ))}
        {route ? (
          <Polyline
            coordinates={route.path}
            strokeColor={theme.map.route}
            strokeWidth={5}
            testID="walking-route-polyline"
          />
        ) : null}
      </MapView>
      <IconButton
        icon="crosshair"
        label="現在地を再取得"
        variant="surface"
        size="md"
        onPress={onCurrentLocation}
        style={styles.locationButton}
        testID="walk-start-current-location"
      />
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    height: 296,
    overflow: "hidden",
    borderRadius: theme.radius.lg,
    borderWidth: theme.layout.hairline,
    borderColor: theme.colors.borderSubtle,
  },
  locationButton: {
    position: "absolute",
    right: theme.spacing[3],
    bottom: theme.spacing[3],
  },
}));
