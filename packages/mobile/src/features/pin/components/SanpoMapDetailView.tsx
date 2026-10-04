import { useFocusEffect, useRouter } from "expo-router";
import type { ReactNode } from "react";
import { useCallback, useDeferredValue, useMemo, useState } from "react";
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

import { Badge } from "@/components/ui/badge/Badge";
import { Button } from "@/components/ui/button/Button";
import { IconButton } from "@/components/ui/icon-button/IconButton";
import { ToastOverlay } from "@/components/ui/toast/ToastOverlay";
import { NameSearchField } from "@/features/pin/components/NameSearchField";
import { SanpoMapIconBadge } from "@/features/pin/components/SanpoMapIconBadge";
import { SanpoMapIconEditDialog } from "@/features/pin/components/SanpoMapIconEditDialog";
import { PinStateCard } from "@/features/pin/components/PinStateCard";
import { SanpoMapPinListItem } from "@/features/pin/components/SanpoMapPinListItem";
import { usePullToRefresh } from "@/features/pin/hooks/usePullToRefresh";
import { useSanpoMapRecheck } from "@/features/pin/hooks/useSanpoMapRecheck";
import { useSanpoMapPins } from "@/features/pin/hooks/useSanpoMapPins";
import { useSanpoMaps } from "@/features/pin/hooks/useSanpoMaps";
import { canManageSanpoMap } from "@/features/pin/lib/pinPermissions";
import { isRetriablePinReadError } from "@/features/pin/lib/pinReadError";
import { sanpoMapReadErrorMessage } from "@/features/pin/lib/sanpoMapError";
import { sanpoMapIconChangeLabel } from "@/features/pin/lib/sanpoMapIcon";
import {
  SANPO_MAP_PIN_MAX_PAGES,
  SANPO_MAP_PIN_PAGE_SIZE,
} from "@/features/pin/lib/sanpoMapPinList";
import { filterPinsByName } from "@/features/pin/lib/sanpoMapSearch";
import {
  formatPinResultHeading,
  formatSanpoMapPinCount,
  resolveSanpoMapDetailBodyState,
  resolveSanpoMapPinCount,
  resolveSanpoMapPinSectionState,
} from "@/features/pin/lib/sanpoMapScreenState";
import type { PinListEntry, SanpoMap } from "@/features/pin/types";
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

const MAX_PIN_TOTAL = SANPO_MAP_PIN_PAGE_SIZE * SANPO_MAP_PIN_MAX_PAGES;

/**
 * SanpoMapDetailView — 地図詳細（`/sanpo-maps/[sanpoMapId]`）の実体（SS-121）。
 * 地図の情報と、その地図のピン一覧（新しい順。ピン名で即時に絞り込み、タップでピン詳細へ）。
 *
 * - 地図の情報は地図一覧のキャッシュから id で引く（`GET /sanpo-maps/{id}` は無い。ADR-M-014 D3）。
 * - ピン一覧は全件（上限 1000）を1回の取得で揃え、端末で絞り込む（D1 / D2）。
 * - 認証は props で受ける（features/pin は認証を読まない）。フラグはルートがガードする。
 */
