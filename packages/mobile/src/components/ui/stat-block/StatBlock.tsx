import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

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
  const args = { size, align };

  return (
    <View testID={testID} style={styles.container(args)}>
      <View style={styles.row}>
        <Text style={styles.value(args)}>{value}</Text>
        {unit ? <Text style={styles.unit(args)}>{unit}</Text> : null}
      </View>
      {label ? <Text style={styles.label(args)}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: (args: { size: StatBlockSize; align: StatBlockAlign }) => {
    const appearance = resolveStatBlockAppearance(theme, args);
    return { alignItems: appearance.alignItems };
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: theme.spacing[4],
  },
  value: (args: { size: StatBlockSize; align: StatBlockAlign }) => {
    const appearance = resolveStatBlockAppearance(theme, args);
    return {
      color: theme.colors.text,
      fontFamily: theme.fontFamily.data,
      textAlign: appearance.textAlign,
      ...appearance.valueTextStyle,
    };
  },
  unit: (args: { size: StatBlockSize; align: StatBlockAlign }) => {
    const appearance = resolveStatBlockAppearance(theme, args);
    // DS: 単位は font-data(数値本体と同じファミリー)。以前は font-body を使っていた
    return {
      color: theme.colors.textMuted,
      fontFamily: theme.fontFamily.data,
      ...appearance.unitTextStyle,
    };
  },
  label: (args: { size: StatBlockSize; align: StatBlockAlign }) => {
    const appearance = resolveStatBlockAppearance(theme, args);
    return {
      color: theme.colors.textTertiary,
      fontFamily: theme.fontFamily.body,
      textAlign: appearance.textAlign,
      ...appearance.labelTextStyle,
    };
  },
}));
