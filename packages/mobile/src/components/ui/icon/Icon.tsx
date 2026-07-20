import { useUnistyles } from "react-native-unistyles";

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
 */
export function Icon({ name, size = 20, color, strokeWidth, testID }: IconProps) {
  const { theme } = useUnistyles();
  const LucideIconComponent = ICON_REGISTRY[name];
  return (
    <LucideIconComponent
      size={size}
      color={color ?? theme.colors.text}
      strokeWidth={strokeWidth}
      testID={testID}
    />
  );
}
