import { useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconButton } from "@/components/ui/icon-button/IconButton";
import { ToastOverlay } from "@/components/ui/toast/ToastOverlay";
import { PinStateCard } from "@/features/sanpo-map/shared/components/PinStateCard";
import { SanpoMapMemberList } from "@/features/sanpo-map/map/components/SanpoMapMemberList";
import { SanpoMapInviteSection } from "@/features/sanpo-map/invitation/components/SanpoMapInviteSection";
import { SanpoMapMemberRemoveDialog } from "@/features/sanpo-map/map/components/SanpoMapMemberRemoveDialog";
import { usePullToRefresh } from "@/features/sanpo-map/shared/hooks/usePullToRefresh";
import { useSanpoMapMemberRemove } from "@/features/sanpo-map/map/hooks/useSanpoMapMemberRemove";
import { useSanpoMapMembers } from "@/features/sanpo-map/map/hooks/useSanpoMapMembers";
import { useSanpoMaps } from "@/features/sanpo-map/map/hooks/useSanpoMaps";
import {
  SANPO_MAP_MEMBERS_LOAD_ERROR,
  sanpoMapLeftMessage,
  sanpoMapMemberDisplayName,
  sanpoMapMemberRemovedMessage,
} from "@/features/sanpo-map/map/lib/sanpoMapMember";
import type { SanpoMapMember } from "@/features/sanpo-map/shared/types";
import { useScreenBack } from "@/hooks/useScreenBack";
import { useToast } from "@/hooks/useToast";
import { setFlashMessage } from "@/lib/flashMessage";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

export type SanpoMapMembersViewProps = {
  /** ルートで isUuid を通した値。不正なら null。 */
  sanpoMapId: string | null;
  /** サインイン中の利用者の ID（features/sanpo-map は認証を読まないのでルートから渡す）。ゲストは null。 */
  currentUserId: string | null;
};

/** 確認ダイアログの対象。null なら閉じている。 */
type RemoveTarget = { mode: "leave" | "remove"; member: SanpoMapMember } | null;

/**
 * SanpoMapMembersView — 地図のメンバー画面（`/sanpo-maps/[sanpoMapId]/members`。SS-249）。
 * メンバーの一覧（表示名・オーナー／メンバー・あなた）。owner は自分以外を「外す」、editor は「この地図から抜ける」。
 * 外した人・抜けた人が追加したピン・写真・タグは地図に残る（確認ダイアログで伝える。ADR-009 決定38）。
 * 地図の名前と自分の役割は地図一覧のキャッシュから引く（地図詳細と同じ。ADR-M-014 D3）。
 */
