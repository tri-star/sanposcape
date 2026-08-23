import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Card } from "@/components/ui/card/Card";
import { IconButton } from "@/components/ui/icon-button/IconButton";
import { StatBlock } from "@/components/ui/stat-block/StatBlock";
import { HistoryStateCard } from "@/features/history/components/HistoryStateCard";
import { WalkDeleteDialog } from "@/features/history/components/WalkDeleteDialog";
import { WalkTrackMapView } from "@/features/history/components/WalkTrackMapView";
import { useWalkDelete } from "@/features/history/hooks/useWalkDelete";
import { useWalkDetail } from "@/features/history/hooks/useWalkDetail";
import { WALK_DELETE_DONE_TITLE } from "@/features/history/lib/walkDeleteCopy";
import {
  canDeleteWalk,
  resolveWalkDetailBodyState,
} from "@/features/history/lib/walkDetailBodyState";
import {
  isRetriableWalkHistoryError,
  walkHistoryErrorMessage,
} from "@/features/history/lib/walkHistoryError";
import type { UseScreenBackResult } from "@/hooks/useScreenBack";
import { useScreenBack } from "@/hooks/useScreenBack";
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

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // useScreenBack より前に useWalkDelete を宣言する。
  // この画面は、useScreenBack の onIntercept が削除ダイアログの状態
  // （deleteDialogOpen / deletion.status）を参照する必要がある一方、useWalkDelete の
  // onDeleted は useScreenBack の戻り値（back.runOnce）を呼ぶ必要があるという相互参照になっている
  // （useScreenBack の BackHandler 購読と RN Modal の onRequestClose が同居する初めてのケース）。
  // 循環を解消するため、onDeleted 内の back 参照だけを ref（backRef）経由に逃がし、
  // useWalkDelete → useScreenBack の順で宣言する。
  const backRef = useRef<UseScreenBackResult | null>(null);

  const deletion = useWalkDelete(walkId, {
    onDeleted: () => {
      setDeleteDialogOpen(false);
      // 一覧へ遷移する。push ではなく replace ——
      // 削除済みの詳細画面をスタックに残すと、戻る操作で「消したはずの記録」へ戻れてしまう
      // （そこで 404 になる）ため。back.runOnce を通すのは、戻る操作と削除完了の遷移が
      // 二重に走らないようにするため。
      backRef.current?.runOnce(() => router.replace("/walk-history"));
    },
  });

  const closeDeleteDialog = () => {
    setDeleteDialogOpen(false);
    // 失敗表示を残したまま再オープンしないよう、閉じるタイミングで mutation もリセットする。
    deletion.reset();
  };

  const back = useScreenBack({
    fallbackHref: "/(tabs)/history",
    // ダイアログを開いている間は、画面ごと戻らずダイアログだけを閉じる。
    //
    // 注意: Android のハードウェアバックは、Modal 表示中は Modal 側の `onRequestClose`
    // （`Dialog` が `dismissDisabled` を見て処理する）が先に消費するため、この `onIntercept` は
    // その経路では呼ばれない可能性が高い（RN の既知の挙動）。実機での確認は未実施。
    // それでもここに同じ規律を書いておくのは、`goBack()` がプログラム的に呼ばれる経路
    // （画面上の戻るボタン等）でも「削除中は閉じない・削除中でなければダイアログだけ閉じる」に
    // 揃えるため。どちらの経路を通っても最終的な挙動は一致する。
    onIntercept: () => {
      if (!deleteDialogOpen) return false;
      // 削除中は閉じさせない（Dialog の dismissDisabled と同じ扱い）。
      if (deletion.status !== "deleting") closeDeleteDialog();
      return true;
    },
  });
  backRef.current = back;

  const bodyState = resolveWalkDetailBodyState({
    hasWalkId: walkId !== null,
    deleteStatus: deletion.status,
    errorCode: detail.errorCode,
    isLoading: detail.isLoading,
    hasWalk: detail.walk !== null,
  });

  // "loading" 表示の実体。`resolveWalkDetailBodyState` の判定順を型レベルでは表現できないため、
  // "error" / "ready" 分岐にも「実質到達しない」型ナローイング用のフォールバックが要る。
  // 同じ JSX を3箇所に書くとスタイル変更時に直し忘れるので、ここ1箇所に括り出す。
  const loadingBody = (): WalkDetailBody => ({
    centered: true,
    content: (
      <View style={styles.centerState} testID="walk-detail-loading">
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    ),
  });

  const renderBody = (): WalkDetailBody => {
    switch (bodyState) {
      case "invalid-id":
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
                onPress: () => back.runOnce(() => router.replace("/walk-history")),
                testID: "walk-detail-back-to-list",
              }}
            />
          ),
        };

      case "not-found":
        return {
          centered: true,
          content: (
            <HistoryStateCard
              testID="walk-detail-error"
              icon="alert-circle"
              tone="danger"
              title={walkHistoryErrorMessage("not_found")}
              action={{
                label: "一覧へ戻る",
                onPress: () => back.runOnce(() => router.replace("/walk-history")),
                testID: "walk-detail-back-to-list",
              }}
            />
          ),
        };

      case "error": {
        // "not-found" 以外の非 null errorCode。detail.errorCode は resolveWalkDetailBodyState の
        // 判定順3・4により、ここでは非 null（かつ not_found 以外）であることが保証されている。
        const errorCode = detail.errorCode;
        if (errorCode === null) {
          // 型注釈のための in-place ガード。実質到達しない分岐。
          return loadingBody();
        }
        return {
          centered: true,
          content: (
            <HistoryStateCard
              testID="walk-detail-error"
              icon="alert-circle"
              tone="danger"
              title={walkHistoryErrorMessage(errorCode)}
              action={
                isRetriableWalkHistoryError(errorCode)
                  ? { label: "再試行", onPress: detail.retry, testID: "walk-detail-retry" }
                  : undefined
              }
            />
          ),
        };
      }

      case "loading":
        return loadingBody();

      case "deleted":
        return {
          centered: true,
          content: (
            <HistoryStateCard
              testID="walk-delete-done"
              icon="check-circle-2"
              title={WALK_DELETE_DONE_TITLE}
            />
          ),
        };

      case "ready": {
        // resolveWalkDetailBodyState の判定順5により、"ready" は detail.walk !== null を含意する
        // （型注釈のための in-place ガード。実質到達しない分岐）。
        const walk = detail.walk;
        if (walk === null) {
          return loadingBody();
        }

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
                <StatBlock
                  value={walk.distanceKm.toFixed(1)}
                  unit="km"
                  label="歩行距離"
                  size="sm"
                />
                <StatBlock value={walk.paceLabel} label="平均ペース" size="sm" />
              </Card>
            </ScrollView>
          ),
        };
      }

      default: {
        const exhaustiveCheck: never = bodyState;
        return exhaustiveCheck;
      }
    }
  };

  const body = renderBody();

  return (
    <View testID="walk-detail-screen" style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + theme.spacing[2] }]}>
        <IconButton
          icon="chevron-left"
          label="戻る"
          variant="ghost"
          onPress={back.goBack}
          testID="walk-detail-back"
        />
        <Text style={styles.title}>散歩の記録</Text>
        {canDeleteWalk(bodyState) ? (
          <IconButton
            icon="trash-2"
            label="この散歩の記録を削除"
            variant="ghost"
            disabled={deletion.status === "deleting"}
            onPress={() => setDeleteDialogOpen(true)}
            testID="walk-detail-delete"
          />
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>
      {body.centered ? <View style={styles.centerContent}>{body.content}</View> : body.content}
      {/*
        マウント条件は open の boolean だけにする（SettingsView のログアウトダイアログと同じ理由）。
        bodyState で条件付きマウントすると、削除成功で bodyState が "deleted" に変わった瞬間に
        ダイアログが消えてちらつく。
      */}
      <WalkDeleteDialog
        open={deleteDialogOpen}
        status={deletion.status}
        errorCode={deletion.errorCode}
        onCancel={closeDeleteDialog}
        onConfirm={deletion.deleteWalk}
      />
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
