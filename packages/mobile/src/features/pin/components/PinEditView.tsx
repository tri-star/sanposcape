import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/button/Button";
import { Icon } from "@/components/ui/icon/Icon";
import { IconButton } from "@/components/ui/icon-button/IconButton";
import { Input } from "@/components/ui/input/Input";
import { ProgressBar } from "@/components/ui/progress-bar/ProgressBar";
import { ToastOverlay } from "@/components/ui/toast/ToastOverlay";
import { PinEditDiscardDialog } from "@/features/pin/components/PinEditDiscardDialog";
import { PinEditExistingPhotos } from "@/features/pin/components/PinEditExistingPhotos";
import { PinPhotoGrid } from "@/features/pin/components/PinPhotoGrid";
import { PinStateCard } from "@/features/pin/components/PinStateCard";
import { SanpoMapSelector } from "@/features/pin/components/SanpoMapSelector";
import { PinStatusFields } from "@/features/pin/components/PinStatusFields";
import { PinTagEditor } from "@/features/pin/components/PinTagEditor";
import { usePinEdit } from "@/features/pin/hooks/usePinEdit";
import { resolvePinDetailBodyState } from "@/features/pin/lib/pinDetailState";
import { PIN_EDIT_SANPO_MAP_TITLE, pinEditSavedMessage } from "@/features/pin/lib/pinEditSanpoMap";
import { resolvePinEditBodyError } from "@/features/pin/lib/pinEditSync";
import { saveUnavailableMessage } from "@/features/pin/lib/pinDraftValidation";
import {
  canManuallyRetryPinEdit,
  pinEditErrorMessage,
  pinEditProgressLabel,
} from "@/features/pin/lib/pinEditError";
import { isRetriablePinReadError, pinReadErrorMessage } from "@/features/pin/lib/pinReadError";
import { useScreenBack } from "@/hooks/useScreenBack";
import { useToast } from "@/hooks/useToast";
import { setFlashMessage } from "@/lib/flashMessage";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

export type PinEditViewProps = {
  /** ルートで isUuid を通した値。不正なら null。 */
  pinId: string | null;
  isSignedIn: boolean;
  /** ルートが認証ストアから読んで注入する（権限による出し分けに使う）。 */
  currentUserId: string | null;
  onSignIn: () => void;
};

type PinEditBody = { content: ReactNode; centered: boolean };

const FIELDS_LOCKED_HELPER = "名前とメモは、ピンを作った人と地図の持ち主だけが変更できます";
const NAME_HELPER = "空欄にすると名前のないピンになります";

/**
 * PinEditView — `/pins/[pinId]/edit`（ピン編集）の実体（SS-119）。
 * 名前・メモ・タグ・写真・地図（SS-175）の変更を、最後の「変更を保存」でまとめて反映する。
 * 登録画面（`PinRegisterView`）は流用せず、部品（Input・PinTagEditor・PinPhotoGrid）だけを再利用する。
 */
