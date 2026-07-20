import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useUnistyles } from "react-native-unistyles";

import { BottomSheet } from "@/components/ui/bottom-sheet/BottomSheet";
import { Icon } from "@/components/ui/icon/Icon";
import type { IconName } from "@/components/ui/icon/iconRegistry";
import {
  resolveSelectAppearance,
  resolveSelectDisplayLabel,
} from "@/components/ui/select/selectStyles";

export type SelectOption<T extends string> = {
  value: T;
  label: string;
  iconName?: IconName;
  disabled?: boolean;
};

export type SelectProps<T extends string> = {
  value: T | null;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  testID?: string;
};

const DEFAULT_PLACEHOLDER = "選択してください";

/** Web の dropdown は不採用。BottomSheet の上に選択リストを載せる(モバイル向けの作り替え) */
export function Select<T extends string>({
  value,
  options,
  onChange,
  label,
  placeholder = DEFAULT_PLACEHOLDER,
  disabled = false,
  testID,
}: SelectProps<T>) {
  const { theme } = useUnistyles();
  const [open, setOpen] = useState(false);
  const appearance = resolveSelectAppearance(theme, { disabled });
  const displayLabel = resolveSelectDisplayLabel(value, options, placeholder);

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
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label ?? displayLabel}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        testID={testID ? `${testID}-trigger` : undefined}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: theme.spacing[8],
          minHeight: theme.sizing.controlMd,
          paddingHorizontal: theme.spacing[16],
          borderRadius: theme.radius.md,
          borderWidth: theme.sizing.hairline,
          borderColor: appearance.borderColor,
          backgroundColor: appearance.backgroundColor,
          opacity: appearance.opacity,
          transform: [{ scale: pressed && !disabled ? 0.99 : 1 }],
        })}
      >
        <Text
          numberOfLines={1}
          style={{
            flex: 1,
            color: value === null ? appearance.placeholderColor : appearance.textColor,
            fontFamily: theme.fontFamily.body,
            ...theme.typography.body,
          }}
        >
          {displayLabel}
        </Text>
        <Icon name="chevron-down" size={18} color={appearance.iconColor} />
      </Pressable>

      <BottomSheet
        visible={open}
        onClose={() => setOpen(false)}
        title={label ?? placeholder}
        testID={testID ? `${testID}-sheet` : undefined}
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled: option.disabled }}
              disabled={option.disabled}
              onPress={() => {
                onChange(option.value);
                setOpen(false);
              }}
              testID={testID ? `${testID}-option-${option.value}` : undefined}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: theme.spacing[12],
                paddingVertical: theme.spacing[12],
                opacity: option.disabled ? 0.4 : 1,
              }}
            >
              {option.iconName ? (
                <Icon name={option.iconName} size={18} color={theme.colors.text} />
              ) : null}
              <Text
                style={{
                  flex: 1,
                  color: theme.colors.text,
                  fontFamily: theme.fontFamily.body,
                  ...theme.typography.body,
                }}
              >
                {option.label}
              </Text>
              {selected ? <Icon name="check" size={18} color={theme.colors.primary} /> : null}
            </Pressable>
          );
        })}
      </BottomSheet>
    </View>
  );
}
