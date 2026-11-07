import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  RefreshControl,
  ScrollView,
  Text,
  View,
  type ListRenderItemInfo,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconButton } from "@/components/ui/icon-button/IconButton";
import { NameSearchField } from "@/features/pin/components/NameSearchField";
import { PinStateCard } from "@/features/pin/components/PinStateCard";
import { TagListItem } from "@/features/pin/components/tag/TagListItem";
import { usePullToRefresh } from "@/features/pin/hooks/usePullToRefresh";
import { useAllSanpoMapPins } from "@/features/pin/hooks/tag/useAllSanpoMapPins";
import { isRetriablePinReadError } from "@/features/pin/lib/pinReadError";
import { sanpoMapReadErrorMessage } from "@/features/pin/lib/sanpoMapError";
import {
  buildTagSummaries,
  filterTagSummariesByLabel,
  type TagSummary,
} from "@/features/pin/lib/tag/pinTagIndex";
import {
  resolveTagListBodyState,
  TAG_PINS_TRUNCATED_NOTICE,
  tagNoMatchTitle,
} from "@/features/pin/lib/tag/tagScreenState";
import { useScreenBack } from "@/hooks/useScreenBack";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

export type TagListViewProps = {
  /** ルート（app/tags/index.tsx）が useAuthSessionStore から注入する（features/pin は認証を読まない）。 */
  isSignedIn: boolean;
  onSignIn: () => void;
};

/** `renderBody()` の戻り値（`SanpoMapListView` と同じ形）。 */
type TagListBody = {
  content: ReactNode;
  centered: boolean;
  /** centered の本文を引っ張って更新できるようにする（ScrollView で包む）。 */
  refreshable?: boolean;
};

/**
 * TagListView — タグ一覧（`/tags`。SS-245）の実体。ピンタブの「タグ一覧」から開く。
 * 自分がメンバーの全地図のピンのタグを正規化キーでまとめて並べ（`buildTagSummaries`）、表記で即時に絞り込み
 * （端末で行う。地図一覧と同じ `NameSearchField`）、行のタップでタグ詳細（`/tags/detail?label=`）へ進む。
 *
 * - 認証は props で受ける（features/pin は認証を読まない）。フラグ（pin_registration）はルートがガードする。
 * - ゲストは開けるが通信せずサインイン案内を出し、検索欄は出さない（地図一覧と同じ。ADR-M-014 D6）。
 */