export function SanpoMapDetailView({ sanpoMapId, isSignedIn, onSignIn }: SanpoMapDetailViewProps) {
  const theme = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const maps = useSanpoMaps({ enabled: isSignedIn });
  const pins = useSanpoMapPins(sanpoMapId, { enabled: isSignedIn });
  // アイコン変更ダイアログ。開くたびに key を +1 して作り直す（初期選択を現在のアイコンに戻す）。
  const [iconDialogOpen, setIconDialogOpen] = useState(false);
  const [iconDialogKey, setIconDialogKey] = useState(0);
  // 変更中（ダイアログから通知される）。変更中はバックキーでも閉じない。
  const [iconBusy, setIconBusy] = useState(false);
  const back = useScreenBack({
    fallbackHref: "/sanpo-maps",
    onIntercept: () => {
      if (!iconDialogOpen) return false;
      // 変更中はダイアログを閉じず、バック操作だけ消費する（画面も戻らない）。
      if (!iconBusy) setIconDialogOpen(false);
      return true;
    },
  });
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
  // 引っ張って更新・再試行は、ピン一覧と地図一覧（地図の名前・件数・存在）の両方を取り直す。
  // 別端末での名前変更の反映と、削除された地図の not-found 化のため（ADR-M-014 D7）。
  const { refresh: refreshPins, retry: retryPins } = pins;
  const { refresh: refreshMaps, retry: retryMaps } = maps;
  const refreshAll = useCallback(async () => {
    await Promise.all([refreshPins(), refreshMaps()]);
  }, [refreshPins, refreshMaps]);
  const retryAll = useCallback(() => {
    retryPins();
    retryMaps();
  }, [retryPins, retryMaps]);
  const pull = usePullToRefresh(refreshAll);
  const listContentStyle = useMemo(
    () => ({ paddingBottom: insets.bottom + theme.spacing[6] }),
    [insets.bottom, theme.spacing],
  );

  const map =
    sanpoMapId === null ? undefined : maps.maps.find((candidate) => candidate.id === sanpoMapId);

  const [query, setQuery] = useState("");
  // 最大 1000 件でも入力が引っかからないよう、絞り込みは遅延した値で行う。
  const deferredQuery = useDeferredValue(query);
  const matched = useMemo(
    () => filterPinsByName(pins.pins, deferredQuery),
    [pins.pins, deferredQuery],
  );

  // 一覧に id が無いときは、古いキャッシュで not-found を確定する前に一覧を1回取り直す。
  const recheck = useSanpoMapRecheck({
    sanpoMapId,
    enabled: isSignedIn,
    mapsReady: maps.status === "ready",
    mapFound: map !== undefined,
    mapsFetching: maps.isFetching,
    refreshMaps,
  });

  const bodyState = resolveSanpoMapDetailBodyState({
    hasSanpoMapId: sanpoMapId !== null,
    isSignedIn,
    mapsStatus: maps.status,
    mapFound: map !== undefined,
    mapsFetching: maps.isFetching || recheck.pending,
    pinsErrorCode: pins.errorCode,
  });

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

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<PinListEntry>) => (
      <SanpoMapPinListItem
        pin={item}
        onPress={handleOpenPin}
        onPhotoError={pins.handlePhotoLoadError}
        testID={`sanpo-map-detail-pin-${index}`}
      />
    ),
    [handleOpenPin, pins.handlePhotoLoadError],
  );

  const refreshControl = (
    <RefreshControl
      refreshing={pull.refreshing}
      onRefresh={pull.onRefresh}
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

  const goBackAction = {
    label: "地図一覧へ戻る",
    onPress: back.goBack,
    testID: "sanpo-map-detail-go-back",
  };

  const renderPinSection = (): ReactNode => {
    const sectionState = resolveSanpoMapPinSectionState({
      status: pins.status,
      pinCount: pins.pins.length,
      matchedCount: matched.length,
    });

    // 中央寄せではなくカード1枚の状態。FlatList が無いので ScrollView で包んで引っ張って更新できるようにする。
    const refreshableCard = (card: ReactNode) => (
      <ScrollView
        style={styles.pinSectionScroll}
        contentContainerStyle={styles.pinSectionScrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={refreshControl}
        showsVerticalScrollIndicator={false}
      >
        {card}
      </ScrollView>
    );

    switch (sectionState) {
      case "loading":
        return (
          <View style={styles.sectionCenter} testID="sanpo-map-detail-pins-loading">
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        );

      case "error": {
        const errorCode = pins.errorCode;
        return refreshableCard(
          <PinStateCard
            testID="sanpo-map-detail-pins-error"
            icon="alert-circle"
            tone="danger"
            title={sanpoMapReadErrorMessage(errorCode ?? "unknown", "pins")}
            action={
              errorCode === null || isRetriablePinReadError(errorCode)
                ? { label: "再試行", onPress: retryAll, testID: "sanpo-map-detail-pins-retry" }
                : undefined
            }
          />,
        );
      }

      case "empty":
        return refreshableCard(
          <PinStateCard
            testID="sanpo-map-detail-pins-empty"
            icon="map-pin"
            title="この地図にはまだピンがありません"
            description="ピンタブで地図を長押しすると、ピンを登録できます"
          />,
        );

      case "no-match":
        return refreshableCard(
          <PinStateCard
            testID="sanpo-map-detail-pins-no-match"
            icon="search-x"
            title="一致するピンがありません"
          />,
        );

      case "ready":
        return (
          <>
            <Text style={styles.heading} testID="sanpo-map-detail-pins-heading">
              {formatPinResultHeading({ matchedCount: matched.length, query: deferredQuery })}
            </Text>
            <FlatList
              testID="sanpo-map-detail-pins"
              data={matched}
              keyExtractor={(pin) => pin.id}
              renderItem={renderItem}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              refreshControl={refreshControl}
              contentContainerStyle={listContentStyle}
              showsVerticalScrollIndicator={false}
            />
          </>
        );

      default: {
        const exhaustiveCheck: never = sectionState;
        return exhaustiveCheck;
      }
    }
  };

  const renderReady = (found: SanpoMap): SanpoMapDetailBody => {
    const pinCountLabel = formatSanpoMapPinCount(
      resolveSanpoMapPinCount({
        listPinCount: found.pinCount,
        pinsStatus: pins.status,
        loadedCount: pins.pins.length,
        truncated: pins.truncated,
      }),
    );
    // 検索欄は「ピンが1件以上ある」ときだけ。絞り込み前の件数で判定する。
    const showSearch = pins.status === "ready" && pins.pins.length > 0;
    const pinSection = renderPinSection();

    return {
      centered: false,
      content: (
        <View style={styles.content} testID="sanpo-map-detail-content">
          <View style={styles.info}>
            <View style={styles.nameRow}>
              <SanpoMapIconBadge icon={found.icon} size={40} />
              <Text style={styles.name} testID="sanpo-map-detail-name">
                {found.name}
              </Text>
            </View>
            <View style={styles.infoMeta}>
              {found.isDefault ? <Badge tone="info">既定の地図</Badge> : null}
              {found.role === "editor" ? <Badge tone="neutral">招待された地図</Badge> : null}
              {pinCountLabel !== null ? (
                <Text style={styles.metaText} testID="sanpo-map-detail-pin-count">
                  {pinCountLabel}
                </Text>
              ) : null}
            </View>
            {canManageSanpoMap(found.role) ? (
              // editor には出さない（押しても 403 になる操作を見せない）。
              <Button
                variant="outline"
                size="sm"
                icon="pencil"
                onPress={handleOpenIconDialog}
                // 現在のアイコンをスクリーンリーダーと E2E に伝える（バッジは装飾で a11y から隠している）。
                accessibilityLabel={sanpoMapIconChangeLabel(found.icon)}
                testID="sanpo-map-detail-change-icon"
                style={styles.changeIcon}
              >
                アイコンを変更
              </Button>
            ) : null}
          </View>
          {showSearch ? (
            <NameSearchField
              value={query}
              onChangeText={setQuery}
              placeholder="ピンの名前で検索"
              accessibilityLabel="ピンの名前で検索"
              testID="sanpo-map-detail-search-input"
            />
          ) : null}
          {pins.truncated ? (
            <Text style={styles.metaText} testID="sanpo-map-detail-pins-truncated">
              {`ピンが多いため、新しい順に${MAX_PIN_TOTAL}件までを表示・検索しています`}
            </Text>
          ) : null}
          <View style={styles.pinSection}>{pinSection}</View>
        </View>
      ),
    };
  };

  const renderBody = (): SanpoMapDetailBody => {
    switch (bodyState) {
      case "invalid-id":
        return {
          centered: true,
          content: (
            <PinStateCard
              testID="sanpo-map-detail-error"
              icon="alert-circle"
              tone="danger"
              title="地図を特定できませんでした"
              action={goBackAction}
            />
          ),
        };

      case "sign-in-required":
        return {
          centered: true,
          content: (
            <PinStateCard
              testID="sanpo-map-detail-sign-in-required"
              icon="user"
              title="地図の表示にはサインインが必要です"
              action={{
                label: "サインイン",
                onPress: () => back.runOnce(onSignIn),
                testID: "sanpo-map-detail-sign-in",
              }}
            />
          ),
        };

      case "not-found":
        return {
          centered: true,
          content: (
            <PinStateCard
              testID="sanpo-map-detail-error"
              icon="alert-circle"
              tone="danger"
              title="この地図は見つかりませんでした。削除された可能性があります。"
              action={goBackAction}
            />
          ),
        };

      case "error": {
        const errorCode = maps.errorCode;
        if (errorCode === null) return loadingBody();
        return {
          centered: true,
          refreshable: true,
          content: (
            <PinStateCard
              testID="sanpo-map-detail-error"
              icon="alert-circle"
              tone="danger"
              title={sanpoMapReadErrorMessage(errorCode, "maps")}
              action={
                isRetriablePinReadError(errorCode)
                  ? { label: "再試行", onPress: retryAll, testID: "sanpo-map-detail-retry" }
                  : undefined
              }
            />
          ),
        };
      }

      case "loading":
        return loadingBody();

      case "ready":
        return map === undefined ? loadingBody() : renderReady(map);

      default: {
        const exhaustiveCheck: never = bodyState;
        return exhaustiveCheck;
      }
    }
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
        {/* 名前変更・削除はスコープ外。押せて何も起きないボタンを作らないため空のスペーサー。 */}
        <View style={styles.headerSpacer} />
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
  pinSectionScroll: {
    flex: 1,
  },
  pinSectionScrollContent: {
    flexGrow: 1,
    paddingBottom: theme.spacing[6],
  },
  centerState: {
    alignItems: "center",
  },
  content: {
    flex: 1,
    paddingHorizontal: theme.layout.pageGutter,
    gap: theme.spacing[3],
  },
  info: {
    gap: theme.spacing[2],
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
  },
  changeIcon: {
    alignSelf: "flex-start",
  },
  name: {
    flex: 1,
    fontSize: theme.typography.size["2xl"],
    fontWeight: theme.typography.weight.heavy,
    color: theme.colors.textPrimary,
  },
  infoMeta: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
  metaText: {
    fontSize: theme.typography.size.xs,
    color: theme.colors.textSecondary,
  },
  pinSection: {
    flex: 1,
  },
  sectionCenter: {
    alignItems: "center",
    paddingTop: theme.spacing[6],
  },
  heading: {
    fontSize: theme.typography.size.sm,
    fontWeight: theme.typography.weight.bold,
    color: theme.colors.textSecondary,
    paddingBottom: theme.spacing[2],
  },
}));
