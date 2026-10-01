import { Text } from "react-native";

import { Card } from "@/components/ui/card/Card";
import { Tabs } from "@/components/ui/tabs/Tabs";
import {
  APPEARANCE_SECTION_TITLE,
  THEME_MODE_DESCRIPTION,
  THEME_MODE_FIELD_LABEL,
  THEME_MODE_OPTIONS,
} from "@/features/settings/lib/themeModeOptions";
import { makeStyles } from "@/theme/makeStyles";
import type { ThemeMode } from "@/theme/tokens";

export type AppearanceSectionProps = {
  mode: ThemeMode;
  /** 必須（押せて何も起きないコントロールを作らない）。 */
  onChangeMode: (mode: ThemeMode) => void;
  testID?: string;
};

/** 設定画面の「表示」カード。表示だけを担い、状態は持たない。 */
export function AppearanceSection({ mode, onChangeMode, testID }: AppearanceSectionProps) {
  const styles = useStyles();

  return (
    <Card testID={testID} style={styles.card}>
      <Text accessibilityRole="header" style={styles.title}>
        {APPEARANCE_SECTION_TITLE}
      </Text>
      <Text style={styles.fieldLabel}>{THEME_MODE_FIELD_LABEL}</Text>
      <Tabs
        items={THEME_MODE_OPTIONS}
        value={mode}
        onChange={onChangeMode}
        testID="settings-theme-mode"
        itemTestIDPrefix="settings-theme-mode"
        accessibilityLabel={THEME_MODE_FIELD_LABEL}
      />
      <Text style={styles.description}>{THEME_MODE_DESCRIPTION}</Text>
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
  fieldLabel: {
    fontSize: theme.typography.size.sm,
    color: theme.colors.textSecondary,
  },
  description: {
    fontSize: theme.typography.size.sm,
    color: theme.colors.textSecondary,
  },
}));
