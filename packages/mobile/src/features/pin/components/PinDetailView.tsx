import { useFocusEffect, useRouter } from "expo-router";
import type { ReactNode } from "react";
import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/button/Button";
import { Card } from "@/components/ui/card/Card";
import { Icon } from "@/components/ui/icon/Icon";
import { IconButton } from "@/components/ui/icon-button/IconButton";
import { Tag } from "@/components/ui/tag/Tag";
import { ToastOverlay } from "@/components/ui/toast/ToastOverlay";
import { PinDeleteDialog } from "@/features/pin/components/PinDeleteDialog";
import { PinLocationPreview } from "@/features/pin/components/PinLocationPreview";
import { PinPhotoGallery } from "@/features/pin/components/PinPhotoGallery";
import { PinPhotoViewer } from "@/features/pin/components/PinPhotoViewer";
import { PinStateCard } from "@/features/pin/components/PinStateCard";
import { usePinDelete } from "@/features/pin/hooks/usePinDelete";
import { usePinDetail } from "@/features/pin/hooks/usePinDetail";
import { useSanpoMaps } from "@/features/pin/hooks/useSanpoMaps";
import { DEFAULT_SANPO_MAP_ICON, sanpoMapIconFor } from "@/features/pin/lib/sanpoMapIcon";
import { PIN_DELETE_DONE_TITLE } from "@/features/pin/lib/pinDeleteError";
import {
  canShowPinActions,
  formatPinCreatedAt,
  pinDisplayName,
  resolvePinDetailBodyState,
} from "@/features/pin/lib/pinDetailState";
import { resolvePinPermissions, resolvePinRole } from "@/features/pin/lib/pinPermissions";
import { clampViewerIndex } from "@/features/pin/lib/pinPhotoViewer";
import { isRetriablePinReadError, pinReadErrorMessage } from "@/features/pin/lib/pinReadError";
import type { UseScreenBackResult } from "@/hooks/useScreenBack";
import { useScreenBack } from "@/hooks/useScreenBack";
import { useToast } from "@/hooks/useToast";
import { consumeFlashMessage, setFlashMessage } from "@/lib/flashMessage";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

export type PinDetailViewProps = {
  /** ルートで isUuid を通した値。不正なら null。 */
  pinId: string | null;
  isSignedIn: boolean;
  /** ルートが認証ストアから読んで注入する（権限による導線の出し分けに使う。SS-119）。 */
  currentUserId: string | null;
  onSignIn: () => void;
};

/** `renderBody()` の戻り値。中央寄せするかどうかの判断をここ1箇所に閉じる（`WalkDetailView` と同じ形）。 */
type PinDetailBody = { content: ReactNode; centered: boolean };

