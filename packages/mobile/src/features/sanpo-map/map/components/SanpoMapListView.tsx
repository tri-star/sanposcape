import { useFocusEffect, useRouter } from "expo-router";
import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  RefreshControl,
  ScrollView,
  View,
  type ListRenderItemInfo,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconButton } from "@/components/ui/icon-button/IconButton";
import { ToastOverlay } from "@/components/ui/toast/ToastOverlay";
import { InvitationLinkPasteDialog } from "@/features/sanpo-map/invitation/components/InvitationLinkPasteDialog";
import { SanpoMapCreateDialog } from "@/features/sanpo-map/map/components/SanpoMapCreateDialog";
import { SanpoMapListHeader } from "@/features/sanpo-map/map/components/SanpoMapListHeader";
import { SanpoMapListItem } from "@/features/sanpo-map/map/components/SanpoMapListItem";
import { SanpoMapListStateCard } from "@/features/sanpo-map/map/components/SanpoMapListStateCard";
import { usePullToRefresh } from "@/features/sanpo-map/shared/hooks/usePullToRefresh";
import { useSanpoMaps } from "@/features/sanpo-map/map/hooks/useSanpoMaps";
import { filterSanpoMapsByName } from "@/features/sanpo-map/map/lib/sanpoMapSearch";
import { resolveSanpoMapListBodyState } from "@/features/sanpo-map/map/lib/sanpoMapScreenState";
import type { SanpoMap } from "@/features/sanpo-map/shared/types";
import { useScreenBack } from "@/hooks/useScreenBack";
import { useToast } from "@/hooks/useToast";
import { consumeFlashMessage } from "@/lib/flashMessage";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

export type SanpoMapListViewProps = {
  /** ルート（app/sanpo-maps/index.tsx）が useAuthSessionStore から注入する（features/sanpo-map は認証を読まない）。 */
  isSignedIn: boolean;
  onSignIn: () => void;
};

/** `renderBody()` の戻り値。中央寄せするかどうかの判断をここ1箇所に閉じる（`PinDetailView` と同じ形）。 */
type SanpoMapListBody = {
  content: ReactNode;
  centered: boolean;
  /** centered の本文を引っ張って更新できるようにする（ScrollView で包む）。 */
  refreshable?: boolean;
};

/**
 * SanpoMapListView — 地図一覧（`/sanpo-maps`）の実体（SS-121。SS-146 の暫定画面を本実装に差し替え）。
 * 自分の地図を並べ、名前で即時に絞り込み（端末で行う。ADR-M-014 D1）、FAB から地図を作成し、
 * 行のタップで地図詳細（`/sanpo-maps/[sanpoMapId]`）へ進む。
 *
 * - testID `sanpo-map-list-screen` / `sanpo-map-list-back` は E2E（`pin-map.yaml`）が使うので維持する。
 * - 認証は props で受ける（features/sanpo-map は認証を読まない）。フラグはルートがガードする。
 * - ゲストは開けるが通信せずサインイン案内を出し、FAB・検索欄は出さない
 *   （押しても 401 になる操作を見せない。ADR-M-014 D6）。
 */
