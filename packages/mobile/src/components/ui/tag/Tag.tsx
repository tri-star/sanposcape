import { Pressable, Text, View } from "react-native";
import { useUnistyles } from "react-native-unistyles";

import { Icon } from "@/components/ui/icon/Icon";
import type { IconName } from "@/components/ui/icon/iconRegistry";
import { resolveTagAppearance, type TagCategory } from "@/components/ui/tag/tagStyles";

export type TagProps = {
  label: string;
  /** 地図ピンと同じカテゴリ色体系。未指定は neutral */
  category?: TagCategory;
  iconName?: IconName;
  selected?: boolean;
  onPress?: () => void;
  onRemove?: () => void;
  testID?: string;
};

export function Tag({
  label,
  category,
  iconName,
  selected = false,
  onPress,
  onRemove,
  testID,
}: TagProps) {
  const { theme } = useUnistyles();
  const appearance = resolveTagAppearance(theme, { category, selected });

  const rowStyle = {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: theme.spacing[4],
    paddingHorizontal: theme.spacing[12],
    paddingVertical: theme.spacing[4],
    borderRadius: theme.radius.pill,
    backgroundColor: appearance.backgroundColor,
  };

  const children = (
    <>
      {iconName ? <Icon name={iconName} size={14} color={appearance.textColor} /> : null}
      <Text
        style={{
          color: appearance.textColor,
          fontFamily: theme.fontFamily.label,
          ...theme.typography.label,
        }}
      >
        {label}
      </Text>
      {onRemove ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label} を削除`}
          onPress={onRemove}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          testID={testID ? `${testID}-remove` : undefined}
        >
          <Icon name="x" size={14} color={appearance.textColor} />
        </Pressable>
      ) : null}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected }}
        onPress={onPress}
        testID={testID}
        style={rowStyle}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <View testID={testID} style={rowStyle}>
      {children}
    </View>
  );
}
