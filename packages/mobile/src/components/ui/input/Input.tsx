import { useState } from "react";
import { Text, TextInput, View, type TextInputProps } from "react-native";
import { useUnistyles, StyleSheet } from "react-native-unistyles";

import { Icon } from "@/components/ui/icon/Icon";
import type { IconName } from "@/components/ui/icon/iconRegistry";
import { resolveInputAppearance } from "@/components/ui/input/inputStyles";

export type InputProps = {
  value: string;
  onChangeText: (text: string) => void;
  label?: string;
  placeholder?: string;
  /** 指定時は枠と補助テキストが danger 色になる。helperText と同時指定時は errorMessage を優先表示する */
  errorMessage?: string;
  helperText?: string;
  disabled?: boolean;
  multiline?: boolean;
  /** 左に置くアイコン(検索など) */
  iconName?: IconName;
  keyboardType?: TextInputProps["keyboardType"];
  secureTextEntry?: boolean;
  testID?: string;
};

export function Input({
  value,
  onChangeText,
  label,
  placeholder,
  errorMessage,
  helperText,
  disabled = false,
  multiline = false,
  iconName,
  keyboardType,
  secureTextEntry,
  testID,
}: InputProps) {
  // `useUnistyles()` は Icon の `color` prop / `placeholderTextColor`(いずれもネイティブ `style`
  // ではなくコンポーネント props)を得るためだけに使う。枠線・背景等の見た目は StyleSheet.create 側で解決する。
  const { theme } = useUnistyles();
  const [focused, setFocused] = useState(false);
  const hasError = errorMessage !== undefined;
  const args = { focused, disabled, hasError };
  const appearance = resolveInputAppearance(theme, args);
  const helperDisplayText = errorMessage ?? helperText;

  return (
    <View testID={testID}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.field({ ...args, multiline })}>
        {iconName ? (
          <Icon
            name={iconName}
            size={18}
            color={appearance.iconColor}
            testID={testID ? `${testID}-icon` : undefined}
          />
        ) : null}
        <TextInput
          accessibilityLabel={label}
          accessibilityState={{ disabled }}
          accessibilityHint={errorMessage}
          editable={!disabled}
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          placeholderTextColor={appearance.placeholderColor}
          multiline={multiline}
          keyboardType={keyboardType}
          secureTextEntry={secureTextEntry}
          testID={testID ? `${testID}-field` : undefined}
          style={styles.textInput(args)}
        />
      </View>
      {helperDisplayText ? <Text style={styles.helper(args)}>{helperDisplayText}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  label: {
    color: theme.colors.textMuted,
    marginBottom: theme.spacing[4],
    fontFamily: theme.fontFamily.label,
    ...theme.typography.label,
  },
  field: (args: { focused: boolean; disabled: boolean; hasError: boolean; multiline: boolean }) => {
    const appearance = resolveInputAppearance(theme, args);
    return {
      flexDirection: "row",
      alignItems: args.multiline ? "flex-start" : "center",
      gap: theme.spacing[8],
      borderColor: appearance.borderColor,
      borderWidth: appearance.borderWidth,
      borderRadius: theme.radius.md,
      backgroundColor: appearance.backgroundColor,
      paddingHorizontal: theme.spacing[16],
      opacity: appearance.opacity,
      minHeight: theme.sizing.controlMd,
    };
  },
  textInput: (args: { focused: boolean; disabled: boolean; hasError: boolean }) => {
    const appearance = resolveInputAppearance(theme, args);
    return {
      flex: 1,
      color: appearance.textColor,
      fontFamily: theme.fontFamily.body,
      paddingVertical: theme.spacing[12],
      ...theme.typography.body,
    };
  },
  helper: (args: { focused: boolean; disabled: boolean; hasError: boolean }) => {
    const appearance = resolveInputAppearance(theme, args);
    return {
      color: appearance.helperColor,
      marginTop: theme.spacing[4],
      fontFamily: theme.fontFamily.body,
      ...theme.typography.caption,
    };
  },
}));
