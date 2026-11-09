import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { ActivityIndicator, FlatList, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconButton } from "@/components/ui/icon-button/IconButton";
import { HistoryStateCard } from "@/features/history/components/HistoryStateCard";
import { WalkHistoryCard } from "@/features/history/components/WalkHistoryCard";
import { useWalkHistory } from "@/features/history/hooks/useWalkHistory";
import { resolveHistoryListBodyState } from "@/features/history/lib/historyListBodyState";
import {
  HISTORY_SIGN_IN_TITLE,
  type HistoryAuthState,
} from "@/features/history/lib/historyStatsState";
import {
  WALK_HISTORY_EMPTY_DESCRIPTION,
  WALK_HISTORY_EMPTY_TITLE,
} from "@/features/history/lib/walkHistoryEmptyState";
import {
  isRetriableWalkHistoryError,
  walkHistoryErrorMessage,
} from "@/features/history/lib/walkHistoryError";
import { useScreenBack } from "@/hooks/useScreenBack";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

/**
 * `renderBody()` の戻り値。「どの状態のときに中央寄せラッパーで包むか」の判断を
 * ここ1箇所に閉じ、呼び出し側で同じ条件をもう一度書かないようにする
 * （判定条件と分岐内容が2箇所に分かれると、状態を増減したときに片方だけ更新して
 * 表示崩れを起こしやすいため）。
 */
type HistoryBody = { content: ReactNode; centered: boolean };

export type WalkHistoryListViewProps = {
  /**
   * 認証状態（サインイン中 / ゲスト / セッション復元中）。ルート（app/walk-history/index.tsx）が注入する
   * （features/history は認証を読まない。ADR-M-009 決定8）。サインイン中だけ取得する（SS-45）。
   */
  authState: HistoryAuthState;
  /** ゲスト向けサインイン案内のボタン。 */
  onSignIn: () => void;
};

/**
 * WalkHistoryListView — `/walk-history` の実体。全履歴を無限スクロールで表示する。
 * ディープリンクで未サインインのまま開かれたときは、通信せずサインイン案内を出す（SS-45）。
 */
export function WalkHistoryListView({ authState, onSignIn }: WalkHistoryListViewProps) {
  const theme = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const history = useWalkHistory({ enabled: authState === "signed-in" });
  const back = useScreenBack({ fallbackHref: "/(tabs)/account" });

  const bodyState = resolveHistoryListBodyState({
    authState,
    errorCode: history.errorCode,
    isLoading: history.isLoading,
    itemCount: history.items.length,
  });

  const renderBody = (): HistoryBody => {
    switch (bodyState.kind) {
      case "sign-in-required":
        return {
          centered: true,
          content: (
            <HistoryStateCard
              testID="walk-history-sign-in-required"
              icon="user"
              title={HISTORY_SIGN_IN_TITLE}
              action={{ label: "サインイン", onPress: onSignIn, testID: "walk-history-sign-in" }}
            />
          ),
        };

      case "error":
        return {
          centered: true,
          content: (
            <HistoryStateCard
              testID="walk-history-error"
              icon="alert-circle"
              tone="danger"
              title={walkHistoryErrorMessage(bodyState.errorCode)}
              action={
                isRetriableWalkHistoryError(bodyState.errorCode)
                  ? { label: "再試行", onPress: history.reload, testID: "walk-history-retry" }
                  : undefined
              }
            />
          ),
        };

      // 復元中は読み込み中と同じ見た目（サインイン済みのユーザーにサインイン案内を一瞬でも見せない）。
      case "restoring":
      case "loading":
        return {
          centered: true,
          content: (
            <View style={styles.centerState} testID="walk-history-loading">
              <ActivityIndicator color={theme.colors.primary} />
            </View>
          ),
        };

      case "empty":
        return {
          centered: true,
          content: (
            <HistoryStateCard
              testID="walk-history-empty"
              icon="footprints"
              title={WALK_HISTORY_EMPTY_TITLE}
              description={WALK_HISTORY_EMPTY_DESCRIPTION}
              action={{
                label: "散歩を始める",
                onPress: () => back.runOnce(() => router.push("/walk-start")),
              }}
            />
          ),
        };

      case "ready":
        break;
    }

    return {
      centered: false,
      content: (
        <FlatList
          style={styles.flatList}
          data={history.items}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <WalkHistoryCard
              item={item}
              testID={`walk-history-item-${index}`}
              onPress={() =>
                router.push({ pathname: "/walk-history/[walkId]", params: { walkId: item.id } })
              }
            />
          )}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + theme.spacing[6] }]}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (history.hasNextPage && !history.isFetchingNextPage) {
              history.fetchNextPage();
            }
          }}
          ListFooterComponent={
            history.isFetchingNextPage ? (
              <ActivityIndicator color={theme.colors.primary} style={styles.footerLoading} />
            ) : null
          }
          refreshControl={
            <RefreshControl
              refreshing={history.isRefetching}
              onRefresh={history.reload}
              tintColor={theme.colors.primary}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      ),
    };
  };

  const body = renderBody();

  return (
    <View testID="walk-history-screen" style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + theme.spacing[2] }]}>
        <IconButton
          icon="chevron-left"
          label="戻る"
          variant="ghost"
          onPress={back.goBack}
          testID="walk-history-back"
        />
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
  flatList: {
    flex: 1,
  },
  list: {
    gap: theme.spacing[2] + 2,
    paddingHorizontal: theme.layout.pageGutter,
    paddingTop: theme.spacing[2],
  },
  footerLoading: {
    marginVertical: theme.spacing[4],
  },
}));
