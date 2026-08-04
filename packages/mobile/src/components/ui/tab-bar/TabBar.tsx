import { Pressable, type StyleProp, Text, View, type ViewStyle } from "react-native";

import { Icon, type IconName } from "@/components/ui/icon/Icon";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

export type TabBarItem<T extends string = string> = {
  label: string;
  value: T;
  icon: IconName;
};

export type TabBarProps<T extends string = string> = {
  items: readonly TabBarItem<T>[];
  value: T;
  /**
   * 必須。省略できると「切り替えられるように見えて何も起きない」タブを作れてしまうため。
   */
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  /**
   * 各タブ項目に付与する testID の接頭辞。指定すると `${itemTestIDPrefix}-${item.value}` になる。
   * 共有プリミティブに固定 testID を埋め込まず、呼び出し側から注入する形にしている
   * （複数箇所から使われたときに testID が重複しないようにするため）。
   */
  itemTestIDPrefix?: string;
};

/**
 * TabBar — 画面下部のメインナビゲーション。選択中の項目はアイコンが円形に塗られる。
 * デザイン: Sanpo Design System / components/navigation/TabBar
 */
export function TabBar<T extends string = string>({
  items,
  value,
  onChange,
  style,
  testID,
  itemTestIDPrefix,
}: TabBarProps<T>) {
  const theme = useTheme();
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
            accessibilityLabel={item.label}
            onPress={() => onChange(item.value)}
            style={styles.item}
            testID={itemTestIDPrefix ? `${itemTestIDPrefix}-${item.value}` : undefined}
          >
            <View style={[styles.iconCircle, active ? styles.iconCircleActive : null]}>
              <Icon
                name={item.icon}
                size={20}
                color={active ? theme.colors.onPrimary : theme.colors.textTertiary}
              />
            </View>
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
    alignItems: "center",
    justifyContent: "space-around",
    height: theme.layout.tabBarHeight,
    backgroundColor: theme.colors.surfaceCard,
    borderTopWidth: theme.layout.hairline,
    borderTopColor: theme.colors.borderSubtle,
    ...theme.shadows.sheet,
  },
  item: {
    flex: 1,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[1],
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  iconCircleActive: {
    backgroundColor: theme.colors.primary,
  },
  label: {
    fontSize: theme.typography.size["2xs"],
    fontWeight: theme.typography.weight.bold,
    color: theme.colors.textTertiary,
  },
  labelActive: {
    color: theme.colors.primary,
  },
}));
