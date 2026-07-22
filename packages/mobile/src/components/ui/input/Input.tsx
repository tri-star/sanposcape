import { useState } from "react";
import { type StyleProp, Text, TextInput, View, type ViewStyle } from "react-native";

import { Icon, type IconName } from "@/components/ui/icon/Icon";
import { makeStyles } from "@/theme/makeStyles";
import { lineHeight } from "@/theme/tokens";
import { useTheme } from "@/theme/useTheme";

export type InputProps = {
  label?: string;
  value?: string;
  onChangeText?: (value: string) => void;
  placeholder?: string;
  /** 補助テキスト。`error` があるとそちらが優先される。 */
  helper?: string;
  error?: string;
  icon?: IconName;
  /** label を省略する場合に指定する。スクリーンリーダー用。 */
  accessibilityLabel?: string;
  size?: "sm" | "md";
  disabled?: boolean;
  /** 複数行入力（メモ・コメント欄）。 */
  multiline?: boolean;
  /** multiline のときの最小の高さ。 */
  minHeight?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Input — ラベル・補助テキスト・先頭アイコンに対応した入力欄。
 * デザイン: Sanpo Design System / components/forms/Input
 */
export function Input({
  label,
  value,
  onChangeText,
  placeholder,
  helper,
  error,
  icon,
  accessibilityLabel,
  size = "md",
  disabled = false,
  multiline = false,
  minHeight = 96,
  style,
  testID,
}: InputProps) {
  const theme = useTheme();
  const styles = useStyles();
  const [focused, setFocused] = useState(false);

  const borderColor = error
    ? theme.colors.danger
    : focused
      ? theme.colors.borderFocus
      : theme.colors.borderSubtle;

  return (
    <View style={[styles.root, style]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View
        style={[
          styles.field,
          {
            borderColor,
            backgroundColor: disabled ? theme.colors.trackSubtle : theme.colors.surfaceCard,
          },
          multiline
            ? { minHeight, alignItems: "flex-start", paddingVertical: theme.spacing[3] }
            : { height: size === "sm" ? theme.control.sm : theme.control.md },
        ]}
      >
        {icon ? <Icon name={icon} size={18} color={theme.colors.textTertiary} /> : null}
        <TextInput
          testID={testID}
          // label は見た目のテキストでしかないため、読み上げ用に明示的に結び付ける。
          accessibilityLabel={accessibilityLabel ?? label}
          accessibilityHint={error || helper || undefined}
          accessibilityState={{ disabled }}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.textTertiary}
          editable={!disabled}
          multiline={multiline}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[styles.input, multiline ? styles.inputMultiline : null]}
        />
      </View>
      {/*
        `error` は「エラー無し」を空文字で返すバリデーションもあるため、
        表示条件と本文の判定を truthy で揃える（`??` だと空文字が helper を上書きしてしまう）。
      */}
      {error || helper ? (
        <Text style={[styles.helper, error ? styles.helperError : null]}>{error || helper}</Text>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    width: "100%",
    gap: 6,
  },
  label: {
    fontSize: theme.typography.size.sm,
    fontWeight: theme.typography.weight.medium,
    color: theme.colors.textSecondary,
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: 14,
    borderRadius: theme.radius.md,
    borderWidth: 1.5,
  },
  input: {
    flex: 1,
    padding: 0,
    fontSize: theme.typography.size.md,
    color: theme.colors.textPrimary,
  },
  inputMultiline: {
    textAlignVertical: "top",
    lineHeight: lineHeight(theme.typography.size.md, theme.typography.leading.normal),
  },
  helper: {
    fontSize: theme.typography.size.xs,
    color: theme.colors.textTertiary,
  },
  helperError: {
    color: theme.colors.danger,
  },
}));
