import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Badge } from "@/components/ui/badge/Badge";
import { Button } from "@/components/ui/button/Button";
import { IconButton } from "@/components/ui/icon-button/IconButton";
import { ToastOverlay } from "@/components/ui/toast/ToastOverlay";
import { PinStateCard } from "@/features/pin/components/PinStateCard";
import { SanpoMapMemberAvatar } from "@/features/pin/components/SanpoMapMemberAvatar";
import { SanpoMapMemberRemoveDialog } from "@/features/pin/components/SanpoMapMemberRemoveDialog";
import { usePullToRefresh } from "@/features/pin/hooks/usePullToRefresh";
import { useSanpoMapMemberRemove } from "@/features/pin/hooks/useSanpoMapMemberRemove";
import { useSanpoMapMembers } from "@/features/pin/hooks/useSanpoMapMembers";
import { useSanpoMaps } from "@/features/pin/hooks/useSanpoMaps";
import {
  SANPO_MAP_LEAVE_LABEL,
  SANPO_MAP_MEMBERS_LOAD_ERROR,
  canRemoveSanpoMapMember,
  canShowSanpoMapMembers,
  sanpoMapLeftMessage,
  sanpoMapMemberDisplayName,
  sanpoMapMemberRemovedMessage,
  sanpoMapMemberRoleLabel,
} from "@/features/pin/lib/sanpoMapMember";
import type { SanpoMapMember } from "@/features/pin/types";
import { useScreenBack } from "@/hooks/useScreenBack";
import { useToast } from "@/hooks/useToast";
import { setFlashMessage } from "@/lib/flashMessage";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

export type SanpoMapMembersViewProps = {
  /** ルートで isUuid を通した値。不正なら null。 */
  sanpoMapId: string | null;
  /** サインイン中の利用者の ID（features/pin は認証を読まないのでルートから渡す）。ゲストは null。 */
  currentUserId: string | null;
  /** フラグ `map_invitation`（ルートが読む）。 */
  mapInvitationEnabled: boolean;
};

/** 確認ダイアログの対象。null なら閉じている。 */
type RemoveTarget = { mode: "leave" | "remove"; member: SanpoMapMember } | null;

/**
 * SanpoMapMembersView — 地図のメンバー画面（`/sanpo-maps/[sanpoMapId]/members`。SS-249）。
 * メンバーの一覧（表示名・オーナー／メンバー・あなた）。owner は自分以外を「外す」、editor は「この地図から抜ける」。
 * 外した人・抜けた人が追加したピン・写真・タグは地図に残る（確認ダイアログで伝える。ADR-009 決定38）。
 * 地図の名前と自分の役割は地図一覧のキャッシュから引く（地図詳細と同じ。ADR-M-014 D3）。
 */
export function SanpoMapMembersView({
  sanpoMapId,
  currentUserId,
  mapInvitationEnabled,
}: SanpoMapMembersViewProps) {
  const theme = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const signedIn = currentUserId !== null;
  const maps = useSanpoMaps({ enabled: signedIn });
  const map =
    sanpoMapId === null ? undefined : maps.maps.find((candidate) => candidate.id === sanpoMapId);
  const visible =
    map !== undefined && canShowSanpoMapMembers({ mapInvitationEnabled, role: map.role });
  const members = useSanpoMapMembers(sanpoMapId, { enabled: signedIn && visible });
  const toast = useToast();
  const { show: showToast } = toast;
  const [target, setTarget] = useState<RemoveTarget>(null);

  const removal = useSanpoMapMemberRemove(sanpoMapId, {
    currentUserId,
    onRemoved: ({ leaving }) => {
      const removedName = target === null ? "" : sanpoMapMemberDisplayName(target.member);
      setTarget(null);
      if (leaving) {
        // 抜けた地図の詳細には戻れない（404 になる）ので、地図一覧まで戻ってそこで知らせる。
        setFlashMessage(sanpoMapLeftMessage(map?.name ?? ""));
        router.dismissTo("/sanpo-maps");
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
    if (!visible) {
      return (
        <PinStateCard
          testID="sanpo-map-members-unavailable"
          icon="alert-circle"
          title="この機能はまだ使えません"
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
          <View style={styles.list}>
            {members.members.map((member, index) => {
              const name = sanpoMapMemberDisplayName(member);
              const isMe = member.userId === currentUserId;
              const removable = canRemoveSanpoMapMember({
                viewerRole: map.role,
                viewerUserId: currentUserId,
                member,
              });
              return (
                <View
                  key={member.userId}
                  style={[styles.row, index === 0 ? null : styles.rowDivider]}
                  testID={`sanpo-map-member-${index}`}
                >
                  <SanpoMapMemberAvatar member={member} size={36} />
                  <View style={styles.rowText}>
                    <Text style={styles.memberName} numberOfLines={1}>
                      {name}
                      {isMe ? <Text style={styles.me}>（あなた）</Text> : null}
                    </Text>
                    <View style={styles.badges}>
                      <Badge tone={member.role === "owner" ? "info" : "neutral"}>
                        {sanpoMapMemberRoleLabel(member.role)}
                      </Badge>
                    </View>
                  </View>
                  {removable ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onPress={() => setTarget({ mode: "remove", member })}
                      accessibilityLabel={`${name}さんを外す`}
                      testID={`sanpo-map-member-remove-${index}`}
                    >
                      外す
                    </Button>
                  ) : null}
                </View>
              );
            })}
          </View>
          {map.role === "editor" && currentUserId !== null ? (
            <Button
              variant="danger"
              fullWidth
              onPress={() => {
                const me = members.members.find((member) => member.userId === currentUserId);
                if (me !== undefined) setTarget({ mode: "leave", member: me });
              }}
              testID="sanpo-map-members-leave"
              style={styles.leave}
            >
              {SANPO_MAP_LEAVE_LABEL}
            </Button>
          ) : null}
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
  list: {
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surfaceCard,
    paddingHorizontal: theme.spacing[3],
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    minHeight: 56,
    paddingVertical: theme.spacing[2],
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderSubtle,
  },
  rowText: {
    flex: 1,
    gap: theme.spacing[1],
  },
  memberName: {
    fontSize: theme.typography.size.md,
    fontWeight: theme.typography.weight.bold,
    color: theme.colors.textPrimary,
  },
  me: {
    fontWeight: theme.typography.weight.regular,
    color: theme.colors.textSecondary,
  },
  badges: {
    flexDirection: "row",
  },
  leave: {
    marginTop: theme.spacing[3],
  },
}));
