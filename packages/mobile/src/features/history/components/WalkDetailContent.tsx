import { ScrollView, Text } from "react-native";

import { Card } from "@/components/ui/card/Card";
import { StatBlock } from "@/components/ui/stat-block/StatBlock";
import { WalkTrackMapView } from "@/features/history/components/WalkTrackMapView";
import type { WalkDetail } from "@/features/history/types";
import { makeStyles } from "@/theme/makeStyles";

export type WalkDetailContentProps = {
  walk: WalkDetail;
  /** 下端の余白（セーフエリアを含む）。 */
  paddingBottom: number;
};

/** 散歩の詳細（`WalkDetailView`）の、取得できたときの本文（軌跡の地図・行き先と日時・記録の数値）。 */
export function WalkDetailContent({ walk, paddingBottom }: WalkDetailContentProps) {
  const styles = useStyles();
  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={[styles.content, { paddingBottom }]}
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
        <StatBlock
          value={walk.averageSpeedKmh === null ? "—" : walk.averageSpeedKmh.toFixed(1)}
          unit={walk.averageSpeedKmh === null ? undefined : "km/h"}
          label="平均時速"
          size="sm"
        />
      </Card>
    </ScrollView>
  );
}

const useStyles = makeStyles((theme) => ({
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
