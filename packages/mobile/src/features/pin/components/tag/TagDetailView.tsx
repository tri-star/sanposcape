import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  Text,
  View,
  type ListRenderItemInfo,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "@/components/ui/icon/Icon";
import { IconButton } from "@/components/ui/icon-button/IconButton";
import { PinStateCard } from "@/features/pin/components/PinStateCard";
import { SanpoMapPinListItem } from "@/features/pin/components/SanpoMapPinListItem";
import { usePullToRefresh } from "@/features/pin/hooks/usePullToRefresh";
import { useAllSanpoMapPins } from "@/features/pin/hooks/tag/useAllSanpoMapPins";
import { isRetriablePinReadError } from "@/features/pin/lib/pinReadError";
import { tagKey } from "@/features/pin/lib/pinTags";
import { sanpoMapReadErrorMessage } from "@/features/pin/lib/sanpoMapError";
import { selectPinsWithTag, type TaggedPin } from "@/features/pin/lib/tag/pinTagIndex";
import {
  formatTagPinCount,
  resolveTagDetailBodyState,
  TAG_PINS_TRUNCATED_NOTICE,
} from "@/features/pin/lib/tag/tagScreenState";
import { useScreenBack } from "@/hooks/useScreenBack";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

export type TagDetailViewProps = {
  /** ルートで `parseTagLabelParam` を通した表記。不正なら null。 */
  label: string | null;
  /** ルート（app/tags/detail.tsx）が useAuthSessionStore から注入する（features/pin は認証を読まない）。 */
  isSignedIn: boolean;
  onSignIn: () => void;
};

/** `renderBody()` の戻り値（`SanpoMapListView` と同じ形）。 */
type TagDetailBody = {
  content: ReactNode;
  centered: boolean;
  refreshable?: boolean;
};

/**
 * TagDetailView — タグ詳細（`/tags/detail?label=`。SS-245）の実体。タグ一覧の行・ピン詳細のタグから開く。
 * そのタグ（正規化キーで照合）が付いたピンを全地図から集め、作成日時の新しい順に並べる（地図詳細のピン一覧と同じ）。
 * 行は地図詳細の `SanpoMapPinListItem` に地図（アイコン + 名前）を出して使い、タップでピン詳細へ進む。
 * アーカイブ済みのピンも出す（地図詳細の一覧と同じ。行にバッジが付く。ADR-M-021）。
 */
