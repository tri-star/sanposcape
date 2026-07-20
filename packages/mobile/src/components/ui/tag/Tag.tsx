import { Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

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
  const args = { category, selected };
  const rowStyle = styles.root(args);
  const labelStyle = styles.label(args);

  const children = (
    <>
      {iconName ? <Icon name={iconName} size={14} color={labelStyle.color} /> : null}
      <Text style={labelStyle}>{label}</Text>
      {onRemove ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label} を削除`}
          onPress={onRemove}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          testID={testID ? `${testID}-remove` : undefined}
        >
          <Icon name="x" size={14} color={labelStyle.color} />
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

const styles = StyleSheet.create((theme) => ({
  root: (args: { category?: TagCategory; selected: boolean }) => {
    const appearance = resolveTagAppearance(theme, args);
    return {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing[4],
      paddingHorizontal: theme.spacing[12],
      paddingVertical: theme.spacing[4],
      borderRadius: theme.radius.pill,
      backgroundColor: appearance.backgroundColor,
    };
  },
  label: (args: { category?: TagCategory; selected: boolean }) => {
    const appearance = resolveTagAppearance(theme, args);
    return {
      color: appearance.textColor,
      fontFamily: theme.fontFamily.label,
      ...theme.typography.label,
    };
  },
}));
