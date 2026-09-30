import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { useCallback, useDeferredValue, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  RefreshControl,
  Text,
  View,
  type ListRenderItemInfo,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Badge } from "@/components/ui/badge/Badge";
import { IconButton } from "@/components/ui/icon-button/IconButton";
import { NameSearchField } from "@/features/pin/components/NameSearchField";
import { PinStateCard } from "@/features/pin/components/PinStateCard";
import { SanpoMapPinListItem } from "@/features/pin/components/SanpoMapPinListItem";
import { useSanpoMapPins } from "@/features/pin/hooks/useSanpoMapPins";
import { useSanpoMaps } from "@/features/pin/hooks/useSanpoMaps";
import { isRetriablePinReadError } from "@/features/pin/lib/pinReadError";
import { sanpoMapReadErrorMessage } from "@/features/pin/lib/sanpoMapError";
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
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

export type SanpoMapDetailViewProps = {
  /** ルートで isUuid を通した値。不正なら null。 */
  sanpoMapId: string | null;
  isSignedIn: boolean;
  onSignIn: () => void;
};

/** `renderBody()` の戻り値。中央寄せするかどうかの判断をここ1箇所に閉じる。 */
type SanpoMapDetailBody = { content: ReactNode; centered: boolean };

const MAX_PIN_TOTAL = SANPO_MAP_PIN_PAGE_SIZE * SANPO_MAP_PIN_MAX_PAGES;

/**
 * SanpoMapDetailView — 地図詳細（`/sanpo-maps/[sanpoMapId]`）の実体（SS-121）。
 * 地図の情報と、その地図のピン一覧（新しい順。ピン名で即時に絞り込み、タップでピン詳細へ）。
 *
 * - 地図の情報は地図一覧のキャッシュから id で引く（`GET /sanpo-maps/{id}` は無い。mobile ADR-014 D3）。
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
  const back = useScreenBack({ fallbackHref: "/sanpo-maps" });

  const map =
    sanpoMapId === null ? undefined : maps.maps.find((candidate) => candidate.id === sanpoMapId);

  const [query, setQuery] = useState("");
  // 最大 1000 件でも入力が引っかからないよう、絞り込みは遅延した値で行う。
  const deferredQuery = useDeferredValue(query);
  const matched = useMemo(
    () => filterPinsByName(pins.pins, deferredQuery),
    [pins.pins, deferredQuery],
  );

  const bodyState = resolveSanpoMapDetailBodyState({
    hasSanpoMapId: sanpoMapId !== null,
    isSignedIn,
    mapsStatus: maps.status,
    mapFound: map !== undefined,
    pinsErrorCode: pins.errorCode,
  });

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

    switch (sectionState) {
      case "loading":
        return (
          <View style={styles.sectionCenter} testID="sanpo-map-detail-pins-loading">
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        );

      case "error": {
        const errorCode = pins.errorCode;
        return (
          <PinStateCard
            testID="sanpo-map-detail-pins-error"
            icon="alert-circle"
            tone="danger"
            title={sanpoMapReadErrorMessage(errorCode ?? "unknown", "pins")}
            action={
              errorCode === null || isRetriablePinReadError(errorCode)
                ? { label: "再試行", onPress: pins.retry, testID: "sanpo-map-detail-pins-retry" }
                : undefined
            }
          />
        );
      }

      case "empty":
        return (
          <PinStateCard
            testID="sanpo-map-detail-pins-empty"
            icon="map-pin"
            title="この地図にはまだピンがありません"
            description="ピンタブで地図を長押しすると、ピンを登録できます"
          />
        );

      case "no-match":
        return (
          <PinStateCard
            testID="sanpo-map-detail-pins-no-match"
            icon="search-x"
            title="一致するピンがありません"
          />
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
              refreshControl={
                <RefreshControl
                  refreshing={pins.isRefetching}
                  onRefresh={pins.retry}
                  tintColor={theme.colors.primary}
                />
              }
              contentContainerStyle={{ paddingBottom: insets.bottom + theme.spacing[6] }}
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
            <Text style={styles.name} testID="sanpo-map-detail-name">
              {found.name}
            </Text>
            <View style={styles.infoMeta}>
              {found.isDefault ? <Badge tone="info">既定の地図</Badge> : null}
              {found.role === "editor" ? <Badge tone="neutral">招待された地図</Badge> : null}
              {pinCountLabel !== null ? (
                <Text style={styles.metaText} testID="sanpo-map-detail-pin-count">
                  {pinCountLabel}
                </Text>
              ) : null}
            </View>
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
          content: (
            <PinStateCard
              testID="sanpo-map-detail-error"
              icon="alert-circle"
              tone="danger"
              title={sanpoMapReadErrorMessage(errorCode, "maps")}
              action={
                isRetriablePinReadError(errorCode)
                  ? { label: "再試行", onPress: maps.retry, testID: "sanpo-map-detail-retry" }
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
      {body.centered ? <View style={styles.centerContent}>{body.content}</View> : body.content}
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
  content: {
    flex: 1,
    paddingHorizontal: theme.layout.pageGutter,
    gap: theme.spacing[3],
  },
  info: {
    gap: theme.spacing[2],
  },
  name: {
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
