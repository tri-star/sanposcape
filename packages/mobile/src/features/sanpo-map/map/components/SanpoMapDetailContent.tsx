import type { ReactElement, ReactNode } from "react";
import { useCallback, useDeferredValue, useMemo } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  Text,
  View,
  type ListRenderItemInfo,
  type RefreshControlProps,
} from "react-native";

import { Badge } from "@/components/ui/badge/Badge";
import { Icon } from "@/components/ui/icon/Icon";
import { SanpoMapIconBadge } from "@/features/sanpo-map/map/components/SanpoMapIconBadge";
import { SanpoMapMemberSummaryRow } from "@/features/sanpo-map/map/components/SanpoMapMemberSummaryRow";
import { SanpoMapPinListItem } from "@/features/sanpo-map/map/components/SanpoMapPinListItem";
import type { UseSanpoMapMembersResult } from "@/features/sanpo-map/map/hooks/useSanpoMapMembers";
import type { UseSanpoMapPinsResult } from "@/features/sanpo-map/map/hooks/useSanpoMapPins";
import { sanpoMapReadErrorMessage } from "@/features/sanpo-map/map/lib/sanpoMapError";
import { sanpoMapIconChangeLabel } from "@/features/sanpo-map/map/lib/sanpoMapIcon";
import { filterPinsByName } from "@/features/sanpo-map/map/lib/sanpoMapSearch";
import {
  formatPinResultHeading,
  formatSanpoMapPinCount,
  resolveSanpoMapPinSectionState,
} from "@/features/sanpo-map/map/lib/sanpoMapScreenState";
import { canManageSanpoMap } from "@/features/sanpo-map/pin/lib/pinPermissions";
import { isRetriablePinReadError } from "@/features/sanpo-map/pin/lib/pinReadError";
import {
  SANPO_MAP_PIN_MAX_PAGES,
  SANPO_MAP_PIN_PAGE_SIZE,
} from "@/features/sanpo-map/pin/lib/sanpoMapPinList";
import { NameSearchField } from "@/features/sanpo-map/shared/components/NameSearchField";
import { PinStateCard } from "@/features/sanpo-map/shared/components/PinStateCard";
import type { PinListEntry, SanpoMap } from "@/features/sanpo-map/shared/types";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

const MAX_PIN_TOTAL = SANPO_MAP_PIN_PAGE_SIZE * SANPO_MAP_PIN_MAX_PAGES;

export type SanpoMapDetailContentProps = {
  map: SanpoMap;
  pins: UseSanpoMapPinsResult;
  /** null = メンバーの行を出さない。 */
  members: UseSanpoMapMembersResult | null;
  /** 地図のピンの件数（`resolveSanpoMapPinCount`）。分からなければ null。 */
  pinCount: number | null;
  /** ピンの名前の絞り込みの語（画面が持つ。本文が作り直されても消えない）。 */
  query: string;
  onChangeQuery: (query: string) => void;
  /** 引っ張って更新（ピン一覧と地図一覧の両方を取り直す）。 */
  refreshControl: ReactElement<RefreshControlProps>;
  /** ピン一覧の再試行。 */
  onRetry: () => void;
  onOpenIconDialog: () => void;
  onOpenMembers: () => void;
  onOpenPin: (pinId: string) => void;
  /** ピン一覧の下端の余白（セーフエリアを含む）。 */
  listPaddingBottom: number;
};

/**
 * 地図詳細（`SanpoMapDetailView`）の、地図が見つかったときの本文。
 * 地図の情報（アイコン・名前・件数・メンバー）と、ピンの名前の検索・ピン一覧を出す。
 */
