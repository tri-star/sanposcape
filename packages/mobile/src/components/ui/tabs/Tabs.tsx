import { Pressable, type StyleProp, Text, View, type ViewStyle } from "react-native";

import { makeStyles } from "@/theme/makeStyles";

export type TabItem<T extends string = string> = {
  label: string;
  value: T;
};

export type TabsProps<T extends string = string> = {
  items: readonly TabItem<T>[];
  value: T;
  onChange?: (value: T) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Tabs — 少数のビューを切り替えるセグメンテッドコントロール（例: 記録の 1週間 / 1ヶ月）。
 * デザイン: Sanpo Design System / components/navigation/Tabs
 */
export function Tabs<T extends string = string>({
  items,
  value,
  onChange,
  style,
  testID,
}: TabsProps<T>) {
  const styles = useStyles();

  return (
    <View testID={testID} accessibilityRole="tablist" style={[styles.root, style]}>
      {items.map((item) => {
        const active = item.value === value;
        return (
          <Pressable
            key={item.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange?.(item.value)}
            style={[styles.item, active ? styles.itemActive : null]}
          >
            <Text style={[styles.label, active ? styles.labelActive : null]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    flexDirection: "row",
    alignSelf: "flex-start",
    padding: theme.spacing[1],
    gap: 2,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceSunken,
  },
  item: {
    paddingVertical: theme.spacing[2],
    paddingHorizontal: 18,
    borderRadius: theme.radius.pill,
  },
  itemActive: {
    backgroundColor: theme.colors.surfaceCard,
    ...theme.shadows.sm,
  },
  label: {
    fontSize: theme.typography.size.sm,
    fontWeight: theme.typography.weight.bold,
    color: theme.colors.textSecondary,
  },
  labelActive: {
    color: theme.colors.primary,
  },
}));
