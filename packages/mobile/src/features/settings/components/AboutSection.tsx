import { Text } from "react-native";

import { PrivacyPolicyLink } from "@/components/legal/PrivacyPolicyLink";
import { Card } from "@/components/ui/card/Card";
import { makeStyles } from "@/theme/makeStyles";

export type AboutSectionProps = { testID?: string };

const ABOUT_SECTION_TITLE = "このアプリについて";
// 本文の中身（保存期間・第三者提供など）に踏み込む約束は書かない。正本は LP のポリシー本文（SS-158）。
const ABOUT_SECTION_DESCRIPTION = "位置情報など、アプリが扱う情報の取り扱いを説明しています。";

/** 設定画面の「このアプリについて」カード。表示だけを担い、状態は持たない。 */
export function AboutSection({ testID }: AboutSectionProps) {
  const styles = useStyles();

  return (
    <Card testID={testID} style={styles.card}>
      <Text accessibilityRole="header" style={styles.title}>
        {ABOUT_SECTION_TITLE}
      </Text>
      <Text style={styles.description}>{ABOUT_SECTION_DESCRIPTION}</Text>
      <PrivacyPolicyLink testID="settings-privacy-policy-link" />
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
}));
