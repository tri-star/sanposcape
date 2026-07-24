import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Image, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import walkerImage from "@/assets/images/walker.png";
import { Button } from "@/components/ui/button/Button";
import { Dialog } from "@/components/ui/dialog/Dialog";
import { Icon } from "@/components/ui/icon/Icon";
import { IconButton } from "@/components/ui/icon-button/IconButton";
import { ToastOverlay } from "@/components/ui/toast/ToastOverlay";
import { MapCanvas } from "@/features/walk/components/MapCanvas";
import { WalkStatsPanel } from "@/features/walk/components/WalkStatsPanel";
import { useWalkSession } from "@/features/walk/hooks/useWalkSession";
import { walkStatsFromElapsed } from "@/features/walk/lib/walkStats";
import { useToast } from "@/hooks/useToast";
import { formatClock } from "@/lib/formatClock";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

const DEFAULT_GOAL_NAME = "川辺駅";
const DEFAULT_GOAL_TIME_MIN = "60";
const DEFAULT_GOAL_DIST_KM = "4.0";

/**
 * 散歩中（ナビタブ）画面。mock `isMain` を1:1で再現する。
 * 目的地情報は walk-start から router params で受け取る。
 */
export function WalkActiveView() {
  const theme = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const session = useWalkSession();
  const [endDialogOpen, setEndDialogOpen] = useState(false);

  const params = useLocalSearchParams<{
    goalName?: string;
    goalTimeMin?: string;
    goalDistKm?: string;
  }>();
  const goalName = params.goalName ?? DEFAULT_GOAL_NAME;
  const goalTimeMin = params.goalTimeMin ?? DEFAULT_GOAL_TIME_MIN;
  const goalDistKm = params.goalDistKm ?? DEFAULT_GOAL_DIST_KM;

  const stats = walkStatsFromElapsed(session.elapsedSec);
  const isDark = theme.name === "dark";

  const handleConfirmEnd = () => {
    setEndDialogOpen(false);
    router.push({
      pathname: "/walk-summary",
      params: {
        elapsedSec: String(session.elapsedSec),
        distKm: stats.km.toFixed(1),
        steps: String(stats.steps),
        goalName,
      },
    });
  };

  return (
    <View testID="walk-active-screen" style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        {isDark ? (
          <View style={styles.illustrationTint}>
            <Icon name="footprints" size={24} color={theme.colors.primary} />
          </View>
        ) : (
          <Image source={walkerImage} resizeMode="cover" style={styles.illustration} />
        )}
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>往復の目安</Text>
          <View style={styles.headerValueRow}>
            <Text style={styles.headerValue}>{goalTimeMin}</Text>
            <Text style={styles.headerUnit}>分（約{goalDistKm}km）</Text>
          </View>
          <Text style={styles.goalName}>ゴール：{goalName}</Text>
        </View>
        <IconButton
          icon="settings-2"
          label="設定"
          variant="tinted"
          onPress={() => toast.show("準備中の機能です")}
        />
      </View>

      <MapCanvas
        height={322}
        testID="walk-active-map"
        pins={[{ id: "goal", category: "goal", icon: "flag", label: goalName, x: 64, y: 90 }]}
      >
        <View style={styles.mapTools}>
          <IconButton
            icon="crosshair"
            label="現在地"
            variant="surface"
            size="sm"
            onPress={() => toast.show("準備中の機能です")}
          />
        </View>
      </MapCanvas>

      <View style={styles.statsWrap}>
        <WalkStatsPanel
          elapsedSec={session.elapsedSec}
          distKm={stats.km}
          steps={stats.steps}
          paused={session.paused}
          onTogglePause={session.togglePause}
          onEnd={() => setEndDialogOpen(true)}
          onAddPin={() => toast.show("準備中の機能です")}
        />
      </View>

      <Dialog
        open={endDialogOpen}
        title="散歩を終了しますか？"
        onClose={() => setEndDialogOpen(false)}
        testID="walk-end-dialog"
        actions={
          <>
            <Button variant="secondary" fullWidth onPress={() => setEndDialogOpen(false)}>
              続ける
            </Button>
            <Button
              variant="primary"
              fullWidth
              onPress={handleConfirmEnd}
              testID="walk-end-confirm"
            >
              終了して記録
            </Button>
          </>
        }
      >
        <Text style={styles.dialogBody}>
          経過時間 {formatClock(session.elapsedSec)} を今日の記録に保存します。
        </Text>
      </Dialog>

      <ToastOverlay message={toast.message} visible={toast.visible} bottom={insets.bottom + 96} />
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    flex: 1,
    backgroundColor: theme.colors.surfaceApp,
  },
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
  mapTools: {
    position: "absolute",
    right: theme.spacing[3],
    top: theme.spacing[3],
    gap: theme.spacing[2],
  },
  statsWrap: {
    margin: theme.spacing[3],
  },
  dialogBody: {
    fontSize: theme.typography.size.md,
    color: theme.colors.textSecondary,
    lineHeight: 24,
  },
}));
