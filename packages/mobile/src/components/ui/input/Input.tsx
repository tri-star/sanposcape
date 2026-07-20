import { useState } from "react";
import { Text, TextInput, View, type TextInputProps } from "react-native";
import { useUnistyles } from "react-native-unistyles";

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
  const { theme } = useUnistyles();
  const [focused, setFocused] = useState(false);
  const hasError = errorMessage !== undefined;
  const appearance = resolveInputAppearance(theme, { focused, disabled, hasError });
  const helperDisplayText = errorMessage ?? helperText;

  return (
    <View testID={testID}>
      {label ? (
        <Text
          style={{
            color: theme.colors.textMuted,
            marginBottom: theme.spacing[4],
            fontFamily: theme.fontFamily.label,
            ...theme.typography.label,
          }}
        >
          {label}
        </Text>
      ) : null}
      <View
        style={{
          flexDirection: "row",
          alignItems: multiline ? "flex-start" : "center",
          gap: theme.spacing[8],
          borderColor: appearance.borderColor,
          borderWidth: appearance.borderWidth,
          borderRadius: theme.radius.md,
          backgroundColor: appearance.backgroundColor,
          paddingHorizontal: theme.spacing[16],
          opacity: appearance.opacity,
          minHeight: theme.sizing.controlMd,
        }}
      >
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
          style={{
            flex: 1,
            color: appearance.textColor,
            fontFamily: theme.fontFamily.body,
            paddingVertical: theme.spacing[12],
            ...theme.typography.body,
          }}
        />
      </View>
      {helperDisplayText ? (
        <Text
          style={{
            color: appearance.helperColor,
            marginTop: theme.spacing[4],
            fontFamily: theme.fontFamily.body,
            ...theme.typography.caption,
          }}
        >
          {helperDisplayText}
        </Text>
      ) : null}
    </View>
  );
}
