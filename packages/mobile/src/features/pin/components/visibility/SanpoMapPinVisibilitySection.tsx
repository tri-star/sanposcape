import { ActivityIndicator, Text, View } from "react-native";

import { Button } from "@/components/ui/button/Button";
import { Switch } from "@/components/ui/switch/Switch";
import { SanpoMapIconBadge } from "@/features/pin/components/SanpoMapIconBadge";
import type { SanpoMap } from "@/features/pin/types";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

export type SanpoMapPinVisibilitySectionProps = {
  maps: readonly SanpoMap[];
  /** 地図一覧の取得状態（`useSanpoMaps` の status）。 */
  status: "loading" | "ready" | "error";
  onRetry: () => void;
  /** 切り替え中の地図（そのスイッチを無効にする）。 */
  pendingSanpoMapIds: ReadonlySet<string>;
  /** 直近の切り替えの失敗の案内。無ければ null。 */
  errorMessage: string | null;
  onChange: (sanpoMapId: string, pinsVisible: boolean) => void;
  /**
   * 例: "pin-tab-pin-filter-maps"。節は `${testIDPrefix}`、行のスイッチは `${testIDPrefix}-switch-${地図ID}`、
   * 失敗の案内は `${testIDPrefix}-error`、再試行は `${testIDPrefix}-retry`。
   */
  testIDPrefix: string;
};

/**
 * 「表示するピン」シートの「表示する地図」の節（SS-266）。地図ごとのスイッチで、その地図のピンを
 * ピンタブ・散歩中の地図に出すかを切り替える。操作はその場で効く（シートのほかの項目と同じ。ADR-M-021 D10）。
 * 選択は自分のメンバーシップに保存され（`PATCH /sanpo-maps/{id}/members/me`）、共有地図のほかのメンバーには効かない。
 *
 * 地図が1つだけでも消せる（消すと地図にピンが出なくなり、ピンタブの案内が「条件に合うピンが無い」になる）。
 */
export function SanpoMapPinVisibilitySection({
  maps,
  status,
  onRetry,
  pendingSanpoMapIds,
  errorMessage,
  onChange,
  testIDPrefix,
}: SanpoMapPinVisibilitySectionProps) {
  const theme = useTheme();
  const styles = useStyles();

  return (
    <View style={styles.section} testID={testIDPrefix}>
      <Text style={styles.heading}>表示する地図</Text>
      {status === "loading" && maps.length === 0 ? (
        <ActivityIndicator color={theme.colors.primary} accessibilityLabel="地図を読み込み中" />
      ) : status === "error" && maps.length === 0 ? (
        <View style={styles.errorRow}>
          <Text style={styles.helper}>地図の一覧を読み込めませんでした</Text>
          <Button variant="secondary" size="sm" onPress={onRetry} testID={`${testIDPrefix}-retry`}>
            再試行
          </Button>
        </View>
      ) : maps.length === 0 ? (
        <Text style={styles.helper}>まだ地図がありません</Text>
      ) : (
        maps.map((map) => (
          <View key={map.id} style={styles.row}>
            <SanpoMapIconBadge icon={map.icon} size={28} />
            <Text style={styles.name} numberOfLines={1}>
              {map.name}
            </Text>
            <Switch
              checked={map.pinsVisible}
              onChange={(next) => onChange(map.id, next)}
              disabled={pendingSanpoMapIds.has(map.id)}
              accessibilityLabel={`${map.name}のピンを表示`}
              testID={`${testIDPrefix}-switch-${map.id}`}
            />
          </View>
        ))
      )}
      {errorMessage !== null ? (
        <Text style={styles.error} accessibilityRole="alert" testID={`${testIDPrefix}-error`}>
          {errorMessage}
        </Text>
      ) : null}
      <Text style={styles.helper}>
        自分の地図にだけ効きます。共有している相手の表示は変わりません
      </Text>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  section: {
    gap: theme.spacing[3],
    paddingBottom: theme.spacing[5],
  },
  heading: {
    fontSize: theme.typography.size.sm,
    fontWeight: theme.typography.weight.bold,
    color: theme.colors.textSecondary,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
  },
  name: {
    flex: 1,
    fontSize: theme.typography.size.md,
    color: theme.colors.textPrimary,
  },
  errorRow: {
    gap: theme.spacing[2],
    alignItems: "flex-start",
  },
  error: {
    fontSize: theme.typography.size.sm,
    color: theme.colors.danger,
  },
  helper: {
    fontSize: theme.typography.size.xs,
    color: theme.colors.textTertiary,
  },
}));