export function PinEditView({ pinId, isSignedIn, currentUserId, onSignIn }: PinEditViewProps) {
  const theme = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const [discardOpen, setDiscardOpen] = useState(false);

  const edit = usePinEdit({
    pinId,
    isSignedIn,
    currentUserId,
    onSaved: ({ movedToSanpoMapName }) => {
      setFlashMessage(pinEditSavedMessage(movedToSanpoMapName));
      back.runOnce(() =>
        router.canGoBack()
          ? router.back()
          : router.replace(
              pinId !== null ? { pathname: "/pins/[pinId]", params: { pinId } } : "/(tabs)",
            ),
      );
    },
    onPickerError: (message) => toast.show(message),
  });
  const { save } = edit;

  // 注意: `discardOpen` 中の Android のハードウェアバックは Dialog（RN Modal）の onRequestClose が
  // 先に消費するため、その分岐はこの経路では実質到達しない。画面上の戻るボタン等 Modal を経由しない
  // 経路向けの保険として同じ規律で書く（PinRegisterView と同じ）。
  const back = useScreenBack({
    fallbackHref: pinId !== null ? { pathname: "/pins/[pinId]", params: { pinId } } : "/(tabs)",
    onIntercept: () => {
      // 保存中は戻らない（消費のみ）。
      if (save.status === "saving") return true;
      if (discardOpen) {
        setDiscardOpen(false);
        return true;
      }
      if (edit.hasUnsavedChanges && save.status !== "saved") {
        setDiscardOpen(true);
        return true;
      }
      return false;
    },
  });

  const handleDiscard = () => {
    setDiscardOpen(false);
    back.runOnce(() =>
      router.canGoBack()
        ? router.back()
        : router.replace(
            pinId !== null ? { pathname: "/pins/[pinId]", params: { pinId } } : "/(tabs)",
          ),
    );
  };

  const bodyErrorCode = resolvePinEditBodyError(edit.detail.errorCode, edit.baseline !== null);
  const bodyState = resolvePinDetailBodyState({
    hasPinId: pinId !== null,
    isSignedIn,
    // 基準値の確定後は、バックグラウンド再取得の失敗でフォームを消さない（A-3）。
    errorCode: bodyErrorCode,
    isLoading: edit.detail.isLoading,
    hasPin: edit.baseline !== null,
  });

  const isSaving = save.status === "saving";
  const permissions = edit.permissions;
  const saveDisabled =
    !edit.saveAvailability.canSave ||
    save.status === "saved" ||
    (save.status === "error" &&
      save.errorCode !== null &&
      !canManuallyRetryPinEdit(save.errorCode));
  const saveLabel = isSaving
    ? save.progress
      ? pinEditProgressLabel(save.progress)
      : "保存しています…"
    : save.status === "error" && save.errorCode !== null && canManuallyRetryPinEdit(save.errorCode)
      ? "もう一度保存する"
      : "変更を保存";
  const unavailableMessage =
    edit.saveAvailability.canSave || edit.saveAvailability.reason === "no_changes"
      ? null
      : saveUnavailableMessage(edit.saveAvailability.reason);

  const progressValue = (() => {
    if (!save.progress) return { value: 0, max: 1 };
    switch (save.progress.step) {
      case "updating":
        return { value: 0, max: 1 };
      case "deleting_photos":
        return { value: save.progress.done, max: Math.max(save.progress.total, 1) };
      case "sending_photos":
        return { value: save.progress.sent, max: Math.max(save.progress.total, 1) };
    }
  })();

  const loadingBody = (): PinEditBody => ({
    centered: true,
    content: (
      <View style={styles.centerState} testID="pin-edit-loading">
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    ),
  });

  const goBackAction = { label: "戻る", onPress: back.goBack, testID: "pin-edit-go-back" };

  const renderForm = (): PinEditBody => {
    // 詳細が取れるまでは null（baseline も null なので通常は到達しない）。
    if (permissions === null) return loadingBody();
    const markedCount = edit.draft.photoIdsToDelete.length;
    const detail = edit.detail;

    return {
      centered: false,
      content: (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            style={styles.flex}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
            showsVerticalScrollIndicator={false}
            testID="pin-edit-form"
          >
            <View style={styles.field}>
              <Input
                label="名前"
                placeholder="例：桜のトンネル"
                helper={permissions.canEditFields ? NAME_HELPER : FIELDS_LOCKED_HELPER}
                value={edit.draft.name}
                onChangeText={edit.setName}
                error={edit.fieldErrors.name ?? undefined}
                disabled={isSaving || !permissions.canEditFields}
                testID="pin-edit-name-input"
              />
            </View>

            <View style={styles.field}>
              <Input
                label="メモ"
                multiline
                placeholder="この場所のメモ"
                value={edit.draft.memo}
                onChangeText={edit.setMemo}
                error={edit.fieldErrors.memo ?? undefined}
                disabled={isSaving || !permissions.canEditFields}
                testID="pin-edit-memo-input"
              />
            </View>

            <PinStatusFields
              visited={edit.draft.visited}
              archived={edit.draft.archived}
              onChangeVisited={edit.setVisited}
              onChangeArchived={edit.setArchived}
              visitedDisabled={isSaving || !permissions.canEditVisited}
              archivedDisabled={isSaving || !permissions.canArchive}
              archiveLocked={!permissions.canArchive}
              testID="pin-edit-status"
            />

            <SanpoMapSelector
              title={PIN_EDIT_SANPO_MAP_TITLE}
              state={edit.sanpoMaps}
              onSelect={edit.selectSanpoMap}
              onRetry={edit.sanpoMaps.retry}
              disabled={isSaving || !permissions.canChangeSanpoMap}
              testID="pin-edit-sanpo-map"
            />

            <PinTagEditor
              tags={edit.draft.tags}
              input={edit.tagInput}
              error={edit.tagError}
              suggestions={edit.tagSuggestions}
              onChangeInput={edit.setTagInput}
              onAdd={edit.addTagFromInput}
              onSelectSuggestion={edit.addTagFromSuggestion}
              onRemove={edit.removeTag}
              canRemove={edit.canRemoveTag}
              disabled={isSaving || !permissions.canAddTags}
              testID="pin-edit-tag"
            />

            <PinEditExistingPhotos
              items={edit.existingPhotos}
              photoCount={detail.photoCount}
              markedCount={markedCount}
              hasMore={detail.hasMorePhotos}
              isLoadingMore={detail.isLoadingMorePhotos}
              loadMoreErrorMessage={
                detail.photosErrorCode !== null ? pinReadErrorMessage(detail.photosErrorCode) : null
              }
              onToggleDeletion={edit.togglePhotoDeletion}
              onLoadMore={detail.loadMorePhotos}
              onImageError={detail.handlePhotoLoadError}
              disabled={isSaving}
              testID="pin-edit-existing-photos"
            />

            <PinPhotoGrid
              title="写真を追加"
              items={edit.newPhotos.items}
              summary={edit.newPhotos.summary}
              onAdd={edit.newPhotos.addPhotos}
              onRemove={edit.newPhotos.removePhoto}
              onRetry={edit.newPhotos.retryPhoto}
              disabled={isSaving || !permissions.canAddPhotos}
              testID="pin-edit-photo"
            />

            {save.status === "error" && save.errorCode !== null && save.errorStage !== null ? (
              <View style={styles.errorRow} testID="pin-edit-save-error">
                <Icon name="alert-circle" />
                <Text style={styles.errorText}>
                  {pinEditErrorMessage(save.errorCode, save.errorStage)}
                </Text>
                {save.errorCode === "unauthorized" ? (
                  <Button variant="secondary" size="sm" onPress={onSignIn}>
                    サインイン
                  </Button>
                ) : null}
                {save.errorCode === "pin_not_found" ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onPress={back.goBack}
                    testID="pin-edit-go-back"
                  >
                    戻る
                  </Button>
                ) : null}
              </View>
            ) : null}

            <View style={styles.saveArea}>
              {isSaving && save.progress ? (
                <ProgressBar
                  testID="pin-edit-save-progress"
                  value={progressValue.value}
                  max={progressValue.max}
                />
              ) : null}
              <Button
                variant="primary"
                icon="check"
                fullWidth
                disabled={saveDisabled}
                onPress={edit.submit}
                testID="pin-edit-save"
              >
                {saveLabel}
              </Button>
              {unavailableMessage ? <Text style={styles.helper}>{unavailableMessage}</Text> : null}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      ),
    };
  };

  const renderBody = (): PinEditBody => {
    switch (bodyState) {
      case "invalid-id":
        return {
          centered: true,
          content: (
            <PinStateCard
              testID="pin-edit-error"
              icon="alert-circle"
              tone="danger"
              title="ピンを特定できませんでした"
              action={goBackAction}
            />
          ),
        };

      case "sign-in-required":
        return {
          centered: true,
          content: (
            <PinStateCard
              testID="pin-edit-sign-in-required"
              icon="user"
              title="ピンの編集にはサインインが必要です"
              action={{ label: "サインイン", onPress: onSignIn, testID: "pin-edit-sign-in" }}
            />
          ),
        };

      case "not-found":
        return {
          centered: true,
          content: (
            <PinStateCard
              testID="pin-edit-error"
              icon="alert-circle"
              tone="danger"
              title={pinReadErrorMessage("not_found")}
              action={goBackAction}
            />
          ),
        };

      case "error": {
        const errorCode = bodyErrorCode;
        if (errorCode === null) return loadingBody();
        return {
          centered: true,
          content: (
            <PinStateCard
              testID="pin-edit-error"
              icon="alert-circle"
              tone="danger"
              title={pinReadErrorMessage(errorCode)}
              action={
                isRetriablePinReadError(errorCode)
                  ? { label: "再試行", onPress: edit.detail.retry, testID: "pin-edit-retry" }
                  : undefined
              }
            />
          ),
        };
      }

      case "loading":
        return loadingBody();

      case "ready":
        return edit.baseline === null ? loadingBody() : renderForm();

      case "deleted":
        // 編集画面は deleteStatus を渡さないので到達しない（型の網羅のため）。
        return loadingBody();

      default: {
        const exhaustiveCheck: never = bodyState;
        return exhaustiveCheck;
      }
    }
  };

  const body = renderBody();

  return (
    <View testID="pin-edit-screen" style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + theme.spacing[2] }]}>
        <IconButton
          icon="chevron-left"
          label="戻る"
          variant="ghost"
          onPress={back.goBack}
          testID="pin-edit-back"
        />
        <Text style={styles.title}>ピンを編集</Text>
        <View style={styles.headerSpacer} />
      </View>
      {body.centered ? <View style={styles.centerContent}>{body.content}</View> : body.content}

      <PinEditDiscardDialog
        open={discardOpen}
        partiallySaved={save.partiallySaved}
        onCancel={() => setDiscardOpen(false)}
        onDiscard={handleDiscard}
      />

      <ToastOverlay message={toast.message} visible={toast.visible} bottom={insets.bottom + 24} />
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    flex: 1,
    backgroundColor: theme.colors.surfaceApp,
  },
  flex: {
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
  content: {
    gap: theme.spacing[4],
    paddingTop: theme.spacing[2],
  },
  field: {
    paddingHorizontal: theme.layout.pageGutter,
  },
  errorRow: {
    marginHorizontal: theme.layout.pageGutter,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: theme.spacing[2],
    padding: theme.spacing[3],
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dangerTint,
  },
  errorText: {
    flex: 1,
    fontSize: theme.typography.size.sm,
    color: theme.colors.danger,
  },
  saveArea: {
    marginHorizontal: theme.layout.pageGutter,
    gap: theme.spacing[2],
  },
  helper: {
    fontSize: theme.typography.size.xs,
    color: theme.colors.textTertiary,
    textAlign: "center",
  },
}));