/** PinDetailView — `/pins/[pinId]`（ピン詳細）の実体（SS-118。モックの `isDetail`）。 */
export function PinDetailView({ pinId, isSignedIn, currentUserId, onSignIn }: PinDetailViewProps) {
  const theme = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // useScreenBack より前に usePinDelete を宣言する（`WalkDetailView` と同じ）。onIntercept は削除ダイアログの
  // 状態を参照し、onDeleted は back.runOnce を呼ぶという相互参照を、back の参照だけ ref に逃がして解く。
  const backRef = useRef<UseScreenBackResult | null>(null);
  const deletion = usePinDelete(pinId, {
    onDeleted: () => {
      setDeleteDialogOpen(false);
      // 消えた詳細に戻れてしまわないよう、開く前の画面（ピンタブ・ナビタブ・地図詳細）へ戻る。
      // 文言は戻り先が flash として消費して出す（この画面は消えるので自分では出せない）。
      setFlashMessage(PIN_DELETE_DONE_TITLE);
      backRef.current?.runOnce(() =>
        router.canGoBack() ? router.back() : router.replace("/(tabs)"),
      );
    },
  });
  const closeDeleteDialog = () => {
    setDeleteDialogOpen(false);
    // 失敗表示を残したまま再オープンしないよう、閉じるタイミングで mutation もリセットする。
    deletion.reset();
  };

  // 削除後は取り直さない（消えたピンの詳細を取りに行って 404 になるのを避ける）。
  const detail = usePinDetail(pinId, { enabled: isSignedIn && deletion.status !== "deleted" });

  // 権限: 地図の role は GET /sanpo-maps のキャッシュから引く（不明は editor 扱い。ADR-M-017）。
  const maps = useSanpoMaps({ enabled: isSignedIn });
  const permissions =
    detail.pin !== null
      ? resolvePinPermissions(
          { role: resolvePinRole(maps.maps, detail.pin.sanpoMapId), currentUserId },
          detail.pin,
        )
      : null;

  // ピンの地図のアイコン。一覧が未取得の間は既定のピンで描き、届いたら作り直される（SS-172）。
  const markerIcon =
    detail.pin !== null
      ? sanpoMapIconFor(maps.maps, detail.pin.sanpoMapId)
      : DEFAULT_SANPO_MAP_ICON;

  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  // 写真の同時削除などで件数が減っても、レンダー中に viewerIndex を収める（0件なら閉じる）。
  if (viewerIndex !== null) {
    const clamped = clampViewerIndex(viewerIndex, detail.photos.length);
    if (clamped !== viewerIndex) {
      setViewerIndex(clamped);
    }
  }

  // 注意: 削除ダイアログ表示中の Android バックは Dialog（RN Modal）の onRequestClose が先に消費する。
  // ここの分岐は画面上の戻るボタン等 Modal を経由しない経路向けの保険として、同じ規律で書く。
  const back = useScreenBack({
    fallbackHref: "/(tabs)",
    onIntercept: () => {
      // ダイアログ → ビューアの順。削除中は閉じさせない（消費のみ）。
      if (deleteDialogOpen) {
        if (deletion.status !== "deleting") closeDeleteDialog();
        return true;
      }
      if (viewerIndex === null) return false;
      setViewerIndex(null);
      return true;
    },
  });
  backRef.current = back;

  // 編集画面（保存後）・ピン削除後に戻った先でのトースト。画面またぎのメッセージ受け渡し
  // （`src/lib/flashMessage.ts` 参照）。
  const { show: showToast } = toast;
  useFocusEffect(
    useCallback(() => {
      const message = consumeFlashMessage();
      if (message) showToast(message);
    }, [showToast]),
  );

  const handleEdit = () => {
    if (pinId === null) return;
    back.runOnce(() => router.push({ pathname: "/pins/[pinId]/edit", params: { pinId } }));
  };

  const bodyState = resolvePinDetailBodyState({
    hasPinId: pinId !== null,
    isSignedIn,
    errorCode: detail.errorCode,
    isLoading: detail.isLoading,
    hasPin: detail.pin !== null,
    deleteStatus: deletion.status,
  });

  // 編集は削除より頻度が高いので、指の届きやすい画面下部に固定する。削除は取り消せないので
  // ヘッダー右端のアイコンに置き、確認ダイアログを必ず経由する（ADR-M-017 D6）。
  const showActions = canShowPinActions(bodyState);
  const showEditFooter = showActions && permissions?.canOpenEditor === true;
  const showDeleteButton = showActions && permissions?.canDeletePin === true;

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

      case "deleted":
        return {
          centered: true,
          content: (
            <PinStateCard
              testID="pin-detail-deleted"
              icon="check-circle-2"
              title={PIN_DELETE_DONE_TITLE}
            />
          ),
        };

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
                // 下部の編集ボタンがあるときは、セーフエリアの余白はフッター側で取る。
                { paddingBottom: (showEditFooter ? 0 : insets.bottom) + theme.spacing[6] },
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
                photoCount={detail.photoCount}
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
                markerIcon={markerIcon}
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
  const viewerOpen = viewerIndex !== null && detail.photos.length > 0;

  return (
    <View testID="pin-detail-screen" style={styles.root}>
      {/* ビューアを開いている間は、背後（ヘッダー・本文）をスクリーンリーダーから隠す（Android）。
          iOS はビューア側の accessibilityViewIsModal で分離する（PinRegisterView の位置調整
          オーバーレイと同じ。PR #105 レビュー）。 */}
      <View
        style={styles.main}
        importantForAccessibility={viewerOpen ? "no-hide-descendants" : "auto"}
      >
        <View style={[styles.header, { paddingTop: insets.top + theme.spacing[2] }]}>
          <IconButton
            icon="chevron-left"
            label="戻る"
            variant="ghost"
            onPress={back.goBack}
            testID="pin-detail-back"
          />
          <Text style={styles.title}>ピンの詳細</Text>
          {showDeleteButton ? (
            <IconButton
              icon="trash-2"
              label="このピンを削除"
              variant="ghost"
              disabled={deletion.status === "deleting"}
              onPress={() => setDeleteDialogOpen(true)}
              testID="pin-detail-delete"
            />
          ) : (
            <View style={styles.headerSpacer} />
          )}
        </View>
        {body.centered ? <View style={styles.centerContent}>{body.content}</View> : body.content}
        {showEditFooter ? (
          <View
            style={[styles.footer, { paddingBottom: insets.bottom + theme.spacing[3] }]}
            testID="pin-detail-footer"
          >
            <Button icon="pencil" fullWidth onPress={handleEdit} testID="pin-detail-edit">
              このピンを編集
            </Button>
          </View>
        ) : null}
      </View>
      {viewerOpen && viewerIndex !== null ? (
        <PinPhotoViewer
          photos={detail.photos}
          index={viewerIndex}
          photoCount={detail.photoCount}
          hasMore={detail.hasMorePhotos}
          isLoadingMore={detail.isLoadingMorePhotos}
          onChangeIndex={setViewerIndex}
          onLoadMore={detail.loadMorePhotos}
          onClose={() => setViewerIndex(null)}
          onImageError={detail.handlePhotoLoadError}
        />
      ) : null}
      {/* マウント条件は open の boolean だけにする（bodyState で条件付きにすると、削除成功で
          "deleted" に変わった瞬間にダイアログがちらつく。WalkDetailView と同じ）。 */}
      <PinDeleteDialog
        open={deleteDialogOpen}
        status={deletion.status}
        errorCode={deletion.errorCode}
        onCancel={closeDeleteDialog}
        onConfirm={deletion.deletePin}
      />
      <ToastOverlay
        message={toast.message}
        visible={toast.visible}
        // 下部の編集ボタンと重ならないよう、その分だけ上げる。
        bottom={insets.bottom + 24 + (showEditFooter ? theme.control.md + theme.spacing[3] * 2 : 0)}
      />
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    flex: 1,
    backgroundColor: theme.colors.surfaceApp,
  },
  main: {
    flex: 1,
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
  footer: {
    paddingHorizontal: theme.layout.pageGutter,
    paddingTop: theme.spacing[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.surfaceApp,
  },
}));
