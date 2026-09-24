import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import MapView, {
  Marker,
  type LongPressEvent,
  type MapPressEvent,
  type PoiClickEvent,
} from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Card } from "@/components/ui/card/Card";
import { Icon } from "@/components/ui/icon/Icon";
import { IconButton } from "@/components/ui/icon-button/IconButton";
import { MapPin } from "@/components/ui/map-pin/MapPin";
import { regionAroundPoint, toPickedCoordinate } from "@/features/pin/lib/pinLocationPicker";
import type { MapRegion } from "@/lib/mapRegion";
import type { GeoCoordinates } from "@/services/location/types";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

export type PinMapFocusRequest = { target: GeoCoordinates; nonce: number };

export type PinMapFullScreenProps = {
  /**
   * testID の接頭辞。次を付ける:
   * `${p}-screen`（root）/ `${p}-map`（地図を包む View）/ `${p}-back` か `${p}-close`（closeKind による）/
   * `${p}-marker`（選択位置の Marker）/ `${p}-current-marker`（現在地の Marker）/
   * `${p}-loading`（initialRegion が null の間）/ `${p}-hint`
   */
  testIDPrefix: string;
  title: string;
  /** 下部カードの説明文（例: 「地図を長押しすると、その場所にピンを登録できます」）。 */
  hint: string;
  /** null の間は地図を出さず読み込み表示にする（(b) の現在地の初回取得中）。 */
  initialRegion: MapRegion | null;
  /** 読み込み表示の文言。既定「現在地を取得しています…」。 */
  loadingLabel?: string;
  /** "tap" = onPress / onPoiClick / onLongPress で選ぶ（(a)）。"long-press" = onLongPress だけ（(b)）。 */
  pickGesture: "tap" | "long-press";
  /** 検証済み（toPickedCoordinate を通した）座標だけが渡る。 */
  onPick: (location: GeoCoordinates) => void;
  /** 選択中の位置（(a) のピン）。null ならマーカーを出さない。 */
  selectedLocation: GeoCoordinates | null;
  /** 現在地（(b)）。null なら出さない。 */
  currentLocation: GeoCoordinates | null;
  /** nonce が変わるたびに target へ animateToRegion する（WalkRouteMapView の recenterNonce と同じ考え方）。 */
  focusRequest: PinMapFocusRequest | null;
  /** "back" = chevron-left「戻る」（画面として使う (b)）、"close" = x「閉じる」（オーバーレイ (a)）。 */
  closeKind: "back" | "close";
  onClose: () => void;
  /** 地図の右上に重ねるツール（(b) の現在地ボタンなど）。 */
  mapTools?: ReactNode;
  /** ヘッダーの下に重ねる通知（(b) の LocationPermissionNotice）。 */
  notice?: ReactNode;
  /** 下部カードのヒントの下に置くアクション（(a) の「この位置にする」）。 */
  footerActions?: ReactNode;
};

const DEFAULT_LOADING_LABEL = "現在地を取得しています…";
const FOCUS_ANIMATION_MS = 400;

/**
 * PinMapFullScreen — (a)(b) 共通の全画面地図の枠（SS-124）。
 * (b) 地点選択画面ではそのまま画面になり、(a) 位置調整ではオーバーレイの中身になる。
 * `showsUserLocation` は使わない（`WalkRouteMapView` と同じ理由。`EXPO_PUBLIC_LOCATION_MODE=mock`
 * のとき OS の青い点が mock の位置と食い違って点が2つ出る）。
 */
