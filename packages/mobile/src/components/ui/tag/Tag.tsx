import { Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import { Icon } from "@/components/ui/icon/Icon";
import type { IconName } from "@/components/ui/icon/iconRegistry";
import {
  resolveTagAppearance,
  TAG_HIT_SLOP,
  type TagCategory,
} from "@/components/ui/tag/tagStyles";
import { resolveHitSlop } from "@/lib/resolveHitSlop";

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

/** 削除ボタン(× アイコン単体、14px)の実タップ領域を44pxまで補う(C-1) */
const REMOVE_HIT_SLOP = resolveHitSlop(14);

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
  const iconColor = styles.icon(args).color;

  const children = (
    <>
      {iconName ? <Icon name={iconName} size={14} color={iconColor} /> : null}
      <Text style={labelStyle}>{label}</Text>
      {onRemove ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label} を削除`}
          onPress={onRemove}
          hitSlop={{
            top: REMOVE_HIT_SLOP,
            bottom: REMOVE_HIT_SLOP,
            left: REMOVE_HIT_SLOP,
            right: REMOVE_HIT_SLOP,
          }}
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
        hitSlop={{
          top: TAG_HIT_SLOP,
          bottom: TAG_HIT_SLOP,
          left: TAG_HIT_SLOP,
          right: TAG_HIT_SLOP,
        }}
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
      // DS: アイコンとの間隔 6、パディング 8px 14px(design/components/DS-COMPONENT-SPECS.md)。
      // spacing スケールに乗らないためリテラル値で持つ。
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: theme.spacing[8],
      borderRadius: theme.radius.pill,
      backgroundColor: appearance.backgroundColor,
      borderWidth: appearance.borderWidth,
      borderColor: appearance.borderColor,
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
  // ネイティブ style ではなく Icon の color prop を得るためのエントリ(color は有効な TextStyle キー)
  icon: (args: { category?: TagCategory; selected: boolean }) => {
    const appearance = resolveTagAppearance(theme, args);
    return { color: appearance.iconColor };
  },
}));
