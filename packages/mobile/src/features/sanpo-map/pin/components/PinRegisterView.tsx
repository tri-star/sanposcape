import { useRouter } from "expo-router";
import { useState } from "react";
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/button/Button";
import { Icon } from "@/components/ui/icon/Icon";
import { IconButton } from "@/components/ui/icon-button/IconButton";
import { Input } from "@/components/ui/input/Input";
import { ProgressBar } from "@/components/ui/progress-bar/ProgressBar";
import { Switch } from "@/components/ui/switch/Switch";
import { ToastOverlay } from "@/components/ui/toast/ToastOverlay";
import { SanpoMapCreateDialog } from "@/features/sanpo-map/map/components/SanpoMapCreateDialog";
import { PinDiscardDialog } from "@/features/sanpo-map/pin/components/PinDiscardDialog";
import { PinLocationAdjustOverlay } from "@/features/sanpo-map/pin/components/PinLocationAdjustOverlay";
import { PinLocationField } from "@/features/sanpo-map/pin/components/PinLocationField";
import { PinPhotoGrid } from "@/features/sanpo-map/pin/components/PinPhotoGrid";
import { PinSignInRequired } from "@/features/sanpo-map/pin/components/PinSignInRequired";
import { PinTagEditor } from "@/features/sanpo-map/pin/components/PinTagEditor";
import { SanpoMapSelector } from "@/features/sanpo-map/pin/components/SanpoMapSelector";
import { usePinLocationDraft } from "@/features/sanpo-map/pin/hooks/usePinLocationDraft";
import { usePinRegister } from "@/features/sanpo-map/pin/hooks/usePinRegister";
import { canAdjustPinLocation } from "@/features/sanpo-map/pin/lib/pinLocationAdjust";
import {
  canManuallyRetryPinSave,
  pinSaveErrorMessage,
  pinSaveProgressLabel,
} from "@/features/sanpo-map/pin/lib/pinSaveError";
import {
  resolveSelectedSanpoMapIcon,
  toSanpoMapSelection,
} from "@/features/sanpo-map/pin/lib/sanpoMapChoices";
import { saveUnavailableMessage } from "@/features/sanpo-map/pin/lib/pinDraftValidation";
import {
  PIN_REGISTER_VISITED_HELPER,
  PIN_VISITED_SWITCH_LABEL,
} from "@/features/sanpo-map/pin/lib/pinStatus";
import { setFlashMessage } from "@/lib/flashMessage";
import { useScreenBack } from "@/hooks/useScreenBack";
import { useToast } from "@/hooks/useToast";
import { makeStyles } from "@/theme/makeStyles";
import type { GeoCoordinates } from "@/services/location/types";
import type { SanpoMap } from "@/features/sanpo-map/shared/types";

export type PinRegisterViewProps = {
  /** ルートで検証済み。不正なら null。 */
  location: GeoCoordinates | null;
  clientWalkId: string | null;
  /** ルートが useAuthSessionStore から読んで注入する。 */
  isSignedIn: boolean;
  onSignIn: () => void;
};

