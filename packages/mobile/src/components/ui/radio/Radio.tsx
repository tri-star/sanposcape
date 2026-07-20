import { Pressable, Text, View } from "react-native";
import { useUnistyles, StyleSheet } from "react-native-unistyles";

import { resolveRadioAppearance } from "@/components/ui/radio/radioStyles";

export type RadioProps = {
  selected: boolean;
  onSelect: () => void;
  label?: string;
  disabled?: boolean;
  testID?: string;
};

/** ラジオグループの排他選択管理はここでは扱わない。呼び出し側(feature)の責務 */
export function Radio({ selected, onSelect, label, disabled = false, testID }: RadioProps) {
  // `useUnistyles()` は hitSlop の計算にのみ使う。見た目は StyleSheet.create 側で解決する。
  const { theme } = useUnistyles();
  const args = { selected, disabled };
  const appearance = resolveRadioAppearance(theme, args);

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onSelect}
      testID={testID}
      hitSlop={
        appearance.hitSlop > 0
          ? {
              top: appearance.hitSlop,
              bottom: appearance.hitSlop,
              left: appearance.hitSlop,
              right: appearance.hitSlop,
            }
          : undefined
      }
      style={styles.row(args)}
    >
      <View style={styles.box(args)}>
        {appearance.showDot ? <View style={styles.dot(args)} /> : null}
      </View>
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: (args: { selected: boolean; disabled: boolean }) => {
    const appearance = resolveRadioAppearance(theme, args);
    return {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing[8],
      opacity: appearance.opacity,
    };
  },
  box: (args: { selected: boolean; disabled: boolean }) => {
    const appearance = resolveRadioAppearance(theme, args);
    return {
      width: appearance.boxSize,
      height: appearance.boxSize,
      borderRadius: theme.radius.pill,
      borderWidth: appearance.borderWidth,
      borderColor: appearance.borderColor,
      alignItems: "center",
      justifyContent: "center",
    };
  },
  dot: (args: { selected: boolean; disabled: boolean }) => {
    const appearance = resolveRadioAppearance(theme, args);
    return {
      width: appearance.dotSize,
      height: appearance.dotSize,
      borderRadius: theme.radius.pill,
      backgroundColor: appearance.dotColor,
    };
  },
  label: {
    color: theme.colors.text,
    fontFamily: theme.fontFamily.body,
    ...theme.typography.body,
  },
}));
