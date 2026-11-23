import { useFocusEffect, useRouter } from "expo-router";
import type { ReactNode } from "react";
import { useCallback, useState } from "react";
import { ActivityIndicator, Keyboard, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconButton } from "@/components/ui/icon-button/IconButton";
import { ToastOverlay } from "@/components/ui/toast/ToastOverlay";
import { SanpoMapDeleteDialog } from "@/features/sanpo-map/map/components/SanpoMapDeleteDialog";
import { SanpoMapDetailContent } from "@/features/sanpo-map/map/components/SanpoMapDetailContent";
import { SanpoMapDetailStateCard } from "@/features/sanpo-map/map/components/SanpoMapDetailStateCard";
import { SanpoMapIconEditDialog } from "@/features/sanpo-map/map/components/SanpoMapIconEditDialog";
import { useSanpoMapDetail } from "@/features/sanpo-map/map/hooks/useSanpoMapDetail";
import { SANPO_MAP_DELETE_BUTTON_LABEL } from "@/features/sanpo-map/map/lib/sanpoMapDelete";
import { canManageSanpoMap } from "@/features/sanpo-map/pin/lib/pinPermissions";
import { useScreenBack } from "@/hooks/useScreenBack";
import { useToast } from "@/hooks/useToast";
import { consumeFlashMessage } from "@/lib/flashMessage";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

export type SanpoMapDetailViewProps = {
  /** ルートで isUuid を通した値。不正なら null。 */
  sanpoMapId: string | null;
  isSignedIn: boolean;
  onSignIn: () => void;
};

/** `renderBody()` の戻り値。中央寄せするかどうかの判断をここ1箇所に閉じる。 */
type SanpoMapDetailBody = {
  content: ReactNode;
  centered: boolean;
  /** centered の本文を引っ張って更新できるようにする（ScrollView で包む）。 */
  refreshable?: boolean;
};

/**
 * SanpoMapDetailView — 地図詳細（`/sanpo-maps/[sanpoMapId]`）の実体（SS-121）。
 * 地図の情報と、その地図のピン一覧（新しい順。ピン名で即時に絞り込み、タップでピン詳細へ）。
 *
 * - 地図の情報は地図一覧のキャッシュから id で引く（`GET /sanpo-maps/{id}` は無い。ADR-M-014 D3）。
 * - ピン一覧は全件（上限 1000）を1回の取得で揃え、端末で絞り込む（D1 / D2）。
 * - 認証は props で受ける（features/sanpo-map は認証を読まない）。
 * - メンバーの行（SS-249）を出す。
 * - アイコンの変更は、アイコンそのもののタップで開く（owner だけ。右下にペンのバッジ。SS-249）。
 * - 地図の削除はヘッダー右のゴミ箱から確認ダイアログを開く（owner だけ。SS-265）。消したら地図一覧へ戻り、
 *   一覧で「『…』を削除しました」を出す。消した後は、この地図のピン・メンバーを取り直さない（404 を踏む）。
 */
