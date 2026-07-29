import { Pressable, Text, View } from "react-native";

import { BottomSheet } from "@/components/ui/bottom-sheet/BottomSheet";
import { Button } from "@/components/ui/button/Button";
import { Checkbox } from "@/components/ui/checkbox/Checkbox";
import { Icon } from "@/components/ui/icon/Icon";
import { CATEGORY_META, CATEGORY_ORDER } from "@/features/walk/data/categories";
import type { ExploreCategory } from "@/features/walk/types";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";
import { withAlpha } from "@/theme/withAlpha";

export type CategorySheetProps = {
  open: boolean;
  /** 破棄して閉じる。 */
  onClose: () => void;
  activeCategories: readonly ExploreCategory[];
  onToggle: (category: ExploreCategory) => void;
  /** draft を確定して閉じる（＝再探索）。0件のときは呼ばれない（ボタンを disabled にする）。 */
  onApply: () => void;
  doneLabel: string;
};

/**
 * CategorySheet — 「表示するスポット」絞り込み BottomSheet。
 * デザイン: mock の CATEGORY BOTTOM SHEET。
 */
export function CategorySheet({
  open,
  onClose,
  activeCategories,
  onToggle,
  onApply,
  doneLabel,
}: CategorySheetProps) {
  const theme = useTheme();
  const styles = useStyles();
  const canApply = activeCategories.length > 0;

  return (
    <BottomSheet open={open} title="表示するスポット" onClose={onClose} testID="category-sheet">
      <View style={styles.list}>
        {CATEGORY_ORDER.map((category) => {
          const meta = CATEGORY_META[category];
          const color = theme.map[meta.mapColorKey];
          const checked = activeCategories.includes(category);
          return (
            <Pressable
              key={category}
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              accessibilityLabel={meta.label}
              onPress={() => onToggle(category)}
              style={styles.row}
              testID={`category-row-${category}`}
            >
              <View style={[styles.tint, { backgroundColor: withAlpha(color, 0.16) }]}>
                <Icon name={meta.icon} size={18} color={color} />
              </View>
              <Text style={styles.label}>{meta.label}</Text>
              {/*
                行全体（外側の Pressable）がタップとa11y（role="checkbox"）を担うため、
                内側の Checkbox は表示専用にする。
                - pointerEvents="none": タッチ判定を無効化（二重にタッチを奪い合う事故を防ぐ）。
                - accessibilityElementsHidden / importantForAccessibility: a11yツリーからも隠す
                  （付けないと VoiceOver/TalkBack が行と Checkbox を二重に読み上げてしまう）。
              */}
              <View
                pointerEvents="none"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                <Checkbox checked={checked} onChange={() => onToggle(category)} />
              </View>
            </Pressable>
          );
        })}
      </View>
      {canApply ? null : <Text style={styles.note}>1つ以上選んでください</Text>}
      <Button fullWidth onPress={onApply} disabled={!canApply} testID="category-sheet-done">
        {doneLabel}
      </Button>
    </BottomSheet>
  );
}

const useStyles = makeStyles((theme) => ({
  list: {
    gap: 2,
    paddingBottom: theme.spacing[2],
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    width: "100%",
    paddingVertical: theme.spacing[3],
  },
  tint: {
    width: 34,
    height: 34,
    borderRadius: theme.radius.sm + 1,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    flex: 1,
    fontSize: theme.typography.size.md,
    fontWeight: theme.typography.weight.bold,
    color: theme.colors.textPrimary,
  },
  note: {
    marginBottom: theme.spacing[2],
    fontSize: theme.typography.size.xs,
    color: theme.colors.textTertiary,
  },
}));