export function SanpoMapDetailContent(props: SanpoMapDetailContentProps) {
  const { map, pins, query, onChangeQuery } = props;
  const styles = useStyles();
  // 検索欄は「ピンが1件以上ある」ときだけ。絞り込み前の件数で判定する。
  const showSearch = pins.status === "ready" && pins.pins.length > 0;

  return (
    <View style={styles.content} testID="sanpo-map-detail-content">
      <SanpoMapDetailInfo
        map={map}
        pinCountLabel={formatSanpoMapPinCount(props.pinCount)}
        members={props.members}
        onOpenIconDialog={props.onOpenIconDialog}
        onOpenMembers={props.onOpenMembers}
      />
      {showSearch ? (
        <NameSearchField
          value={query}
          onChangeText={onChangeQuery}
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
      <View style={styles.pinSection}>
        <SanpoMapDetailPins
          pins={pins}
          query={query}
          refreshControl={props.refreshControl}
          onRetry={props.onRetry}
          onOpenPin={props.onOpenPin}
          listPaddingBottom={props.listPaddingBottom}
        />
      </View>
    </View>
  );
}

/** 地図の情報（アイコン・名前・既定／招待のバッジ・ピンの件数・メンバーの行）。 */
function SanpoMapDetailInfo({
  map,
  pinCountLabel,
  members,
  onOpenIconDialog,
  onOpenMembers,
}: {
  map: SanpoMap;
  pinCountLabel: string | null;
  members: UseSanpoMapMembersResult | null;
  onOpenIconDialog: () => void;
  onOpenMembers: () => void;
}) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.info}>
      <View style={styles.nameRow}>
        {canManageSanpoMap(map.role) ? (
          // 「アイコンを変更」ボタンは置かず、アイコンのタップで開く（SS-249）。editor には押せる形を見せない
          // （押しても 403 になる操作を見せない）。読み上げと E2E は、現在のアイコンを含むラベルで探す。
          <Pressable
            onPress={onOpenIconDialog}
            accessibilityRole="button"
            accessibilityLabel={sanpoMapIconChangeLabel(map.icon)}
            testID="sanpo-map-detail-change-icon"
            // アイコンは 40px なので、押せる範囲を 44pt 以上に広げる。
            hitSlop={8}
            style={({ pressed }) => (pressed ? styles.iconPressed : null)}
          >
            <SanpoMapIconBadge icon={map.icon} size={40} />
            <View style={styles.iconEditBadge} pointerEvents="none">
              <Icon name="pencil" size={11} color={theme.colors.onPrimary} strokeWidth={2.5} />
            </View>
          </Pressable>
        ) : (
          <SanpoMapIconBadge icon={map.icon} size={40} />
        )}
        <Text style={styles.name} testID="sanpo-map-detail-name">
          {map.name}
        </Text>
      </View>
      <View style={styles.infoMeta}>
        {map.isDefault ? <Badge tone="info">既定の地図</Badge> : null}
        {map.role === "editor" ? <Badge tone="neutral">招待された地図</Badge> : null}
        {pinCountLabel !== null ? (
          <Text style={styles.metaText} testID="sanpo-map-detail-pin-count">
            {pinCountLabel}
          </Text>
        ) : null}
      </View>
      {members !== null ? (
        <SanpoMapMemberSummaryRow
          members={members.members}
          status={members.status}
          onPress={onOpenMembers}
        />
      ) : null}
    </View>
  );
}

/** ピン一覧の節（取得中・失敗・空・該当なし・一覧）。最大 1000 件でも入力が引っかからないよう、絞り込みは遅延した値で行う。 */
function SanpoMapDetailPins({
  pins,
  query,
  refreshControl,
  onRetry,
  onOpenPin,
  listPaddingBottom,
}: {
  pins: UseSanpoMapPinsResult;
  query: string;
  refreshControl: ReactElement<RefreshControlProps>;
  onRetry: () => void;
  onOpenPin: (pinId: string) => void;
  listPaddingBottom: number;
}) {
  const theme = useTheme();
  const styles = useStyles();
  const deferredQuery = useDeferredValue(query);
  const matched = useMemo(
    () => filterPinsByName(pins.pins, deferredQuery),
    [pins.pins, deferredQuery],
  );
  const listContentStyle = useMemo(
    () => ({ paddingBottom: listPaddingBottom }),
    [listPaddingBottom],
  );
  const { handlePhotoLoadError } = pins;
  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<PinListEntry>) => (
      <SanpoMapPinListItem
        pin={item}
        onPress={onOpenPin}
        onPhotoError={handlePhotoLoadError}
        testID={`sanpo-map-detail-pin-${index}`}
      />
    ),
    [onOpenPin, handlePhotoLoadError],
  );

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
              ? { label: "再試行", onPress: onRetry, testID: "sanpo-map-detail-pins-retry" }
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
}

const useStyles = makeStyles((theme) => ({
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
  iconPressed: {
    opacity: 0.6,
  },
  // owner だけに出す、アイコンを押せることを示す小さなペン。
  iconEditBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primary,
    borderWidth: 2,
    borderColor: theme.colors.surfaceApp,
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
  pinSectionScroll: {
    flex: 1,
  },
  pinSectionScrollContent: {
    flexGrow: 1,
    paddingBottom: theme.spacing[6],
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
