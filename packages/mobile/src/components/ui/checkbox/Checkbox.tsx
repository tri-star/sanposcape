import { Pressable, type StyleProp, Text, View, type ViewStyle } from "react-native";

import { Icon } from "@/components/ui/icon/Icon";
import { hitSlopFor } from "@/lib/hitSlop";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

/** チェックボックスの見た目の一辺。タップ領域は hitSlop で 44px まで広げる。 */
const BOX_SIZE = 22;

export type CheckboxProps = {
  checked?: boolean;
  /**
   * 必須。省略できると「切り替えられるように見えて状態が変わらない」チェックボックスを
   * 作れてしまうため。読み取り専用にしたい場合は `disabled` を明示する。
   */
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  /** label を省略する場合に指定する。スクリーンリーダー用。 */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Checkbox — 角丸四角のチェックコントロール。ON のときブランドブルーで塗る。
 * デザイン: Sanpo Design System / components/forms/Checkbox
 */
export function Checkbox({
  checked = false,
  onChange,
  label,
  disabled = false,
  accessibilityLabel,
  style,
  testID,
}: CheckboxProps) {
  const theme = useTheme();
  const styles = useStyles();

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={() => onChange(!checked)}
      testID={testID}
      hitSlop={hitSlopFor(BOX_SIZE)}
      style={[styles.root, disabled ? styles.disabled : null, style]}
    >
      <View style={[styles.box, checked ? styles.boxChecked : styles.boxUnchecked]}>
        {checked ? (
          <Icon name="check" size={14} color={theme.colors.onPrimary} strokeWidth={3} />
        ) : null}
      </View>
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </Pressable>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    flexDirection: "row",
    alignSelf: "flex-start",
    alignItems: "center",
    gap: theme.spacing[3] - 2,
  },
  disabled: {
    opacity: 0.5,
  },
  box: {
    width: BOX_SIZE,
    height: BOX_SIZE,
    borderRadius: theme.radius.xs,
    alignItems: "center",
    justifyContent: "center",
  },
  boxChecked: {
    backgroundColor: theme.colors.primary,
  },
  boxUnchecked: {
    backgroundColor: theme.colors.surfaceCard,
    borderWidth: 1.5,
    borderColor: theme.colors.borderStrong,
  },
  label: {
    fontSize: theme.typography.size.md,
    color: theme.colors.textPrimary,
  },
}));
