import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Card } from "@/components/ui/card/Card";
import { Icon } from "@/components/ui/icon/Icon";
import { IconButton } from "@/components/ui/icon-button/IconButton";
import {
  PinMapCanvas,
  type PinMapFocusRequest,
  type PinMapPickProps,
} from "@/features/pin/components/PinMapCanvas";
import type { MapRegion } from "@/lib/mapRegion";
import type { GeoCoordinates } from "@/services/location/types";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

type PinMapFullScreenCommonProps = {
  /**
   * testID の接頭辞。次を付ける:
   * `${p}-screen`（root）/ `${p}-map`（地図を包む View。canvas が付ける）/ `${p}-back` か `${p}-close`（closeKind による）/
   * `${p}-marker`（選択位置の Marker）/ `${p}-current-marker`（現在地の Marker）/
   * `${p}-map-loading`（initialRegion が null の間）/ `${p}-hint`
   */
  testIDPrefix: string;
  title: string;
  /** 下部カードの説明文（例: 「地図を長押しすると、その場所にピンを登録できます」）。 */
  hint: string;
  /** null の間は地図を出さず読み込み表示にする（(b) の現在地の初回取得中）。 */
  initialRegion: MapRegion | null;
  /** 読み込み表示の文言。既定「現在地を取得しています…」。 */
  loadingLabel?: string;
  /** 選択中の位置（(a) のピン）。null ならマーカーを出さない。 */
  selectedLocation: GeoCoordinates | null;
  /** 現在地（(b)）。null なら出さない。 */
  currentLocation: GeoCoordinates | null;
  /** nonce が変わるたびに target へ animateToRegion する（WalkRouteMapView の recenterNonce と同じ考え方）。 */
  focusRequest: PinMapFocusRequest | null;
  /** "back" = chevron-left「戻る」（画面として使う (b)(c)）、"close" = x「閉じる」（オーバーレイ (a)）。 */
  closeKind: "back" | "close";
  onClose: () => void;
  /** 地図の右上に重ねるツール（(b)(c) の現在地ボタンなど）。 */
  mapTools?: ReactNode;
  /** ヘッダーの下に重ねる通知（(b)(c) の LocationPermissionNotice）。 */
  notice?: ReactNode;
  /** 下部カードのヒントの下に置くアクション（(a) の「この位置にする」・(c) の状態カード）。 */
  footerActions?: ReactNode;
  /**
   * `MapView` の子として描く追加レイヤー（(c)。SS-118）。増減するレイヤーなので `MapView` の
   * 子の末尾に置き、重なり順は `zIndex` で選択マーカー・現在地マーカーより下にする（mobile ADR-012 D16）。
   */
  mapLayers?: ReactNode;
  /**
   * 表示範囲が確定したとき（初回表示 + パン・ズーム後）に呼ぶ（(c)。SS-118）。
   * `sanitizeMapRegion` を通した値だけを渡す（null は捨てる）。
   */
  onRegionChangeComplete?: (region: MapRegion) => void;
};

export type PinMapFullScreenProps = PinMapFullScreenCommonProps & PinMapPickProps;

/**
 * PinMapFullScreen — (a)(b)(c) 共通の全画面地図の枠（SS-124 / SS-118）。
 * (b) 地点選択画面ではそのまま画面になり、(a) 位置調整ではオーバーレイの中身になり、
 * (c) 登録済みピンの閲覧（`/pins/map`。SS-118）でもそのまま画面になる。
 * `showsUserLocation` は使わない（`WalkRouteMapView` と同じ理由。`EXPO_PUBLIC_LOCATION_MODE=mock`
 * のとき OS の青い点が mock の位置と食い違って点が2つ出る）。
 */
export function PinMapFullScreen({
  testIDPrefix: p,
  title,
  hint,
  initialRegion,
  loadingLabel,
  selectedLocation,
  currentLocation,
  focusRequest,
  closeKind,
  onClose,
  mapTools,
  notice,
  footerActions,
  mapLayers,
  onRegionChangeComplete,
  // pickGesture / onPick は判別共用体のまま canvas へ渡す（分割代入すると型が広がる）。
  ...pick
}: PinMapFullScreenProps) {
  const theme = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();

  return (
    <View testID={`${p}-screen`} style={styles.root}>
      <PinMapCanvas
        {...pick}
        testIDPrefix={p}
        accessibilityLabel={title}
        accessibilityHint={hint}
        initialRegion={initialRegion}
        loadingLabel={loadingLabel}
        selectedLocation={selectedLocation}
        currentLocation={currentLocation}
        focusRequest={focusRequest}
        mapLayers={mapLayers}
        onRegionChangeComplete={onRegionChangeComplete}
      />

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