export function SanpoMapListView({ isSignedIn, onSignIn }: SanpoMapListViewProps) {
  const theme = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { show: showToast } = toast;
  // メンバー画面で地図から抜けて戻ってきたときの「『…』から抜けました」（SS-249。`src/lib/flashMessage.ts`）。
  useFocusEffect(
    useCallback(() => {
      const message = consumeFlashMessage();
      if (message) showToast(message);
    }, [showToast]),
  );
  const maps = useSanpoMaps({ enabled: isSignedIn });
  // FAB は IconButton size="lg"（実寸 54 = theme.control.lg）。
  const fabSize = theme.control.lg;

  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  // 「招待リンクで参加」（SS-250。サインイン中だけ）。
  const [joinOpen, setJoinOpen] = useState(false);
  // 開くたびに +1 してダイアログを作り直す（入力値・作成エラーを空に戻す）。
  const [createDialogKey, setCreateDialogKey] = useState(0);
  // 作成中（ダイアログから通知される）。作成中はバックキーでも閉じない。
  const [createBusy, setCreateBusy] = useState(false);
  const pull = usePullToRefresh(maps.refresh);

  const back = useScreenBack({
    fallbackHref: "/(tabs)/pins",
    onIntercept: () => {
      if (joinOpen) {
        setJoinOpen(false);
        return true;
      }
      if (!createOpen) return false;
      // 作成中はダイアログを閉じず、バック操作だけ消費する（画面も戻らない）。
      // Android では Modal の onRequestClose（作成中は Dialog が止める）が先に受けるので、
      // ここは useScreenBack 経由のバックを受ける一本化のため。
      if (!createBusy) setCreateOpen(false);
      return true;
    },
  });

  const matched = useMemo(() => filterSanpoMapsByName(maps.maps, query), [maps.maps, query]);

  const bodyState = resolveSanpoMapListBodyState({
    isSignedIn,
    status: maps.status,
    mapCount: maps.maps.length,
    matchedCount: matched.length,
  });

  const handleOpenMap = useCallback(
    (sanpoMapId: string) => {
      Keyboard.dismiss();
      back.runOnce(() =>
        router.push({ pathname: "/sanpo-maps/[sanpoMapId]", params: { sanpoMapId } }),
      );
    },
    [back, router],
  );

  const handleCreated = (map: SanpoMap) => {
    setCreateOpen(false);
    // 作った地図が絞り込みで隠れないようにクリアする。
    setQuery("");
    toast.show(`地図「${map.name}」を作成しました`);
  };

  const handleOpenCreate = () => {
    Keyboard.dismiss();
    setCreateDialogKey((k) => k + 1);
    setCreateOpen(true);
  };

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<SanpoMap>) => (
      <SanpoMapListItem
        map={item}
        onPress={handleOpenMap}
        testID={`sanpo-map-list-item-${index}`}
      />
    ),
    [handleOpenMap],
  );

  // 最後の行が FAB（IconButton size="lg"）に隠れないよう下余白に FAB の高さを足す。
  const listContentStyle = useMemo(
    () => [styles.listContent, { paddingBottom: insets.bottom + fabSize + theme.spacing[6] }],
    [styles.listContent, insets.bottom, fabSize, theme.spacing],
  );

  const refreshControl = (
    <RefreshControl
      refreshing={pull.refreshing}
      onRefresh={pull.onRefresh}
      tintColor={theme.colors.primary}
    />
  );

  const loadingBody = (): SanpoMapListBody => ({
    centered: true,
    content: (
      <View style={styles.centerState} testID="sanpo-map-list-loading">
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    ),
  });

  const renderBody = (): SanpoMapListBody => {
    if (bodyState === "loading") return loadingBody();
    if (bodyState === "ready") {
      return {
        centered: false,
        content: (
          <FlatList
            testID="sanpo-map-list"
            data={matched}
            keyExtractor={(map) => map.id}
            renderItem={renderItem}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            refreshControl={refreshControl}
            contentContainerStyle={listContentStyle}
            showsVerticalScrollIndicator={false}
          />
        ),
      };
    }
    const errorCode = maps.errorCode;
    if (bodyState === "error" && errorCode === null) return loadingBody();
    return {
      centered: true,
      // サインインの案内は引っ張って更新しない（取得していない）。
      refreshable: bodyState !== "sign-in-required",
      content: (
        <SanpoMapListStateCard
          state={bodyState}
          // "error" 以外では使われない。
          errorCode={errorCode ?? "unknown"}
          query={query}
          onSignIn={() => back.runOnce(onSignIn)}
          onRetry={maps.retry}
        />
      ),
    };
  };

  const body = renderBody();
  const showSearch = isSignedIn && maps.maps.length > 0 && maps.status === "ready";
  const showFab =
    isSignedIn && (bodyState === "ready" || bodyState === "empty" || bodyState === "no-match");
  const fabBottom = insets.bottom + theme.spacing[4];

  return (
    <View
      testID="sanpo-map-list-screen"
      style={[styles.root, { paddingTop: insets.top + theme.spacing[2] }]}
    >
      <SanpoMapListHeader
        onBack={back.goBack}
        showJoin={isSignedIn}
        onJoin={() => setJoinOpen(true)}
        showSearch={showSearch}
        query={query}
        onChangeQuery={setQuery}
      />
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
      {showFab ? (
        <IconButton
          variant="filled"
          size="lg"
          icon="plus"
          label="地図を作成"
          onPress={handleOpenCreate}
          style={[styles.fab, { bottom: fabBottom }]}
          testID="sanpo-map-list-create-fab"
        />
      ) : null}
      <ToastOverlay
        message={toast.message}
        visible={toast.visible}
        bottom={fabBottom + fabSize + theme.spacing[2]}
      />
      <InvitationLinkPasteDialog
        open={joinOpen}
        onClose={() => setJoinOpen(false)}
        onOpen={(token) => {
          setJoinOpen(false);
          back.runOnce(() => router.push({ pathname: "/invitations/accept", params: { token } }));
        }}
      />
      <SanpoMapCreateDialog
        key={createDialogKey}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={handleCreated}
        onBusyChange={setCreateBusy}
      />
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    flex: 1,
    backgroundColor: theme.colors.surfaceApp,
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
  fab: {
    position: "absolute",
    right: theme.layout.pageGutter,
    ...theme.shadows.md,
  },
}));