export function TagListView({ isSignedIn, onSignIn }: TagListViewProps) {
  const theme = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const source = useAllSanpoMapPins({ enabled: isSignedIn });
  const [query, setQuery] = useState("");
  const pull = usePullToRefresh(source.refresh);
  const back = useScreenBack({ fallbackHref: "/(tabs)/pins" });

  const tags = useMemo(() => buildTagSummaries(source.groups), [source.groups]);
  const matched = useMemo(() => filterTagSummariesByLabel(tags, query), [tags, query]);

  const bodyState = resolveTagListBodyState({
    isSignedIn,
    status: source.status,
    tagCount: tags.length,
    matchedCount: matched.length,
  });

  const handleOpenTag = useCallback(
    (label: string) => {
      Keyboard.dismiss();
      back.runOnce(() => router.push({ pathname: "/tags/detail", params: { label } }));
    },
    [back, router],
  );

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<TagSummary>) => (
      <TagListItem tag={item} onPress={handleOpenTag} testID={`tag-list-item-${index}`} />
    ),
    [handleOpenTag],
  );

  const refreshControl = (
    <RefreshControl
      refreshing={pull.refreshing}
      onRefresh={pull.onRefresh}
      tintColor={theme.colors.primary}
    />
  );

  const loadingBody = (): TagListBody => ({
    centered: true,
    content: (
      <View style={styles.centerState} testID="tag-list-loading">
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    ),
  });

  const renderBody = (): TagListBody => {
    switch (bodyState) {
      case "sign-in-required":
        return {
          centered: true,
          content: (
            <PinStateCard
              testID="tag-list-sign-in-required"
              icon="user"
              title="タグの一覧を見るにはサインインが必要です"
              action={{
                label: "サインイン",
                onPress: () => back.runOnce(onSignIn),
                testID: "tag-list-sign-in",
              }}
            />
          ),
        };

      case "loading":
        return loadingBody();

      case "error": {
        const errorCode = source.errorCode;
        if (errorCode === null) return loadingBody();
        return {
          centered: true,
          refreshable: true,
          content: (
            <PinStateCard
              testID="tag-list-error"
              icon="alert-circle"
              tone="danger"
              title={sanpoMapReadErrorMessage(errorCode, "pins")}
              action={
                isRetriablePinReadError(errorCode)
                  ? { label: "再試行", onPress: source.retry, testID: "tag-list-retry" }
                  : undefined
              }
            />
          ),
        };
      }

      case "empty":
        return {
          centered: true,
          refreshable: true,
          content: (
            <PinStateCard
              testID="tag-list-empty"
              icon="tag"
              title="まだタグがありません"
              description="ピンの登録・編集でタグを付けると、ここに並びます"
            />
          ),
        };

      case "no-match":
        return {
          centered: true,
          refreshable: true,
          content: (
            <PinStateCard
              testID="tag-list-no-match"
              icon="search-x"
              title={tagNoMatchTitle(query)}
            />
          ),
        };

      case "ready":
        return {
          centered: false,
          content: (
            <FlatList
              testID="tag-list"
              data={matched}
              keyExtractor={(tag) => tag.key}
              renderItem={renderItem}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              refreshControl={refreshControl}
              contentContainerStyle={[
                styles.listContent,
                { paddingBottom: insets.bottom + theme.spacing[6] },
              ]}
              showsVerticalScrollIndicator={false}
            />
          ),
        };

      default: {
        const exhaustiveCheck: never = bodyState;
        return exhaustiveCheck;
      }
    }
  };

  const body = renderBody();
  const showSearch = isSignedIn && source.status === "ready" && tags.length > 0;

  return (
    <View
      testID="tag-list-screen"
      style={[styles.root, { paddingTop: insets.top + theme.spacing[2] }]}
    >
      <View style={styles.header}>
        <IconButton
          icon="chevron-left"
          label="戻る"
          variant="ghost"
          onPress={back.goBack}
          testID="tag-list-back"
        />
        <Text accessibilityRole="header" style={styles.title}>
          タグ一覧
        </Text>
        <View style={styles.headerSpacer} />
      </View>
      {showSearch ? (
        <View style={styles.search}>
          <NameSearchField
            value={query}
            onChangeText={setQuery}
            placeholder="タグの名前で検索"
            accessibilityLabel="タグの名前で検索"
            testID="tag-list-search-input"
          />
          {source.truncated ? (
            <Text style={styles.metaText} testID="tag-list-truncated">
              {TAG_PINS_TRUNCATED_NOTICE}
            </Text>
          ) : null}
        </View>
      ) : null}
      {body.centered ? (
        body.refreshable ? (
          <ScrollView
            style={styles.centerScroll}
            contentContainerStyle={styles.centerScrollContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            refreshControl={refreshControl}
            showsVerticalScrollIndicator={false}
          >
            {body.content}
          </ScrollView>
        ) : (
          <View style={styles.centerContent}>{body.content}</View>
        )
      ) : (
        body.content
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
  search: {
    paddingHorizontal: theme.layout.pageGutter,
    paddingBottom: theme.spacing[2],
    gap: theme.spacing[2],
  },
  metaText: {
    fontSize: theme.typography.size.xs,
    color: theme.colors.textSecondary,
  },
  centerContent: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: theme.layout.pageGutter,
  },
  centerScroll: {
    flex: 1,
  },
  centerScrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: theme.layout.pageGutter,
  },
  centerState: {
    alignItems: "center",
  },
  listContent: {
    paddingHorizontal: theme.layout.pageGutter,
    paddingTop: theme.spacing[1],
  },
}));
