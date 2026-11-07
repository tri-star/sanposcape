import { Text, View } from "react-native";

import { Button } from "@/components/ui/button/Button";
import { Card } from "@/components/ui/card/Card";
import { DISPLAY_NAME_UNSET_LABEL } from "@/features/settings/lib/displayName";
import { makeStyles } from "@/theme/makeStyles";

export type DisplayNameSectionProps = {
  /** いまの表示名（未設定は null）。読むのは呼び出し側（認証セッションのストア）。 */
  displayName: string | null;
  /** 「変更」を押したとき（変更のダイアログを開く）。 */
  onEdit: () => void;
  testID?: string;
};

const DISPLAY_NAME_SECTION_TITLE = "表示名";
const DISPLAY_NAME_SECTION_DESCRIPTION = "地図を共有したメンバーや、招待した相手に表示されます。";

/** 設定画面の「表示名」カード（SS-268）。表示だけを担い、状態は持たない。 */
export function DisplayNameSection({ displayName, onEdit, testID }: DisplayNameSectionProps) {
  const styles = useStyles();
  return (
    <Card testID={testID} style={styles.card}>
      <Text accessibilityRole="header" style={styles.title}>
        {DISPLAY_NAME_SECTION_TITLE}
      </Text>
      <Text style={styles.description}>{DISPLAY_NAME_SECTION_DESCRIPTION}</Text>
      <View style={styles.row}>
        <Text
          style={[styles.value, displayName === null && styles.valueUnset]}
          numberOfLines={2}
          testID="settings-display-name-value"
        >
          {displayName ?? DISPLAY_NAME_UNSET_LABEL}
        </Text>
        <Button variant="outline" size="sm" onPress={onEdit} testID="settings-display-name-edit">
          変更
        </Button>
      </View>
    </Card>
  );
}

const useStyles = makeStyles((theme) => ({
  card: {
    gap: theme.spacing[2],
  },
  title: {
    fontSize: theme.typography.size.md,
    fontWeight: theme.typography.weight.bold,
    color: theme.colors.textPrimary,
  },
  description: {
    fontSize: theme.typography.size.sm,
    color: theme.colors.textSecondary,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
  },
  value: {
    flex: 1,
    fontSize: theme.typography.size.md,
    color: theme.colors.textPrimary,
  },
  valueUnset: {
    color: theme.colors.textSecondary,
  },
}));
