import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Card } from "@/components/ui/card/Card";
import { IconButton } from "@/components/ui/icon-button/IconButton";
import { THIRD_PARTY_NOTICES } from "@/features/settings/data/thirdPartyNotices";
import { useScreenBack } from "@/hooks/useScreenBack";
import { makeStyles } from "@/theme/makeStyles";

/**
 * ライセンス画面（`/licenses`。設定の「このアプリについて」から開く。SS-191）。
 * アプリに同梱した第三者の素材の著作権表示とライセンスの本文を、原文のまま載せる（ライセンスが求める同梱の手段）。
 * 認証状態によらず表示する（設定画面と同じ）。
 */
export function LicensesView() {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const back = useScreenBack({ fallbackHref: "/settings" });

  return (
    <View testID="licenses-screen" style={styles.root}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 },
        ]}
      >
        <View style={styles.header}>
          <IconButton
            icon="chevron-left"
            label="戻る"
            variant="ghost"
            onPress={back.goBack}
            testID="licenses-back"
          />
          <Text accessibilityRole="header" style={styles.title}>
            ライセンス
          </Text>
          <View style={styles.headerSpacer} />
        </View>
        <Text style={styles.description}>
          このアプリは、次の素材をそれぞれのライセンスに従って使っています。
        </Text>
        {THIRD_PARTY_NOTICES.map((notice) => (
          <Card key={notice.name} style={styles.card}>
            <Text accessibilityRole="header" style={styles.noticeName}>
              {notice.name}
            </Text>
            <Text style={styles.meta}>{notice.usage}</Text>
            <Text style={styles.meta} selectable>
              {notice.copyright}
            </Text>
            <Text style={styles.meta} selectable>
              {notice.source}
            </Text>
            {notice.licenses.map((license) => (
              <View key={license.name} style={styles.license}>
                <Text style={styles.licenseName}>{license.name}</Text>
                <Text style={styles.licenseText} selectable>
                  {license.text}
                </Text>
              </View>
            ))}
          </Card>
        ))}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    flex: 1,
    backgroundColor: theme.colors.surfaceApp,
  },
  content: {
    paddingHorizontal: theme.spacing[4],
    gap: theme.spacing[4],
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontSize: theme.typography.size.xl,
    fontWeight: theme.typography.weight.heavy,
    color: theme.colors.textPrimary,
  },
  headerSpacer: {
    width: theme.control.md,
  },
  description: {
    fontSize: theme.typography.size.sm,
    color: theme.colors.textSecondary,
  },
  card: {
    gap: theme.spacing[2],
  },
  noticeName: {
    fontSize: theme.typography.size.md,
    fontWeight: theme.typography.weight.bold,
    color: theme.colors.textPrimary,
  },
  meta: {
    fontSize: theme.typography.size.sm,
    color: theme.colors.textSecondary,
  },
  license: {
    gap: theme.spacing[1],
    marginTop: theme.spacing[2],
  },
  licenseName: {
    fontSize: theme.typography.size.sm,
    fontWeight: theme.typography.weight.bold,
    color: theme.colors.textPrimary,
  },
  licenseText: {
    fontSize: theme.typography.size.xs,
    lineHeight: 18,
    color: theme.colors.textSecondary,
  },
}));