export function PinMapFullScreen({
  testIDPrefix: p,
  title,
  hint,
  initialRegion,
  loadingLabel = DEFAULT_LOADING_LABEL,
  pickGesture,
  onPick,
  selectedLocation,
  currentLocation,
  focusRequest,
  closeKind,
  onClose,
  mapTools,
  notice,
  footerActions,
}: PinMapFullScreenProps) {
  const theme = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const lastNonceRef = useRef<number | null>(null);

  useEffect(() => {
    if (focusRequest === null) return;
    if (lastNonceRef.current === focusRequest.nonce) return;
    lastNonceRef.current = focusRequest.nonce;
    mapRef.current?.animateToRegion(regionAroundPoint(focusRequest.target), FOCUS_ANIMATION_MS);
  }, [focusRequest]);

  const handlePick = (e: MapPressEvent | PoiClickEvent | LongPressEvent) => {
    const picked = toPickedCoordinate(e.nativeEvent.coordinate);
    if (picked !== null) onPick(picked);
  };

  return (
    <View testID={`${p}-screen`} style={styles.root}>
      {initialRegion === null ? (
        <View
          testID={`${p}-loading`}
          style={[styles.loading, { backgroundColor: theme.map.canvas }]}
        >
          <ActivityIndicator color={theme.colors.primary} />
          <Text style={styles.loadingLabel}>{loadingLabel}</Text>
        </View>
      ) : (
        <View
          testID={`${p}-map`}
          collapsable={false}
          accessible
          accessibilityLabel={title}
          // 地図（MapView/Marker）はジェスチャー操作前提で、支援技術での代替入力手段は
          // 用意していない（既知の限界。ADR-011 参照）。せめて何をすれば選べるかを
          // accessibilityHint で伝える。文言は下部カードの hint と揃える（pickGesture ごとに
          // 呼び出し側が渡す文言が変わる）。
          accessibilityHint={hint}
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
            onLongPress={handlePick}
          >
            {selectedLocation !== null ? (
              <Marker
                coordinate={selectedLocation}
                anchor={{ x: 0.5, y: 1 }}
                tracksViewChanges={false}
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
                testID={`${p}-current-marker`}
              >
                <MapPin category="current" size={30} />
              </Marker>
            ) : null}
          </MapView>
        </View>
      )}

      <View style={[styles.header, { top: insets.top + theme.spacing[2] }]}>
        <IconButton
          icon={closeKind === "back" ? "chevron-left" : "x"}
          label={closeKind === "back" ? "戻る" : "閉じる"}
          variant="surface"
          onPress={onClose}
          testID={closeKind === "back" ? `${p}-back` : `${p}-close`}
        />
        <Card style={styles.titleCard}>
          <Text style={styles.titleText}>{title}</Text>
        </Card>
      </View>

      {notice ? (
        <View
          style={[
            styles.notice,
            { top: insets.top + theme.spacing[2] + theme.control.md + theme.spacing[3] },
          ]}
        >
          {notice}
        </View>
      ) : null}

      {mapTools ? (
        <View
          style={[
            styles.mapTools,
            { top: insets.top + theme.spacing[2] + theme.control.md + theme.spacing[3] },
          ]}
        >
          {mapTools}
        </View>
      ) : null}

      <Card style={[styles.footer, { bottom: insets.bottom + theme.spacing[4] }]}>
        <View style={styles.hintRow}>
          <Icon name="info" size={18} color={theme.colors.textTertiary} />
          <Text style={styles.hintText} testID={`${p}-hint`}>
            {hint}
          </Text>
        </View>
        {footerActions}
      </Card>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    flex: 1,
    backgroundColor: theme.colors.surfaceApp,
  },
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
  header: {
    position: "absolute",
    left: theme.layout.pageGutter,
    right: theme.layout.pageGutter,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  titleCard: {
    borderRadius: theme.radius.pill,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[4],
  },
  titleText: {
    fontSize: theme.typography.size.md,
    fontWeight: theme.typography.weight.bold,
    color: theme.colors.textPrimary,
  },
  notice: {
    position: "absolute",
    left: 0,
    right: 0,
  },
  mapTools: {
    position: "absolute",
    right: theme.layout.pageGutter,
    gap: theme.spacing[2],
  },
  footer: {
    position: "absolute",
    left: theme.layout.pageGutter,
    right: theme.layout.pageGutter,
    gap: theme.spacing[3],
  },
  hintRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing[2],
  },
  hintText: {
    flex: 1,
    fontSize: theme.typography.size.sm,
    color: theme.colors.textSecondary,
  },
}));
