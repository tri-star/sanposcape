import { View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useUnistyles } from "react-native-unistyles";

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
 */
export function MapPin({ category, selected = false, variant = "category", testID }: MapPinProps) {
  const { theme } = useUnistyles();
  const appearance = resolveMapPinAppearance(theme, { category, selected, variant });
  const height = Math.round(appearance.size * VIEWBOX_ASPECT_RATIO);

  return (
    <View
      testID={testID}
      accessibilityRole="image"
      style={{ width: appearance.size, height, alignItems: "center" }}
    >
      <Svg width={appearance.size} height={height} viewBox="0 0 32 40">
        <Path d={PIN_PATH} fill={appearance.fillColor} />
      </Svg>
      <View style={{ position: "absolute", top: appearance.size * 0.18 }}>
        <Icon
          name={appearance.iconName}
          size={appearance.size * 0.4}
          color={appearance.iconColor}
        />
      </View>
    </View>
  );
}
