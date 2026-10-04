import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Card } from "@/components/ui/card/Card";
import { Icon } from "@/components/ui/icon/Icon";
import { IconButton } from "@/components/ui/icon-button/IconButton";
import { PinMapCanvas } from "@/features/pin/components/PinMapCanvas";
import type { PinMapPickProps } from "@/features/pin/lib/pinLocationPicker";
import type { SanpoMapIconKey } from "@/features/pin/types";
import type { MapRegion } from "@/lib/mapRegion";
import type { GeoCoordinates } from "@/services/location/types";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

type PinMapFullScreenCommonProps = {
  /**
   * testID の接頭辞。次を付ける:
   * `${p}-screen`（root）/ `${p}-map`（地図を包む View。canvas が付ける）/ `${p}-close` /
   * `${p}-marker`（選択位置の Marker）/ `${p}-map-loading`（initialRegion が null の間）/ `${p}-hint`
   */
  testIDPrefix: string;
  title: string;
  /** 下部カードの説明文（例: 「地図をタップすると、その場所にピンが移動します」）。 */
  hint: string;
  /** null の間は地図を出さず読み込み表示にする。 */
  initialRegion: MapRegion | null;
  /** 選択中の位置（(a) のピン）。null ならマーカーを出さない。 */
  selectedLocation: GeoCoordinates | null;
  /** 選択位置のピンの見た目（保存先の地図のアイコン）。 */
  selectedMarkerIcon?: SanpoMapIconKey;
  /** x「閉じる」ボタンを押したとき。 */
  onClose: () => void;
  /** 下部カードのヒントの下に置くアクション（(a) の「この位置にする」）。 */
  footerActions?: ReactNode;
};

export type PinMapFullScreenProps = PinMapFullScreenCommonProps & PinMapPickProps;

/**
 * PinMapFullScreen — (a) 位置調整オーバーレイの全画面地図の枠（SS-124）。
 * 呼び出し元は `PinLocationAdjustOverlay` だけ。かつて (b) 地点選択・(c) `/pins/map` も使っていたが、
 * SS-147 で両画面を削除し、それらだけが使っていた props（戻るボタン・現在地・再センタリング・
 * 通知・地図ツール・追加レイヤー・表示範囲の通知・読み込み文言）も取り除いた。
 * `showsUserLocation` は使わない（`WalkRouteMapView` と同じ理由。`EXPO_PUBLIC_LOCATION_MODE=mock`
 * のとき OS の青い点が mock の位置と食い違って点が2つ出る）。
 */
export function PinMapFullScreen({
  testIDPrefix: p,
  title,
  hint,
  initialRegion,
  selectedLocation,
  selectedMarkerIcon,
  onClose,
  footerActions,
  // pickGesture / onPick は canvas へそのまま渡す。
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
        selectedLocation={selectedLocation}
        selectedMarkerIcon={selectedMarkerIcon}
        currentLocation={null}
        focusRequest={null}
      />

      <View style={[styles.header, { top: insets.top + theme.spacing[2] }]}>
        <IconButton
          icon="x"
          label="閉じる"
          variant="surface"
          onPress={onClose}
          testID={`${p}-close`}
        />
        <Card style={styles.titleCard}>
          <Text style={styles.titleText}>{title}</Text>
        </Card>
      </View>

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