export function SanpoMapDetailView({ sanpoMapId, isSignedIn, onSignIn }: SanpoMapDetailViewProps) {
  const theme = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const detail = useSanpoMapDetail(sanpoMapId, { isSignedIn });
  const { map, pins, members, deleteFlow, bodyState } = detail;
  const { deleted, deletion } = deleteFlow;
  // アイコン変更ダイアログ。開くたびに key を +1 して作り直す（初期選択を現在のアイコンに戻す）。
  const [iconDialogOpen, setIconDialogOpen] = useState(false);
  const [iconDialogKey, setIconDialogKey] = useState(0);
  // 変更中（ダイアログから通知される）。変更中はバックキーでも閉じない。
  const [iconBusy, setIconBusy] = useState(false);
  const back = useScreenBack({
    fallbackHref: "/sanpo-maps",
    onIntercept: () => {
      if (deleteFlow.interceptBack()) return true;
      if (!iconDialogOpen) return false;
      // 変更中はダイアログを閉じず、バック操作だけ消費する（画面も戻らない）。
      if (!iconBusy) setIconDialogOpen(false);
      return true;
    },
  });
  deleteFlow.bindRunOnce(back.runOnce);
  // ピン詳細で削除して戻ってきたときの「ピンを削除しました」を出す（画面またぎのメッセージ受け渡し。
  // `src/lib/flashMessage.ts`）。消費しないと、文言が残って後でピンタブに遅れて出てしまう（SS-119）。
  const toast = useToast();
  const { show: showToast } = toast;
  useFocusEffect(
    useCallback(() => {
      const message = consumeFlashMessage();
      if (message) showToast(message);
    }, [showToast]),
  );

  const handleOpenMembers = useCallback(() => {
    if (sanpoMapId === null) return;
    // 戻る以外でこの画面から出る遷移なので二重発火ラッチを通す（ピンのタップと同じ）。
    back.runOnce(() =>
      router.push({ pathname: "/sanpo-maps/[sanpoMapId]/members", params: { sanpoMapId } }),
    );
  }, [back, router, sanpoMapId]);

  // ピンの名前の絞り込み。本文（SanpoMapDetailContent）が作り直されても消えないよう画面で持つ。
  const [query, setQuery] = useState("");

  const handleOpenIconDialog = () => {
    Keyboard.dismiss();
    setIconDialogKey((k) => k + 1);
    setIconDialogOpen(true);
  };

  const handleIconUpdated = () => {
    setIconDialogOpen(false);
    showToast("アイコンを変更しました");
  };

  const handleOpenPin = useCallback(
    (pinId: string) => {
      Keyboard.dismiss();
      back.runOnce(() => router.push({ pathname: "/pins/[pinId]", params: { pinId } }));
    },
    [back, router],
  );

  const refreshControl = (
    <RefreshControl
      refreshing={detail.pull.refreshing}
      onRefresh={detail.pull.onRefresh}
      tintColor={theme.colors.primary}
    />
  );

  const loadingBody = (): SanpoMapDetailBody => ({
    centered: true,
    content: (
      <View style={styles.centerState} testID="sanpo-map-detail-loading">
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    ),
  });

  const renderBody = (): SanpoMapDetailBody => {
    // 消した後は地図一覧へ戻るまでの間、取り直しで地図が消えても not-found を出さない。
    if (deleted || bodyState === "loading") return loadingBody();
    if (bodyState === "ready") {
      if (map === undefined) return loadingBody();
      return {
        centered: false,
        content: (
          <SanpoMapDetailContent
            map={map}
            pins={pins}
            members={members}
            pinCount={detail.pinCount}
            query={query}
            onChangeQuery={setQuery}
            refreshControl={refreshControl}
            onRetry={detail.retryAll}
            onOpenIconDialog={handleOpenIconDialog}
            onOpenMembers={handleOpenMembers}
            onOpenPin={handleOpenPin}
            listPaddingBottom={insets.bottom + theme.spacing[6]}
          />
        ),
      };
    }
    const errorCode = detail.maps.errorCode;
    if (bodyState === "error" && errorCode === null) return loadingBody();
    return {
      centered: true,
      // 地図一覧の取得の失敗だけ、引っ張って取り直せる。
      refreshable: bodyState === "error",
      content: (
        <SanpoMapDetailStateCard
          state={bodyState}
          // "error" 以外では使われない。
          errorCode={errorCode ?? "unknown"}
          onGoBack={back.goBack}
          onSignIn={() => back.runOnce(onSignIn)}
          onRetry={detail.retryAll}
        />
      ),
    };
  };

  const body = renderBody();

  return (
    <View
      testID="sanpo-map-detail-screen"
      style={[styles.root, { paddingTop: insets.top + theme.spacing[2] }]}
    >
      <View style={styles.header}>
        <IconButton
          icon="chevron-left"
          label="戻る"
          variant="ghost"
          onPress={back.goBack}
          testID="sanpo-map-detail-back"
        />
        <Text accessibilityRole="header" style={styles.title}>
          地図の詳細
        </Text>
        {map !== undefined && bodyState === "ready" && !deleted && canManageSanpoMap(map.role) ? (
          // owner だけ（editor には押しても 403 になる操作を見せない）。ピン詳細の削除と同じ置き方（SS-265）。
          <IconButton
            icon="trash-2"
            label={SANPO_MAP_DELETE_BUTTON_LABEL}
            variant="ghost"
            onPress={() => deleteFlow.openDialog(map.name)}
            testID="sanpo-map-detail-delete"
          />
        ) : (
          // 名前の変更はスコープ外。押せて何も起きないボタンを作らないため空のスペーサー。
          <View style={styles.headerSpacer} />
        )}
      </View>
      {body.centered ? (
        body.refreshable ? (
          <ScrollView
            style={styles.centerScroll}
            contentContainerStyle={styles.centerScrollContent}
            keyboardShouldPersistTaps="handled"
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
      <ToastOverlay message={toast.message} visible={toast.visible} bottom={insets.bottom + 24} />
      {map !== undefined ? (
        <SanpoMapIconEditDialog
          key={iconDialogKey}
          open={iconDialogOpen}
          sanpoMapId={map.id}
          currentIcon={map.icon}
          onClose={() => setIconDialogOpen(false)}
          onUpdated={handleIconUpdated}
          onBusyChange={setIconBusy}
        />
      ) : null}
      <SanpoMapDeleteDialog
        open={deleteFlow.dialogOpen}
        status={deletion.status}
        errorCode={deletion.errorCode}
        description={detail.deleteDescription}
        onCancel={deleteFlow.closeDialog}
        onConfirm={deletion.deleteMap}
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
}));