/** PinRegisterView — ピン登録画面（`/pins/new`）の実体。 */
export function PinRegisterView({
  location,
  clientWalkId,
  isSignedIn,
  onSignIn,
}: PinRegisterViewProps) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const [discardOpen, setDiscardOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  // 地図の新規作成ダイアログ（SS-117。地図一覧と同じ SanpoMapCreateDialog）。開くたびに key を変えて
  // 入力・作成エラーを空に戻す。作成中（ダイアログから通知される）はバックキーでも閉じない。
  const [createOpen, setCreateOpen] = useState(false);
  const [createDialogKey, setCreateDialogKey] = useState(0);
  const [createBusy, setCreateBusy] = useState(false);
  const pinLocation = usePinLocationDraft(location);

  const register = usePinRegister({
    // location が null のときは register hook を無害な既定値で走らせる（下の early return で描画しない）。
    location: pinLocation.location ?? { latitude: 0, longitude: 0 },
    hasLocation: pinLocation.location !== null,
    clientWalkId,
    isSignedIn,
    onSaved: () => {
      setFlashMessage("ピンを保存しました");
      back.runOnce(() => (router.canGoBack() ? router.back() : router.replace("/(tabs)")));
    },
    onPickerError: (message) => toast.show(message),
  });

  // 保存先の地図のアイコン（プレビュー・位置調整のピンの見た目。選び直すと変わる。SS-172）。
  const markerIcon = resolveSelectedSanpoMapIcon(register.sanpoMaps);

  // 注意（SS-88 ローカルレビュー MS1。SS-60 WalkDetailView と同じ既知の RN 挙動）:
  // `discardOpen` 中は Android の hardwareBackPress を `Dialog`（RN `Modal`）の
  // `onRequestClose={onCancel}` が先に消費するため、以下の `discardOpen` 分岐はハードウェア
  // バック経由では実質到達しない可能性が高い。実際に閉じる役割は Dialog 側が独立に担っており、
  // 見た目の挙動（`setDiscardOpen(false)`）は一致するのでバグではない。この分岐は画面上の
  // 戻るボタン・プログラム的な `goBack()` など Modal を経由しない他の経路向けの保険として残す。
  // `register.save.status === "saving"` の分岐は Modal に依存しないため実際に機能する。
  const back = useScreenBack({
    fallbackHref: "/(tabs)",
    onIntercept: () => {
      // saving 中はオーバーレイを開けないので、この分岐を先に見てよい。
      if (adjustOpen) {
        setAdjustOpen(false);
        return true;
      }
      if (register.save.status === "saving") return true;
      // 作成中は閉じず、バック操作だけ消費する（地図一覧と同じ。ADR-M-014 の SS-117 追補）。
      if (createOpen) {
        if (!createBusy) setCreateOpen(false);
        return true;
      }
      if (discardOpen) {
        setDiscardOpen(false);
        return true;
      }
      if (
        (register.hasUnsavedInput || pinLocation.isAdjusted) &&
        register.save.status !== "saved"
      ) {
        setDiscardOpen(true);
        return true;
      }
      return false;
    },
  });

  const handleOpenCreate = () => {
    Keyboard.dismiss();
    setCreateDialogKey((k) => k + 1);
    setCreateOpen(true);
  };

  // 作った地図はキャッシュに入っているので、そのまま保存先に選べる（既定になった地図は default 選択）。
  const handleCreated = (map: SanpoMap) => {
    setCreateOpen(false);
    register.selectSanpoMap(toSanpoMapSelection(map));
    toast.show(`地図「${map.name}」を作成しました`);
  };

  const handleDiscardConfirm = () => {
    setDiscardOpen(false);
    if (register.save.savedPinId !== null) {
      setFlashMessage("ピンを保存しました（一部の写真は保存されていません）");
    }
    back.runOnce(() => (router.canGoBack() ? router.back() : router.replace("/(tabs)")));
  };

  if (location === null) {
    return (
      <View testID="pin-register-screen" style={styles.root}>
        <View style={styles.invalidLocation} testID="pin-register-invalid-location">
          <Icon name="alert-circle" size={28} />
          <Text style={styles.invalidLocationText}>位置情報を取得できませんでした</Text>
          <Button variant="primary" onPress={back.goBack}>
            戻る
          </Button>
        </View>
      </View>
    );
  }

  const isSaving = register.save.status === "saving";
  const saveDisabled =
    !register.saveAvailability.canSave ||
    register.save.status === "saved" ||
    (register.save.status === "error" &&
      register.save.errorCode !== null &&
      !canManuallyRetryPinSave(register.save.errorCode));

  const saveLabel = isSaving
    ? register.save.progress
      ? pinSaveProgressLabel(register.save.progress)
      : "保存しています…"
    : register.save.status === "error" &&
        register.save.errorCode !== null &&
        canManuallyRetryPinSave(register.save.errorCode)
      ? "もう一度保存する"
      : "ピンを保存";

  const unavailableMessage = register.saveAvailability.canSave
    ? null
    : saveUnavailableMessage(register.saveAvailability.reason);

  return (
    <View testID="pin-register-screen" style={styles.root}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        importantForAccessibility={adjustOpen ? "no-hide-descendants" : "auto"}
        accessibilityElementsHidden={adjustOpen}
      >
        <ScrollView
          style={styles.flex}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <IconButton
              icon="chevron-left"
              label="戻る"
              variant="ghost"
              onPress={back.goBack}
              testID="pin-register-back"
            />
            <Text style={styles.title}>ピンを登録</Text>
          </View>

          {!isSignedIn ? (
            <PinSignInRequired onSignIn={onSignIn} />
          ) : (
            <>
              <PinLocationField
                location={pinLocation.location ?? location}
                isAdjusted={pinLocation.isAdjusted}
                adjustable={canAdjustPinLocation({
                  saveStatus: register.save.status,
                  savedPinId: register.save.savedPinId,
                })}
                onRequestAdjust={() => setAdjustOpen(true)}
                previewMapHidden={adjustOpen}
                markerIcon={markerIcon}
                testID="pin-register-location"
              />

              <View style={styles.field}>
                <Input
                  label="名前"
                  placeholder="例：桜のトンネル"
                  helper="空欄なら「名前のないピン」になります"
                  value={register.draft.name}
                  onChangeText={register.setName}
                  error={register.fieldErrors.name ?? undefined}
                  disabled={isSaving}
                  testID="pin-register-name-input"
                />
              </View>

              <View style={styles.field}>
                <Switch
                  label={PIN_VISITED_SWITCH_LABEL}
                  checked={register.draft.visited}
                  onChange={register.setVisited}
                  disabled={isSaving}
                  testID="pin-register-visited-switch"
                />
                <Text style={styles.visitedHelper}>{PIN_REGISTER_VISITED_HELPER}</Text>
              </View>

              <SanpoMapSelector
                state={register.sanpoMaps}
                onSelect={register.selectSanpoMap}
                onRetry={register.sanpoMaps.retry}
                // ピンだけ作れて写真の紐付けを再試行する状態（savedPinId あり）では、再試行は写真だけを送り
                // 地図を選び直しても反映されない。作っても空の地図が増えるだけなので出さない。
                onCreate={register.save.savedPinId === null ? handleOpenCreate : undefined}
                disabled={isSaving}
                testID="pin-register-sanpo-map"
              />

              <PinPhotoGrid
                items={register.photos.items}
                summary={register.photos.summary}
                onAdd={register.photos.addPhotos}
                onRemove={register.photos.removePhoto}
                onRetry={register.photos.retryPhoto}
                disabled={isSaving}
                testID="pin-register-photo"
              />

              <PinTagEditor
                tags={register.draft.tags}
                input={register.tagInput}
                error={register.tagError}
                suggestions={register.tagSuggestions}
                onChangeInput={register.setTagInput}
                onAdd={register.addTagFromInput}
                onSelectSuggestion={register.addTagFromSuggestion}
                onRemove={register.removeTag}
                disabled={isSaving}
                testID="pin-register-tag"
              />

              <View style={styles.field}>
                <Input
                  label="メモ"
                  multiline
                  placeholder="この場所のメモ"
                  value={register.draft.memo}
                  onChangeText={register.setMemo}
                  error={register.fieldErrors.memo ?? undefined}
                  disabled={isSaving}
                  testID="pin-register-memo-input"
                />
              </View>

              {register.save.status === "error" &&
              register.save.errorCode !== null &&
              register.save.errorStage !== null ? (
                <View style={styles.errorRow} testID="pin-register-save-error">
                  <Icon name="alert-circle" />
                  <Text style={styles.errorText}>
                    {pinSaveErrorMessage(register.save.errorCode, register.save.errorStage)}
                  </Text>
                  {register.save.errorCode === "unauthorized" ? (
                    <Button variant="secondary" size="sm" onPress={onSignIn}>
                      サインイン
                    </Button>
                  ) : null}
                </View>
              ) : null}

              <View style={styles.saveArea}>
                {isSaving && register.save.progress ? (
                  <ProgressBar
                    testID="pin-register-save-progress"
                    value={
                      register.save.progress.step === "sending_photos"
                        ? register.save.progress.sent
                        : 0
                    }
                    max={
                      register.save.progress.step === "sending_photos"
                        ? Math.max(register.save.progress.total, 1)
                        : 1
                    }
                  />
                ) : null}
                <Button
                  variant="primary"
                  icon="check"
                  fullWidth
                  disabled={saveDisabled}
                  onPress={register.submit}
                  testID="pin-register-save"
                >
                  {saveLabel}
                </Button>
                {unavailableMessage ? (
                  <Text style={styles.helper}>{unavailableMessage}</Text>
                ) : null}
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {adjustOpen && pinLocation.location !== null ? (
        <PinLocationAdjustOverlay
          initialLocation={pinLocation.location}
          markerIcon={markerIcon}
          onCancel={() => setAdjustOpen(false)}
          onConfirm={(picked) => {
            pinLocation.apply(picked);
            // 他の入力変更と同じく、保存エラー状態を解除する（PR #93 T8 の方針）。
            register.save.resetError();
            setAdjustOpen(false);
          }}
        />
      ) : null}

      <SanpoMapCreateDialog
        key={createDialogKey}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={handleCreated}
        onBusyChange={setCreateBusy}
        testIDPrefix="pin-register-sanpo-map-create"
      />

      <PinDiscardDialog
        open={discardOpen}
        pinAlreadySaved={register.save.savedPinId !== null}
        onCancel={() => setDiscardOpen(false)}
        onDiscard={handleDiscardConfirm}
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
  content: {
    gap: theme.spacing[4],
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    paddingHorizontal: theme.layout.pageGutter,
  },
  title: {
    fontSize: theme.typography.size.xl,
    fontWeight: theme.typography.weight.heavy,
    color: theme.colors.textPrimary,
  },
  field: {
    paddingHorizontal: theme.layout.pageGutter,
  },
  visitedHelper: {
    marginTop: theme.spacing[1],
    fontSize: theme.typography.size.xs,
    color: theme.colors.textTertiary,
  },
  invalidLocation: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[4],
    padding: theme.layout.pageGutter,
  },
  invalidLocationText: {
    fontSize: theme.typography.size.md,
    color: theme.colors.textSecondary,
    textAlign: "center",
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
