import type { ReactNode } from "react";
import { useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Card } from "@/components/ui/card/Card";
import { Icon } from "@/components/ui/icon/Icon";
import { IconButton } from "@/components/ui/icon-button/IconButton";
import { Tag } from "@/components/ui/tag/Tag";
import { PinLocationPreview } from "@/features/pin/components/PinLocationPreview";
import { PinPhotoGallery } from "@/features/pin/components/PinPhotoGallery";
import { PinPhotoViewer } from "@/features/pin/components/PinPhotoViewer";
import { PinStateCard } from "@/features/pin/components/PinStateCard";
import { usePinDetail } from "@/features/pin/hooks/usePinDetail";
import {
  formatPinCreatedAt,
  pinDisplayName,
  resolvePinDetailBodyState,
} from "@/features/pin/lib/pinDetailState";
import { clampViewerIndex } from "@/features/pin/lib/pinPhotoViewer";
import { isRetriablePinReadError, pinReadErrorMessage } from "@/features/pin/lib/pinReadError";
import { useScreenBack } from "@/hooks/useScreenBack";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

export type PinDetailViewProps = {
  /** ルートで isUuid を通した値。不正なら null。 */
  pinId: string | null;
  isSignedIn: boolean;
  onSignIn: () => void;
};

/** `renderBody()` の戻り値。中央寄せするかどうかの判断をここ1箇所に閉じる（`WalkDetailView` と同じ形）。 */
type PinDetailBody = { content: ReactNode; centered: boolean };

