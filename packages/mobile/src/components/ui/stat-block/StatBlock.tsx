import { Text, View } from "react-native";
import { useUnistyles } from "react-native-unistyles";

import {
  resolveStatBlockAppearance,
  type StatBlockAlign,
  type StatBlockSize,
} from "@/components/ui/stat-block/statBlockStyles";

export type StatBlockProps = {
  /** 表示済みの文字列。整形(桁区切り・小数丸め等)は呼び出し側(src/lib)の責務 */
  value: string;
  unit?: string;
  label?: string;
  size?: StatBlockSize;
  align?: StatBlockAlign;
  testID?: string;
};

export function StatBlock({
  value,
  unit,
  label,
  size = "md",
  align = "left",
  testID,
}: StatBlockProps) {
  const { theme } = useUnistyles();
  const appearance = resolveStatBlockAppearance(theme, { size, align });

  return (
    <View testID={testID} style={{ alignItems: appearance.alignItems }}>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: theme.spacing[4] }}>
        <Text
          style={{
            color: theme.colors.text,
            fontFamily: theme.fontFamily.data,
            textAlign: appearance.textAlign,
            ...appearance.valueTextStyle,
          }}
        >
          {value}
        </Text>
        {unit ? (
          <Text
            style={{
              color: theme.colors.textMuted,
              fontFamily: theme.fontFamily.body,
              ...appearance.unitTextStyle,
            }}
          >
            {unit}
          </Text>
        ) : null}
      </View>
      {label ? (
        <Text
          style={{
            color: theme.colors.textTertiary,
            fontFamily: theme.fontFamily.body,
            textAlign: appearance.textAlign,
            ...appearance.labelTextStyle,
          }}
        >
          {label}
        </Text>
      ) : null}
    </View>
  );
}