export function TagDetailView({ label, isSignedIn, onSignIn }: TagDetailViewProps) {
  const theme = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const source = useAllSanpoMapPins({ enabled: isSignedIn && label !== null });
  const pull = usePullToRefresh(source.refresh);
  const back = useScreenBack({ fallbackHref: "/(tabs)/pins" });

  const key = label !== null ? tagKey(label) : null;
  const rows = useMemo(
    () => (key !== null ? selectPinsWithTag(source.groups, key) : []),
    [source.groups, key],
  );

  const bodyState = resolveTagDetailBodyState({
    hasLabel: label !== null,
    isSignedIn,
    status: source.status,
    pinCount: rows.length,
  });

  const { handlePhotoLoadError } = source;
  const handleOpenPin = useCallback(
    (pinId: string) => {
      back.runOnce(() => router.push({ pathname: "/pins/[pinId]", params: { pinId } }));
    },
    [back, router],
  );

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<TaggedPin>) => (
      <SanpoMapPinListItem
        pin={item.pin}
        sanpoMap={item.sanpoMap}
        onPress={handleOpenPin}
        onPhotoError={() => handlePhotoLoadError(item.sanpoMap.id)}
        testID={`tag-detail-pin-${index}`}
      />
    ),
    [handleOpenPin, handlePhotoLoadError],
  );

  const refreshControl = (
    <RefreshControl
      refreshing={pull.refreshing}
      onRefresh={pull.onRefresh}
      tintColor={theme.colors.primary}
    />
  );

  const loadingBody = (): TagDetailBody => ({
    centered: true,
    content: (
      <View style={styles.centerState} testID="tag-detail-loading">
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    ),
  });

  const renderBody = (): TagDetailBody => {
    switch (bodyState) {
      case "invalid-label":
        return {
          centered: true,
          content: (
            <PinStateCard
              testID="tag-detail-invalid"
              icon="search-x"
              title="タグが見つかりませんでした"
            />
          ),
        };

      case "sign-in-required":
        return {
          centered: true,
          content: (
            <PinStateCard
              testID="tag-detail-sign-in-required"
              icon="user"
              title="タグのピンを見るにはサインインが必要です"
              action={{
                label: "サインイン",
                onPress: () => back.runOnce(onSignIn),
                testID: "tag-detail-sign-in",
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
              testID="tag-detail-error"
              icon="alert-circle"
              tone="danger"
              title={sanpoMapReadErrorMessage(errorCode, "pins")}
              action={
                isRetriablePinReadError(errorCode)
                  ? { label: "再試行", onPress: source.retry, testID: "tag-detail-retry" }
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
              testID="tag-detail-empty"
              icon="tag"
              title="このタグが付いたピンはありません"
              description="タグを外した・ピンを削除した可能性があります"
            />
          ),
        };

      case "ready":
        return {
          centered: false,
          content: (
            <FlatList
              testID="tag-detail-pin-list"
              data={rows}
              keyExtractor={(row) => row.pin.id}
              renderItem={renderItem}
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

  return (
    <View
      testID="tag-detail-screen"
      style={[styles.root, { paddingTop: insets.top + theme.spacing[2] }]}
    >
      <TagDetailHeader
        label={label}
        countLabel={bodyState === "ready" ? formatTagPinCount(rows.length) : null}
        onBack={back.goBack}
      />
      {bodyState === "ready" && source.truncated ? (
        <Text style={[styles.metaText, styles.notice]} testID="tag-detail-truncated">
          {TAG_PINS_TRUNCATED_NOTICE}
        </Text>
      ) : null}
      {body.centered ? (
        body.refreshable ? (
          <ScrollView
            style={styles.centerScroll}
            contentContainerStyle={styles.centerScrollContent}
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

/** タグ詳細のヘッダー（戻る・タグの表記・件数）。 */
function TagDetailHeader({
  label,
  countLabel,
  onBack,
}: {
  label: string | null;
  countLabel: string | null;
  onBack: () => void;
}) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.header}>
      <IconButton
        icon="chevron-left"
        label="戻る"
        variant="ghost"
        onPress={onBack}
        testID="tag-detail-back"
      />
      <View style={styles.titleBlock}>
        {label !== null ? (
          <View style={styles.titleRow}>
            <Icon name="tag" size={20} color={theme.colors.textSecondary} />
            <Text
              accessibilityRole="header"
              style={styles.title}
              numberOfLines={1}
              testID="tag-detail-title"
            >
              {label}
            </Text>
          </View>
        ) : null}
        {countLabel !== null ? (
          <Text style={styles.metaText} testID="tag-detail-count">
            {countLabel}
          </Text>
        ) : null}
      </View>
      <View style={styles.headerSpacer} />
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
    gap: theme.spacing[2],
    paddingHorizontal: theme.layout.pageGutter,
    paddingBottom: theme.spacing[2],
  },
  titleBlock: {
    flex: 1,
    alignItems: "center",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    maxWidth: "100%",
  },
  title: {
    flexShrink: 1,
    fontSize: theme.typography.size.xl,
    fontWeight: theme.typography.weight.heavy,
    color: theme.colors.textPrimary,
  },
  headerSpacer: {
    width: theme.control.md,
  },
  metaText: {
    fontSize: theme.typography.size.xs,
    color: theme.colors.textSecondary,
  },
  notice: {
    paddingHorizontal: theme.layout.pageGutter,
    paddingBottom: theme.spacing[2],
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
