import { StyleSheet } from "react-native-unistyles";

import { ICON_REGISTRY, type IconName } from "@/components/ui/icon/iconRegistry";

export type IconProps = {
  name: IconName;
  /** 既定は 20。DS の size スケールに合わせる */
  size?: number;
  /** 既定は theme.colors.text */
  color?: string;
  strokeWidth?: number;
  testID?: string;
};

/**
 * `lucide-react-native` の単一入口。
 * アプリ内のどこからも `lucide-react-native` を直接 import せず、必ずこのコンポーネント経由で使う。
 *
 * 既定色は `StyleSheet.create` の静的エントリ(`color` は有効な `TextStyle` キーのため
 * 型的に安全)から読み取る。`useUnistyles()` は使わない(このコンポーネントは `style` を持たず、
 * テーマから引く値は既定色1つだけのため)。
 */
export function Icon({ name, size = 20, color, strokeWidth, testID }: IconProps) {
  const LucideIconComponent = ICON_REGISTRY[name];
  return (
    <LucideIconComponent
      size={size}
      color={color ?? styles.defaultColor.color}
      strokeWidth={strokeWidth}
      testID={testID}
    />
  );
}

const styles = StyleSheet.create((theme) => ({
  defaultColor: { color: theme.colors.text },
}));
