import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Card } from "@/components/ui/card/Card";
import { IconButton } from "@/components/ui/icon-button/IconButton";
import { StatBlock } from "@/components/ui/stat-block/StatBlock";
import { HistoryStateCard } from "@/features/history/components/HistoryStateCard";
import { WalkTrackMapView } from "@/features/history/components/WalkTrackMapView";
import { useWalkDetail } from "@/features/history/hooks/useWalkDetail";
import {
  isRetriableWalkHistoryError,
  walkHistoryErrorMessage,
} from "@/features/history/lib/walkHistoryError";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

export type WalkDetailViewProps = {
  /** ルートから渡される walk id。取得できなければ null。 */
  walkId: string | null;
};

/**
 * `renderBody()` の戻り値。「どの状態のときに中央寄せラッパーで包むか」の判断を
 * ここ1箇所に閉じ、呼び出し側で同じ条件をもう一度書かないようにする
 * （判定条件と分岐内容が2箇所に分かれると、状態を増減したときに片方だけ更新して
 * 表示崩れを起こしやすいため）。
 */
type WalkDetailBody = { content: ReactNode; centered: boolean };

/** WalkDetailView — `/walk-history/<walkId>` の実体。散歩1件の詳細（軌跡付き）を表示する。 */
export function WalkDetailView({ walkId }: WalkDetailViewProps) {
  const theme = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const detail = useWalkDetail(walkId);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)/history");
    }
  };

  const renderBody = (): WalkDetailBody => {
    if (walkId === null) {
      return {
        centered: true,
        content: (
          <HistoryStateCard
            testID="walk-detail-error"
            icon="alert-circle"
            tone="danger"
            title="散歩の記録を特定できませんでした"
            action={{
              label: "一覧へ戻る",
              onPress: () => router.replace("/walk-history"),
              testID: "walk-detail-back-to-list",
            }}
          />
        ),
      };
    }

    if (detail.errorCode !== null) {
      if (detail.errorCode === "not_found") {
        return {
          centered: true,
          content: (
            <HistoryStateCard
              testID="walk-detail-error"
              icon="alert-circle"
              tone="danger"
              title={walkHistoryErrorMessage(detail.errorCode)}
              action={{
                label: "一覧へ戻る",
                onPress: () => router.replace("/walk-history"),
                testID: "walk-detail-back-to-list",
              }}
            />
          ),
        };
      }

      return {
        centered: true,
        content: (
          <HistoryStateCard
            testID="walk-detail-error"
            icon="alert-circle"
            tone="danger"
            title={walkHistoryErrorMessage(detail.errorCode)}
            action={
              isRetriableWalkHistoryError(detail.errorCode)
                ? { label: "再試行", onPress: detail.retry, testID: "walk-detail-retry" }
                : undefined
            }
          />
        ),
      };
    }

    if (detail.isLoading || detail.walk === null) {
      return {
        centered: true,
        content: (
          <View style={styles.centerState} testID="walk-detail-loading">
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ),
      };
    }

    const walk = detail.walk;

    return {
      centered: false,
      content: (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + theme.spacing[6] },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <WalkTrackMapView
            testID="walk-detail-map"
            track={walk.track}
            destination={walk.destination}
            destinationName={walk.destinationName}
            height={260}
            style={styles.map}
          />
          <Card>
            <Text style={styles.destinationName}>{walk.destinationName}</Text>
            <Text style={styles.dateTime}>{`${walk.dateLabel} ${walk.timeRangeLabel}`}</Text>
          </Card>
          <Card style={styles.statsRow}>
            <StatBlock value={walk.elapsedLabel} label="経過時間" size="sm" />
            <StatBlock value={walk.distanceKm.toFixed(1)} unit="km" label="歩行距離" size="sm" />
            <StatBlock value={walk.paceLabel} label="平均ペース" size="sm" />
          </Card>
        </ScrollView>
      ),
    };
  };

  const body = renderBody();

  return (
    <View testID="walk-detail-screen" style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + theme.spacing[2] }]}>
        <IconButton icon="chevron-left" label="戻る" variant="ghost" onPress={handleBack} />
        <Text style={styles.title}>散歩の記録</Text>
        <View style={styles.headerSpacer} />
      </View>
      {body.centered ? <View style={styles.centerContent}>{body.content}</View> : body.content}
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
    justifyContent: "space-between",
    paddingHorizontal: theme.layout.pageGutter,
    paddingBottom: theme.spacing[2],
  },
  title: {
    fontSize: theme.typography.size.xl,
    fontWeight: theme.typography.weight.heavy,
    color: theme.colors.textPrimary,
  },
  headerSpacer: {
    width: theme.control.md,
  },
  centerContent: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: theme.layout.pageGutter,
  },
  centerState: {
    alignItems: "center",
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: theme.layout.pageGutter,
    gap: theme.spacing[3],
  },
  map: {
    borderRadius: theme.radius.lg,
    overflow: "hidden",
  },
  destinationName: {
    fontSize: theme.typography.size.xl,
    fontWeight: theme.typography.weight.heavy,
    color: theme.colors.textPrimary,
  },
  dateTime: {
    marginTop: 2,
    fontSize: theme.typography.size.sm,
    color: theme.colors.textSecondary,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
}));
