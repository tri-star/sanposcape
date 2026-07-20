import { Pressable, Text, View } from "react-native";
import { useUnistyles } from "react-native-unistyles";

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
  const { theme } = useUnistyles();
  const appearance = resolveRadioAppearance(theme, { selected, disabled });

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
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: theme.spacing[8],
        opacity: appearance.opacity,
      }}
    >
      <View
        style={{
          width: appearance.boxSize,
          height: appearance.boxSize,
          borderRadius: theme.radius.pill,
          borderWidth: appearance.borderWidth,
          borderColor: appearance.borderColor,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {appearance.showDot ? (
          <View
            style={{
              width: appearance.dotSize,
              height: appearance.dotSize,
              borderRadius: theme.radius.pill,
              backgroundColor: appearance.dotColor,
            }}
          />
        ) : null}
      </View>
      {label ? (
        <Text
          style={{
            color: theme.colors.text,
            fontFamily: theme.fontFamily.body,
            ...theme.typography.body,
          }}
        >
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
}
