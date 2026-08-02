import { useRouter } from "expo-router";
import { ActivityIndicator, FlatList, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconButton } from "@/components/ui/icon-button/IconButton";
import { HistoryStateCard } from "@/features/history/components/HistoryStateCard";
import { WalkHistoryCard } from "@/features/history/components/WalkHistoryCard";
import { useWalkHistory } from "@/features/history/hooks/useWalkHistory";
import {
  isRetriableWalkHistoryError,
  walkHistoryErrorMessage,
} from "@/features/history/lib/walkHistoryError";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

/** WalkHistoryListView — `/walk-history` の実体。全履歴を無限スクロールで表示する。 */
export function WalkHistoryListView() {
  const theme = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const history = useWalkHistory();

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)/history");
    }
  };

  const renderBody = () => {
    if (history.errorCode !== null) {
      return (
        <HistoryStateCard
          testID="walk-history-error"
          icon="alert-circle"
          tone="danger"
          title={walkHistoryErrorMessage(history.errorCode)}
          action={
            isRetriableWalkHistoryError(history.errorCode)
              ? { label: "再試行", onPress: history.reload, testID: "walk-history-retry" }
              : undefined
          }
        />
      );
    }

    if (history.isLoading) {
      return (
        <View style={styles.centerState} testID="walk-history-loading">
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      );
    }

    if (history.items.length === 0) {
      return (
        <HistoryStateCard
          testID="walk-history-empty"
          icon="footprints"
          title="まだ散歩の記録がありません"
          description="散歩を終えると、ここに記録が並びます。"
          action={{ label: "散歩を始める", onPress: () => router.push("/walk-start") }}
        />
      );
    }

    return (
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
    );
  };

  return (
    <View testID="walk-history-screen" style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + theme.spacing[2] }]}>
        <IconButton icon="chevron-left" label="戻る" variant="ghost" onPress={handleBack} />
        <Text style={styles.title}>散歩の記録</Text>
        <View style={styles.headerSpacer} />
      </View>
      {history.errorCode !== null || history.isLoading || history.items.length === 0 ? (
        <View style={styles.centerContent}>{renderBody()}</View>
      ) : (
        renderBody()
      )}
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
