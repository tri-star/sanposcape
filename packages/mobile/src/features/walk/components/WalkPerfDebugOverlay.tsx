import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { IconButton } from "@/components/ui/icon-button/IconButton";
import { useJsFrameRate } from "@/features/walk/hooks/useJsFrameRate";
import { makeStyles } from "@/theme/makeStyles";

export type WalkPerfDebugOverlayProps = {
  /** 地図に渡している軌跡の点の数（`walk.points.length`。送信時の間引き前の値）。 */
  pointCount: number;
  testID?: string;
};

/**
 * WalkPerfDebugOverlay — 散歩中の地図の左上に重ねる、開発用の計測値の表示（SS-229）。
 * 軌跡の点の数と JS スレッドの FPS を出す。最初はボタンだけで、押すと数値のパネルに開き、パネルを押すと閉じる。
 * 開閉の状態は保持しない（画面を作り直すと閉じた状態に戻る）。
 *
 * 表示してよいビルドかは判定しない。ルート（`app/(tabs)/index.tsx`）が `isDevToolsEnabled()` を
 * `WalkActiveView` の `showPerfDebug` に渡し、false なら `WalkActiveView` がこのコンポーネントを描かない（ADR-M-007 SS-148 追補）。
 */
export function WalkPerfDebugOverlay({ pointCount, testID }: WalkPerfDebugOverlayProps) {
  const styles = useStyles();
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={styles.root} pointerEvents="box-none">
      {expanded ? (
        <WalkPerfDebugPanel
          pointCount={pointCount}
          onCollapse={() => setExpanded(false)}
          testID={testID ? `${testID}-panel` : undefined}
        />
      ) : (
        <IconButton
          icon="bar-chart-2"
          label="計測値を表示"
          variant="surface"
          size="sm"
          testID={testID ? `${testID}-toggle` : undefined}
          onPress={() => setExpanded(true)}
        />
      )}
    </View>
  );
}

type WalkPerfDebugPanelProps = {
  pointCount: number;
  onCollapse: () => void;
  testID?: string;
};

/**
 * 開いているときのパネル。FPS の計測（`useJsFrameRate`）はこのコンポーネントが持つので、
 * 閉じている間は `requestAnimationFrame` を回さない（計測そのものが負荷にならないように）。
 */
function WalkPerfDebugPanel({ pointCount, onCollapse, testID }: WalkPerfDebugPanelProps) {
  const styles = useStyles();
  const fps = useJsFrameRate();
  const fpsText = fps === null ? "--" : String(fps);

  return (
    <Pressable
      testID={testID}
      onPress={onCollapse}
      accessibilityRole="button"
      accessibilityLabel={`軌跡の点 ${pointCount}、JS FPS ${fps === null ? "計測中" : fps}。押すと閉じる`}
      style={styles.panel}
    >
      <View style={styles.row}>
        <Text style={styles.label}>軌跡の点</Text>
        <Text style={styles.value} testID={testID ? `${testID}-points` : undefined}>
          {pointCount}
        </Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>JS FPS</Text>
        <Text style={styles.value} testID={testID ? `${testID}-fps` : undefined}>
          {fpsText}
        </Text>
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles((theme) => ({
  // 右上は地図のツール列（`mapTools`）、左下は凡例（`WalkRouteLegend`）なので、左上に置く。
  root: {
    position: "absolute",
    left: theme.spacing[3],
    top: theme.spacing[3],
  },
  panel: {
    gap: 2,
    backgroundColor: theme.colors.surfaceCard,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    ...theme.shadows.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: theme.spacing[3],
  },
  label: {
    fontSize: theme.typography.size["2xs"],
    color: theme.colors.textSecondary,
  },
  value: {
    fontSize: theme.typography.size.sm,
    fontWeight: theme.typography.weight.bold,
    color: theme.colors.textPrimary,
    // 桁が変わるたびに幅が揺れないよう等幅数字にする（StatBlock と同じ）。
    fontVariant: ["tabular-nums"],
  },
}));
