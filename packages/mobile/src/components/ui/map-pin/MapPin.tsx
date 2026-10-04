import { useMemo } from "react";
import { type StyleProp, Text, View, type ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";

import { Icon, type IconName } from "@/components/ui/icon/Icon";
import { computeMapPinGeometry } from "@/components/ui/map-pin/mapPinGeometry";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

export type MapPinCategory = "park" | "cafe" | "culture" | "station" | "goal" | "current";

export type MapPinProps = {
  category?: MapPinCategory;
  /** カテゴリ既定のアイコンを上書きする。 */
  icon?: IconName;
  /** ピン下に出す小さなラベル。 */
  label?: string;
  /** 頭の直径（= 幅。px）。高さは約1.45倍。 */
  size?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const DEFAULT_ICON: Record<MapPinCategory, IconName> = {
  park: "tree-pine",
  cafe: "coffee",
  culture: "book-open",
  station: "train-front",
  goal: "flag",
  current: "navigation",
};

/**
 * MapPin — カテゴリごとに色分けした「丸い頭 + 細く尖った尾」のマーカー（SVG のシルエット）。
 * デザイン: Sanpo Design System / components/map/MapPin
 *
 * `Marker` の子に置くときは `mapPinMarkerPlacement(size)`（`@/components/ui/map-pin/mapPinGeometry`）を
 * `Marker` に spread する。`anchor` は Google Maps 専用で、iOS の Apple Maps は View の中心を座標に置く
 * ため `centerOffset` が要る（ADR-M-019）。基準点はラベル無しの高さで計算しているので、`label` は
 * `Marker` の子では使わない。
 */
export function MapPin({ category = "cafe", icon, label, size = 40, style, testID }: MapPinProps) {
  const theme = useTheme();
  const styles = useStyles();
  const g = useMemo(() => computeMapPinGeometry(size), [size]);

  const color =
    category === "goal"
      ? theme.map.station
      : category === "current"
        ? theme.map.route
        : theme.map[category];

  return (
    <View testID={testID} style={[styles.root, style]}>
      <View style={[styles.pin, { width: g.width, height: g.height }]}>
        <Svg width={g.width} height={g.height} viewBox={`0 0 ${g.width} ${g.height}`}>
          <Path
            d={g.path}
            fill={color}
            stroke={theme.colors.surfaceCard}
            strokeWidth={g.outlineWidth}
            strokeLinejoin="round"
          />
        </Svg>
        <View pointerEvents="none" style={[styles.glyph, { left: g.glyph.left, top: g.glyph.top }]}>
          <Icon
            name={icon ?? DEFAULT_ICON[category]}
            size={g.glyph.size}
            color={theme.colors.onColor}
            strokeWidth={2.4}
          />
        </View>
      </View>
      {label ? (
        <Text numberOfLines={1} style={[styles.label, { color }]}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    alignItems: "center",
  },
  pin: {
    // iOS は中身の形に沿った影が出る。Android は背景の無い View に elevation の影が出ないので、
    // 白い縁取りで地図と分ける。
    ...theme.shadows.pin,
  },
  glyph: {
    position: "absolute",
  },
  label: {
    marginTop: theme.spacing[1],
    paddingVertical: 3,
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surfaceCard,
    fontSize: theme.typography.size["2xs"],
    fontWeight: theme.typography.weight.bold,
    overflow: "hidden",
    ...theme.shadows.xs,
  },
}));
