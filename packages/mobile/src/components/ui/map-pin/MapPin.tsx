import { type ReactNode, useMemo } from "react";
import { type StyleProp, Text, View, type ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";

import { Icon, type IconName } from "@/components/ui/icon/Icon";
import { computeMapPinGeometry } from "@/components/ui/map-pin/mapPinGeometry";
import { makeStyles } from "@/theme/makeStyles";
import { mixHex } from "@/theme/mixHex";
import type { Theme } from "@/theme/tokens";
import { useTheme } from "@/theme/useTheme";

export type MapPinCategory =
  | "park"
  | "cafe"
  | "culture"
  | "station"
  | "sky"
  | "brown"
  | "goal"
  | "current";

export type MapPinProps = {
  category?: MapPinCategory;
  /** カテゴリ既定のアイコンを上書きする。 */
  icon?: IconName;
  /**
   * カラーの画像（地図のアイコン。SS-191）。渡すと `icon` の代わりに、ピンの色を薄めた円の上にこれを描く。
   * 親の大きさいっぱいに描く要素を渡す（大きさと位置は MapPin が決める）。
   */
  art?: ReactNode;
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
  sky: "cloud-rain",
  brown: "cat",
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
export function MapPin({
  category = "cafe",
  icon,
  art,
  label,
  size = 40,
  style,
  testID,
}: MapPinProps) {
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
        {art ? (
          <>
            <View
              pointerEvents="none"
              style={[
                styles.overlay,
                styles.artDisc,
                {
                  left: g.artDisc.left,
                  top: g.artDisc.top,
                  width: g.artDisc.size,
                  height: g.artDisc.size,
                  backgroundColor: mapPinArtSurfaceColor(theme, color),
                },
              ]}
            />
            <View
              pointerEvents="none"
              style={[
                styles.overlay,
                { left: g.art.left, top: g.art.top, width: g.art.size, height: g.art.size },
              ]}
            >
              {art}
            </View>
          </>
        ) : (
          <View
            pointerEvents="none"
            style={[styles.overlay, { left: g.glyph.left, top: g.glyph.top }]}
          >
            <Icon
              name={icon ?? DEFAULT_ICON[category]}
              size={g.glyph.size}
              color={theme.colors.onColor}
              strokeWidth={2.4}
            />
          </View>
        )}
      </View>
      {label ? (
        <Text numberOfLines={1} style={[styles.label, { color }]}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}

/** カラーの画像の下に敷く面の色（色の割合）。カテゴリ色を白に混ぜる。 */
const ART_SURFACE_TINT = 0.16;

/**
 * カラーの画像（地図のアイコン）の下に敷く面の色。カテゴリ色を白に薄く混ぜる（SS-191。ADR-M-019）。
 * 白そのものだと、白が主体の絵（おにぎりなど）の輪郭が消える。テーマによらず同じ明るい面にする
 * （絵文字は明るい背景を前提に描かれているため）。ピン以外（ピッカー・バッジ）でも同じ色を使う。
 */
export function mapPinArtSurfaceColor(theme: Theme, categoryColor: string): string {
  return mixHex(categoryColor, theme.palette.white, ART_SURFACE_TINT);
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
  overlay: {
    position: "absolute",
  },
  artDisc: {
    borderRadius: theme.radius.pill,
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