/** PinDetailView — `/pins/[pinId]`（ピン詳細）の実体（SS-118。モックの `isDetail`）。 */
export function PinDetailView({ pinId, isSignedIn, onSignIn }: PinDetailViewProps) {
  const theme = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const detail = usePinDetail(pinId, { enabled: isSignedIn });

  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  // 写真の同時削除などで件数が減っても、レンダー中に viewerIndex を収める（0件なら閉じる）。
  if (viewerIndex !== null) {
    const clamped = clampViewerIndex(viewerIndex, detail.photos.length);
    if (clamped !== viewerIndex) {
      setViewerIndex(clamped);
    }
  }

  const back = useScreenBack({
    fallbackHref: "/(tabs)",
    onIntercept: () => {
      if (viewerIndex === null) return false;
      setViewerIndex(null);
      return true;
    },
  });

  const bodyState = resolvePinDetailBodyState({
    hasPinId: pinId !== null,
    isSignedIn,
    errorCode: detail.errorCode,
    isLoading: detail.isLoading,
    hasPin: detail.pin !== null,
  });

  const loadingBody = (): PinDetailBody => ({
    centered: true,
    content: (
      <View style={styles.centerState} testID="pin-detail-loading">
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    ),
  });

  const renderBody = (): PinDetailBody => {
    switch (bodyState) {
      case "invalid-id":
        return {
          centered: true,
          content: (
            <PinStateCard
              testID="pin-detail-error"
              icon="alert-circle"
              tone="danger"
              title="ピンを特定できませんでした"
              action={{ label: "地図へ戻る", onPress: back.goBack, testID: "pin-detail-go-back" }}
            />
          ),
        };

      case "sign-in-required":
        return {
          centered: true,
          content: (
            <PinStateCard
              testID="pin-detail-sign-in-required"
              icon="user"
              title="ピンの表示にはサインインが必要です"
              action={{ label: "サインイン", onPress: onSignIn, testID: "pin-detail-sign-in" }}
            />
          ),
        };

      case "not-found":
        return {
          centered: true,
          content: (
            <PinStateCard
              testID="pin-detail-error"
              icon="alert-circle"
              tone="danger"
              title={pinReadErrorMessage("not_found")}
              action={{ label: "地図へ戻る", onPress: back.goBack, testID: "pin-detail-go-back" }}
            />
          ),
        };

      case "error": {
        const errorCode = detail.errorCode;
        if (errorCode === null) {
          return loadingBody();
        }
        return {
          centered: true,
          content: (
            <PinStateCard
              testID="pin-detail-error"
              icon="alert-circle"
              tone="danger"
              title={pinReadErrorMessage(errorCode)}
              action={
                isRetriablePinReadError(errorCode)
                  ? { label: "再試行", onPress: detail.retry, testID: "pin-detail-retry" }
                  : undefined
              }
            />
          ),
        };
      }

      case "loading":
        return loadingBody();

      case "ready": {
        const pin = detail.pin;
        if (pin === null) {
          return loadingBody();
        }
        const createdAtLabel = formatPinCreatedAt(pin.createdAt);

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
              testID="pin-detail-content"
            >
              <Text style={styles.name} testID="pin-detail-name">
                {pinDisplayName(pin.name)}
              </Text>

              <View style={styles.metaRow}>
                {createdAtLabel !== null ? (
                  <View style={styles.metaLine}>
                    <Icon name="calendar" size={14} color={theme.colors.textTertiary} />
                    <Text style={styles.metaText}>{createdAtLabel}</Text>
                  </View>
                ) : null}
                <Text style={styles.metaText}>{pin.sanpoMapName}</Text>
              </View>

              {pin.tags.length > 0 ? (
                <View style={styles.tagsRow}>
                  {pin.tags.map((tag, i) => (
                    <Tag key={tag.id} category="neutral" icon="tag" testID={`pin-detail-tag-${i}`}>
                      {tag.label}
                    </Tag>
                  ))}
                </View>
              ) : null}

              <PinPhotoGallery
                testID="pin-detail-photos"
                photos={detail.photos}
                photoCount={pin.photoCount}
                hasMore={detail.hasMorePhotos}
                isLoadingMore={detail.isLoadingMorePhotos}
                loadMoreErrorMessage={
                  detail.photosErrorCode !== null
                    ? pinReadErrorMessage(detail.photosErrorCode)
                    : null
                }
                onOpen={setViewerIndex}
                onLoadMore={detail.loadMorePhotos}
                onImageError={detail.handlePhotoLoadError}
              />

              {pin.memo !== null && pin.memo.trim().length > 0 ? (
                <Card testID="pin-detail-memo">
                  <Text style={styles.memoHeading}>メモ</Text>
                  <Text style={styles.memoBody}>{pin.memo}</Text>
                </Card>
              ) : null}

              <PinLocationPreview
                location={pin.location}
                accessibilityLabel="ピンの位置の地図"
                mapHidden={viewerIndex !== null}
                testID="pin-detail-map"
              />

              {detail.photos.length > 0 ? (
                <Text style={styles.hint}>写真をタップすると拡大表示できます</Text>
              ) : null}
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
    <View testID="pin-detail-screen" style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + theme.spacing[2] }]}>
        <IconButton
          icon="chevron-left"
          label="戻る"
          variant="ghost"
          onPress={back.goBack}
          testID="pin-detail-back"
        />
        <Text style={styles.title}>ピンの詳細</Text>
        {/* SS-119 でここに編集ボタンを置く。今は押せて何も起きないボタンを作らないため空のスペーサー。 */}
        <View style={styles.headerSpacer} />
      </View>
      {body.centered ? <View style={styles.centerContent}>{body.content}</View> : body.content}
      {viewerIndex !== null && detail.photos.length > 0 ? (
        <PinPhotoViewer
          photos={detail.photos}
          index={viewerIndex}
          photoCount={detail.pin?.photoCount ?? detail.photos.length}
          hasMore={detail.hasMorePhotos}
          isLoadingMore={detail.isLoadingMorePhotos}
          onChangeIndex={setViewerIndex}
          onLoadMore={detail.loadMorePhotos}
          onClose={() => setViewerIndex(null)}
          onImageError={detail.handlePhotoLoadError}
        />
      ) : null}
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
  name: {
    fontSize: theme.typography.size["2xl"],
    fontWeight: theme.typography.weight.heavy,
    color: theme.colors.textPrimary,
  },
  metaRow: {
    gap: 2,
  },
  metaLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  metaText: {
    fontSize: theme.typography.size.xs,
    color: theme.colors.textTertiary,
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
  memoHeading: {
    fontSize: theme.typography.size.sm,
    fontWeight: theme.typography.weight.bold,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[1],
  },
  memoBody: {
    fontSize: theme.typography.size.md,
    color: theme.colors.textPrimary,
  },
  hint: {
    fontSize: theme.typography.size.xs,
    color: theme.colors.textTertiary,
    textAlign: "center",
  },
}));
