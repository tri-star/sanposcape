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
import { ToastOverlay } from "@/components/ui/toast/ToastOverlay";
import { NameSearchField } from "@/features/pin/components/NameSearchField";
import { PinStateCard } from "@/features/pin/components/PinStateCard";
import { SanpoMapCreateDialog } from "@/features/pin/components/SanpoMapCreateDialog";
import { SanpoMapListItem } from "@/features/pin/components/SanpoMapListItem";
import { usePullToRefresh } from "@/features/pin/hooks/usePullToRefresh";
import { useSanpoMaps } from "@/features/pin/hooks/useSanpoMaps";
import { isRetriablePinReadError } from "@/features/pin/lib/pinReadError";
import { sanpoMapReadErrorMessage } from "@/features/pin/lib/sanpoMapError";
import { filterSanpoMapsByName } from "@/features/pin/lib/sanpoMapSearch";
import {
  resolveSanpoMapListBodyState,
  sanpoMapNoMatchTitle,
} from "@/features/pin/lib/sanpoMapScreenState";
import type { SanpoMap } from "@/features/pin/types";
import { useScreenBack } from "@/hooks/useScreenBack";
import { useToast } from "@/hooks/useToast";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

export type SanpoMapListViewProps = {
  /** ルート（app/sanpo-maps/index.tsx）が useAuthSessionStore から注入する（features/pin は認証を読まない）。 */
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
 * - 認証は props で受ける（features/pin は認証を読まない）。フラグはルートがガードする。
 * - ゲストは開けるが通信せずサインイン案内を出し、FAB・検索欄は出さない
 *   （押しても 401 になる操作を見せない。ADR-M-014 D6）。
 */
export function SanpoMapListView({ isSignedIn, onSignIn }: SanpoMapListViewProps) {
  const theme = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const maps = useSanpoMaps({ enabled: isSignedIn });
  // FAB は IconButton size="lg"（実寸 54 = theme.control.lg）。
  const fabSize = theme.control.lg;

  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  // 開くたびに +1 してダイアログを作り直す（入力値・作成エラーを空に戻す）。
  const [createDialogKey, setCreateDialogKey] = useState(0);
  // 作成中（ダイアログから通知される）。作成中はバックキーでも閉じない。
  const [createBusy, setCreateBusy] = useState(false);
  const pull = usePullToRefresh(maps.refresh);

  const back = useScreenBack({
    fallbackHref: "/(tabs)/pins",
    onIntercept: () => {
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
    switch (bodyState) {
      case "sign-in-required":
        return {
          centered: true,
          content: (
            <PinStateCard
              testID="sanpo-map-list-sign-in-required"
              icon="user"
              title="地図の一覧を見るにはサインインが必要です"
              action={{
                label: "サインイン",
                onPress: () => back.runOnce(onSignIn),
                testID: "sanpo-map-list-sign-in",
              }}
            />
          ),
        };

      case "loading":
        return loadingBody();

      case "error": {
        const errorCode = maps.errorCode;
        if (errorCode === null) return loadingBody();
        return {
          centered: true,
          refreshable: true,
          content: (
            <PinStateCard
              testID="sanpo-map-list-error"
              icon="alert-circle"
              tone="danger"
              title={sanpoMapReadErrorMessage(errorCode, "maps")}
              action={
                isRetriablePinReadError(errorCode)
                  ? { label: "再試行", onPress: maps.retry, testID: "sanpo-map-list-retry" }
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
              testID="sanpo-map-list-empty"
              icon="map"
              title="まだ地図がありません"
              description="右下の＋から地図を作成できます。ピンを登録すると「最初の地図」が自動で作られます"
            />
          ),
        };

      case "no-match":
        return {
          centered: true,
          refreshable: true,
          content: (
            <PinStateCard
              testID="sanpo-map-list-no-match"
              icon="search-x"
              title={sanpoMapNoMatchTitle(query)}
            />
          ),
        };

      case "ready":
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

      default: {
        const exhaustiveCheck: never = bodyState;
        return exhaustiveCheck;
      }
    }
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
      <View style={styles.header}>
        <IconButton
          icon="chevron-left"
          label="戻る"
          variant="ghost"
          onPress={back.goBack}
          testID="sanpo-map-list-back"
        />
        <Text accessibilityRole="header" style={styles.title}>
          地図一覧
        </Text>
        <View style={styles.headerSpacer} />
      </View>
      {showSearch ? (
        <View style={styles.search}>
          <NameSearchField
            value={query}
            onChangeText={setQuery}
            placeholder="地図の名前で検索"
            accessibilityLabel="地図の名前で検索"
            testID="sanpo-map-list-search-input"
          />
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
