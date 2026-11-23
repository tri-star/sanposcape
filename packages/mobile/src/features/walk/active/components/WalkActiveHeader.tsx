import { Image, Text, View } from "react-native";

import walkerImage from "@/assets/images/walker.png";
import { Icon } from "@/components/ui/icon/Icon";
import { IconButton } from "@/components/ui/icon-button/IconButton";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

export type WalkActiveHeaderProps = {
  /** 散歩開始時点の周回ルートの実値（WalkStartView が積む）。散歩中は取り直さない（SS-33）。 */
  loopMinutes: number;
  loopKm: number;
  destinationName: string;
  /** 上端の余白（ステータスバーを含む）。 */
  paddingTop: number;
  onOpenSettings: () => void;
};

/** 散歩中の画面（`WalkActiveView`）の上端。周回の目安・ゴール・設定への入口を出す。 */
export function WalkActiveHeader({
  loopMinutes,
  loopKm,
  destinationName,
  paddingTop,
  onOpenSettings,
}: WalkActiveHeaderProps) {
  const theme = useTheme();
  const styles = useStyles();
  const isDark = theme.name === "dark";

  return (
    <View style={[styles.header, { paddingTop }]}>
      {isDark ? (
        <View style={styles.illustrationTint}>
          <Icon name="footprints" size={24} color={theme.colors.primary} />
        </View>
      ) : (
        <Image source={walkerImage} resizeMode="cover" style={styles.illustration} />
      )}
      <View style={styles.headerText}>
        <Text style={styles.eyebrow}>周回の目安</Text>
        <View style={styles.headerValueRow}>
          <Text style={styles.headerValue}>{loopMinutes}</Text>
          <Text style={styles.headerUnit}>分（約{loopKm.toFixed(1)}km）</Text>
        </View>
        <Text style={styles.goalName}>ゴール：{destinationName}</Text>
      </View>
      <IconButton icon="settings-2" label="設定" variant="tinted" onPress={onOpenSettings} />
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    paddingHorizontal: theme.layout.pageGutter,
    paddingBottom: theme.spacing[2] + 2,
  },
  illustration: {
    width: 88,
    height: 48,
    borderRadius: theme.radius.md,
  },
  illustrationTint: {
    width: 88,
    height: 48,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceTint,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    flex: 1,
  },
  eyebrow: {
    fontSize: theme.typography.size["2xs"],
    color: theme.colors.textTertiary,
  },
  headerValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
  },
  headerValue: {
    fontSize: theme.typography.size["2xl"] + 2,
    fontWeight: theme.typography.weight.heavy,
    color: theme.colors.primary,
  },
  headerUnit: {
    fontSize: theme.typography.size.xs,
    color: theme.colors.textSecondary,
  },
  goalName: {
    marginTop: 1,
    fontSize: theme.typography.size.md,
    fontWeight: theme.typography.weight.bold,
    color: theme.colors.textPrimary,
  },
}));
