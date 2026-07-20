import { View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useUnistyles, StyleSheet } from "react-native-unistyles";

import { Icon } from "@/components/ui/icon/Icon";
import {
  resolveMapPinAppearance,
  type MapPinCategory,
  type MapPinVariant,
} from "@/components/ui/map-pin/mapPinStyles";

export type MapPinProps = {
  category: MapPinCategory;
  /** 選択中は拡大表示 */
  selected?: boolean;
  /** 現在地など、カテゴリを持たない特殊ピン */
  variant?: MapPinVariant;
  testID?: string;
};

/** 雫型のピン。CSS の border-radius トリックは RN で再現できないため SVG の Path で描く(viewBox 32x40) */
const PIN_PATH = "M16 0C7.163 0 0 7.163 0 16c0 11 16 24 16 24s16-13 16-24C32 7.163 24.837 0 16 0z";
const VIEWBOX_ASPECT_RATIO = 40 / 32;

/**
 * `react-native-maps` の `Marker` の `children` として使うことを想定した、位置指定を持たない
 * 純粋な見た目コンポーネント。`Marker` 自体はラップしない(地図まわりは後続タスクの feature 側の責務)。
 *
 * `useUnistyles()` は `Svg`/`Path`/`Icon` の props(fill・iconName・color。いずれもネイティブ `style`
 * ではない)を得るためだけに使う。box/icon の配置(width/height/position)は StyleSheet.create 側で解決する。
 */
export function MapPin({ category, selected = false, variant = "category", testID }: MapPinProps) {
  const { theme } = useUnistyles();
  const args = { category, selected, variant };
  const appearance = resolveMapPinAppearance(theme, args);
  const height = Math.round(appearance.size * VIEWBOX_ASPECT_RATIO);

  return (
    <View testID={testID} accessibilityRole="image" style={styles.box(args)}>
      <Svg width={appearance.size} height={height} viewBox="0 0 32 40">
        <Path
          d={PIN_PATH}
          fill={appearance.fillColor}
          stroke={appearance.strokeColor}
          strokeWidth={appearance.strokeWidth}
        />
      </Svg>
      <View style={styles.iconWrap(args)}>
        <Icon
          name={appearance.iconName}
          size={appearance.iconSize}
          color={appearance.iconColor}
          strokeWidth={appearance.iconStrokeWidth}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  box: (args: { category: MapPinCategory; selected: boolean; variant: MapPinVariant }) => {
    const appearance = resolveMapPinAppearance(theme, args);
    return {
      width: appearance.size,
      height: Math.round(appearance.size * VIEWBOX_ASPECT_RATIO),
      alignItems: "center",
      boxShadow: appearance.boxShadow,
    };
  },
  iconWrap: (args: { category: MapPinCategory; selected: boolean; variant: MapPinVariant }) => {
    const appearance = resolveMapPinAppearance(theme, args);
    return {
      position: "absolute",
      top: appearance.size * 0.18,
    };
  },
}));
