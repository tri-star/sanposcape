import { Pressable, Text, View } from "react-native";

import { Icon } from "@/components/ui/icon/Icon";
import {
  SANPO_MAP_ICON_META,
  SANPO_MAP_ICON_ORDER,
  type SanpoMapIconKey,
} from "@/features/pin/lib/sanpoMapIcon";
import { hitSlopFor } from "@/lib/hitSlop";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

export type SanpoMapIconPickerProps = {
  value: SanpoMapIconKey;
  /** 必須（押せて何も起きない状態を作らない）。 */
  onChange: (icon: SanpoMapIconKey) => void;
  disabled?: boolean;
  /** 各セルに `${testIDPrefix}-icon-${key}`、root に `${testIDPrefix}-icon-picker` を付ける。 */
  testIDPrefix: string;
};

const CELL_SIZE = 40;

/**
 * SanpoMapIconPicker — 地図のアイコンを12種類から選ぶグリッド（作成・変更ダイアログで共有。SS-171）。
 * 選択値は親が持つ（ロジックは無い）。
 */
export function SanpoMapIconPicker({
  value,
  onChange,
  disabled = false,
  testIDPrefix,
}: SanpoMapIconPickerProps) {
  const theme = useTheme();
  const styles = useStyles();

  return (
    <View style={styles.root} testID={`${testIDPrefix}-icon-picker`}>
      <Text style={styles.heading}>アイコン</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel="地図のアイコン" style={styles.grid}>
        {SANPO_MAP_ICON_ORDER.map((key) => {
          const meta = SANPO_MAP_ICON_META[key];
          const selected = key === value;
          const toneColor = theme.map[meta.tone];
          const backgroundColor = disabled
            ? theme.colors.disabledSurface
            : selected
              ? toneColor
              : theme.colors.surfaceSunken;
          const glyphColor = disabled
            ? theme.colors.textDisabled
            : selected
              ? theme.colors.onColor
              : toneColor;

          return (
            <Pressable
              key={key}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled }}
              accessibilityLabel={meta.label}
              disabled={disabled}
              hitSlop={hitSlopFor(CELL_SIZE)}
              onPress={() => onChange(key)}
              style={({ pressed }) => [
                styles.cell,
                {
                  backgroundColor,
                  borderColor: selected ? theme.colors.borderFocus : theme.colors.borderSubtle,
                  borderWidth: selected ? 2 : 1.5,
                },
                pressed && !disabled ? styles.pressed : null,
              ]}
              testID={`${testIDPrefix}-icon-${key}`}
            >
              <Icon name={meta.glyph} size={20} color={glyphColor} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    gap: theme.spacing[2],
  },
  heading: {
    fontSize: theme.typography.size.sm,
    fontWeight: theme.typography.weight.bold,
    color: theme.colors.textSecondary,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 6,
    rowGap: theme.spacing[2],
  },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    borderRadius: theme.radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    transform: [{ scale: 0.97 }],
  },
}));
