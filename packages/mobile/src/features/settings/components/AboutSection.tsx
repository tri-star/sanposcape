import { Pressable, Text, View } from "react-native";

import { PrivacyPolicyLink } from "@/components/legal/PrivacyPolicyLink";
import { TermsLink } from "@/components/legal/TermsLink";
import { Card } from "@/components/ui/card/Card";
import { Icon } from "@/components/ui/icon/Icon";
import {
  APP_VERSION_LABEL,
  type AppVersionInfo,
  formatAppVersion,
} from "@/features/settings/lib/appVersionLabel";
import { MIN_TOUCH_TARGET } from "@/lib/hitSlop";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

export type AboutSectionProps = {
  /** 実行中のアプリのバージョンとビルドの情報。読むのは呼び出し側（SS-228、SS-230）。 */
  appVersion: AppVersionInfo;
  /** 「ライセンス」の行を押したとき（アプリ内の `/licenses` へ進む。SS-191）。 */
  onOpenLicenses: () => void;
  testID?: string;
};

const ABOUT_SECTION_TITLE = "このアプリについて";
// 本文の中身（保存期間・第三者提供など）に踏み込む約束は書かない。正本は LP のポリシー本文（SS-158）。
const LICENSES_LABEL = "ライセンス";
const ABOUT_SECTION_DESCRIPTION =
  "アプリの利用条件と、位置情報など、アプリが扱う情報の取り扱いを説明しています。";

/** 設定画面の「このアプリについて」カード。表示だけを担い、状態は持たない。 */
export function AboutSection({ appVersion, onOpenLicenses, testID }: AboutSectionProps) {
  const theme = useTheme();
  const styles = useStyles();

  return (
    <Card testID={testID} style={styles.card}>
      <Text accessibilityRole="header" style={styles.title}>
        {ABOUT_SECTION_TITLE}
      </Text>
      <Text style={styles.description}>{ABOUT_SECTION_DESCRIPTION}</Text>
      <TermsLink testID="settings-terms-link" />
      <PrivacyPolicyLink testID="settings-privacy-policy-link" />
      {/* アプリ内の画面へ進むので、外部リンク（下線 + 外部アイコン）とは見た目を分ける。 */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={LICENSES_LABEL}
        onPress={onOpenLicenses}
        testID="settings-licenses-link"
        style={({ pressed }) => [
          styles.row,
          pressed && styles.rowPressed,
          { transform: [{ scale: pressed ? 0.97 : 1 }] },
        ]}
      >
        <Text style={styles.rowLabel}>{LICENSES_LABEL}</Text>
        <Icon name="chevron-right" size={18} color={theme.colors.textSecondary} />
      </Pressable>
      <View style={styles.versionRow} testID="settings-app-version">
        <Text style={styles.versionLabel}>{APP_VERSION_LABEL}</Text>
        <Text style={styles.versionValue} selectable>
          {formatAppVersion(appVersion)}
        </Text>
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
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.radius.md,
  },
  rowPressed: {
    backgroundColor: theme.colors.surfaceSunken,
  },
  rowLabel: {
    fontSize: theme.typography.size.md,
    fontWeight: theme.typography.weight.bold,
    color: theme.colors.textPrimary,
  },
  versionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  versionLabel: {
    fontSize: theme.typography.size.sm,
    color: theme.colors.textSecondary,
  },
  versionValue: {
    // ビルド番号やチャネルを付けると長くなるので、狭い画面ではラベルを押し出さずに折り返す（SS-230）。
    flexShrink: 1,
    textAlign: "right",
    fontSize: theme.typography.size.sm,
    color: theme.colors.textPrimary,
  },
}));