export function SanpoMapMembersView({ sanpoMapId, currentUserId }: SanpoMapMembersViewProps) {
  const theme = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const signedIn = currentUserId !== null;
  const maps = useSanpoMaps({ enabled: signedIn });
  const map =
    sanpoMapId === null ? undefined : maps.maps.find((candidate) => candidate.id === sanpoMapId);
  const members = useSanpoMapMembers(sanpoMapId, { enabled: signedIn && map !== undefined });
  const toast = useToast();
  const { show: showToast } = toast;
  const [target, setTarget] = useState<RemoveTarget>(null);
  // 抜けた後の遷移も「戻る以外の遷移」なので二重発火ラッチ（`useScreenBack` の runOnce）を通す。
  // `back` は確認ダイアログの状態に依存して下で作るので、ref 経由で呼ぶ。
  const runOnceRef = useRef<((navigate: () => void) => void) | null>(null);

  const removal = useSanpoMapMemberRemove(sanpoMapId, {
    currentUserId,
    onRemoved: ({ leaving }) => {
      const removedName = target === null ? "" : sanpoMapMemberDisplayName(target.member);
      setTarget(null);
      if (leaving) {
        // 抜けた地図の詳細には戻れない（404 になる）ので、地図一覧まで戻ってそこで知らせる。
        setFlashMessage(sanpoMapLeftMessage(map?.name ?? ""));
        const navigate = () => router.dismissTo("/sanpo-maps");
        if (runOnceRef.current) runOnceRef.current(navigate);
        else navigate();
        return;
      }
      showToast(sanpoMapMemberRemovedMessage(removedName));
    },
  });
  const busy = removal.status === "removing";
  const { reset: resetRemoval, remove } = removal;
  const closeDialog = useCallback(() => {
    setTarget(null);
    resetRemoval();
  }, [resetRemoval]);
  const back = useScreenBack({
    fallbackHref: "/sanpo-maps",
    onIntercept: () => {
      if (target === null) return false;
      // 実行中はダイアログを閉じず、バック操作だけ消費する。
      if (!busy) closeDialog();
      return true;
    },
  });
  runOnceRef.current = back.runOnce;

  const { refresh: refreshMembers } = members;
  const { refresh: refreshMaps } = maps;
  const pull = usePullToRefresh(
    useCallback(async () => {
      await Promise.all([refreshMembers(), refreshMaps()]);
    }, [refreshMembers, refreshMaps]),
  );

  const renderBody = () => {
    if (!signedIn) {
      return (
        <PinStateCard
          testID="sanpo-map-members-sign-in-required"
          icon="user"
          title="メンバーの表示にはサインインが必要です"
          action={{ label: "戻る", onPress: back.goBack }}
        />
      );
    }
    if (map === undefined) {
      if (maps.status === "loading") return <ActivityIndicator color={theme.colors.primary} />;
      return (
        <PinStateCard
          testID="sanpo-map-members-not-found"
          icon="alert-circle"
          tone="danger"
          title="この地図は見つかりませんでした。"
          action={{ label: "戻る", onPress: back.goBack }}
        />
      );
    }
    if (members.status === "loading") return <ActivityIndicator color={theme.colors.primary} />;
    if (members.status === "error") {
      return (
        <PinStateCard
          testID="sanpo-map-members-error"
          icon="alert-circle"
          tone="danger"
          title={SANPO_MAP_MEMBERS_LOAD_ERROR}
          action={{ label: "再試行", onPress: members.retry, testID: "sanpo-map-members-retry" }}
        />
      );
    }
    return null;
  };

  const stateBody = renderBody();

  return (
    <View
      testID="sanpo-map-members-screen"
      style={[styles.root, { paddingTop: insets.top + theme.spacing[2] }]}
    >
      <View style={styles.header}>
        <IconButton
          icon="chevron-left"
          label="戻る"
          variant="ghost"
          onPress={back.goBack}
          testID="sanpo-map-members-back"
        />
        <Text accessibilityRole="header" style={styles.title}>
          メンバー
        </Text>
        <View style={styles.headerSpacer} />
      </View>
      {stateBody !== null || map === undefined ? (
        <View style={styles.center}>{stateBody}</View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + theme.spacing[6] },
          ]}
          refreshControl={
            <RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} />
          }
        >
          <Text style={styles.mapName} testID="sanpo-map-members-map-name">
            {map.name}
          </Text>
          {/* 招待できるのは owner だけ（SS-250）。editor が他人を招くと owner の知らない人が入るため。 */}
          {map.role === "owner" ? (
            <SanpoMapInviteSection sanpoMapId={map.id} sanpoMapName={map.name} />
          ) : null}
          <SanpoMapMemberList
            members={members.members}
            viewerRole={map.role}
            currentUserId={currentUserId}
            onRemove={(member) => setTarget({ mode: "remove", member })}
            onLeave={(me) => setTarget({ mode: "leave", member: me })}
          />
        </ScrollView>
      )}
      <ToastOverlay message={toast.message} visible={toast.visible} bottom={insets.bottom + 24} />
      {map !== undefined && target !== null ? (
        <SanpoMapMemberRemoveDialog
          open
          mode={target.mode}
          sanpoMapName={map.name}
          memberName={sanpoMapMemberDisplayName(target.member)}
          busy={busy}
          errorCode={removal.errorCode}
          onCancel={closeDialog}
          onConfirm={() => remove(target.member.userId)}
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
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: theme.layout.pageGutter,
  },
  content: {
    paddingHorizontal: theme.layout.pageGutter,
    gap: theme.spacing[3],
  },
  mapName: {
    fontSize: theme.typography.size.md,
    color: theme.colors.textSecondary,
  },
}));
