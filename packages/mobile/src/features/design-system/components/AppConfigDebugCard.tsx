import { useQueryClient } from "@tanstack/react-query";
import { Text, View } from "react-native";

import { APP_CONFIG_QUERY_KEY } from "@/api/appConfigQueryKey";
import { Button } from "@/components/ui/button/Button";
import { Card } from "@/components/ui/card/Card";
import { useAppConfig, useAppConfigDiagnostics } from "@/hooks/useAppConfig";
import type { AppConfigStatus } from "@/lib/appConfigSnapshot";
import { makeStyles } from "@/theme/makeStyles";

const STATUS_LABEL: Record<AppConfigStatus, string> = {
  loading: "取得中",
  ready: "取得済み",
  unavailable: "取得失敗",
};

/**
 * `/app-config` の取得状態を目視確認するための開発確認用カード（`__DEV__` 限定の `/dev-screens`
 * からのみ到達する `ScreenCatalog` に差し込む）。
 *
 * RN のレンダリングテストが書けない制約の代替として、リポジトリが採っている
 * 「表示確認は `/dev-screens` で行う」方針（`docs/pages-components-guideline.md`）に従う。
 *
 * `config_source` は**診断専用**であり、プロダクトコードの分岐には使わない
 * （`useAppConfigDiagnostics()` の JSDoc 参照。ADR-008 追補 D1）。
 */
export function AppConfigDebugCard() {
  const styles = useStyles();
  const queryClient = useQueryClient();
  const snapshot = useAppConfig();
  const { configSource } = useAppConfigDiagnostics();

  const flagEntries = Object.entries(snapshot.flags);

  return (
    <Card testID="app-config-debug-card" style={styles.card}>
      <Text style={styles.title}>/app-config 診断（開発用）</Text>

      <View style={styles.row}>
        <Text style={styles.label}>状態</Text>
        <Text style={styles.value} testID="app-config-debug-status">
          {STATUS_LABEL[snapshot.status]}
        </Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>config_source（診断のみ。分岐に使用禁止）</Text>
        <Text style={styles.value}>{configSource ?? "-"}</Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>フラグ</Text>
        {flagEntries.length === 0 ? (
          <Text style={styles.value}>（フラグなし）</Text>
        ) : (
          flagEntries.map(([key, value]) => (
            <Text key={key} style={styles.value}>
              {key}: {value ? "ON" : "OFF"}
            </Text>
          ))
        )}
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>最低サポートバージョン（SS-101 で使用）</Text>
        <Text style={styles.value}>ios: {snapshot.minimumSupportedVersions.ios ?? "指定なし"}</Text>
        <Text style={styles.value}>
          android: {snapshot.minimumSupportedVersions.android ?? "指定なし"}
        </Text>
      </View>

      <Button
        variant="outline"
        size="sm"
        testID="app-config-debug-refresh"
        onPress={() => {
          void queryClient.invalidateQueries({ queryKey: APP_CONFIG_QUERY_KEY });
        }}
        style={styles.button}
      >
        再取得
      </Button>
    </Card>
  );
}

const useStyles = makeStyles((theme) => ({
  card: {
    gap: theme.spacing[2],
  },
  title: {
    fontSize: theme.typography.size.sm,
    fontWeight: theme.typography.weight.bold,
    color: theme.colors.textPrimary,
  },
  row: {
    gap: 2,
  },
  label: {
    fontSize: theme.typography.size.xs,
    color: theme.colors.textSecondary,
  },
  value: {
    fontSize: theme.typography.size.xs,
    color: theme.colors.textPrimary,
  },
  button: {
    alignSelf: "flex-start",
    marginTop: theme.spacing[1],
  },
}));
