import { sanpoMapReadErrorMessage } from "@/features/sanpo-map/map/lib/sanpoMapError";
import type { SanpoMapDetailBodyState } from "@/features/sanpo-map/map/lib/sanpoMapScreenState";
import {
  isRetriablePinReadError,
  type PinReadErrorCode,
} from "@/features/sanpo-map/pin/lib/pinReadError";
import { PinStateCard } from "@/features/sanpo-map/shared/components/PinStateCard";

/** 地図を出さない状態（取得中と地図の表示を除く）。 */
type SanpoMapDetailCardState = Exclude<SanpoMapDetailBodyState, "loading" | "ready">;

export type SanpoMapDetailStateCardProps = {
  state: SanpoMapDetailCardState;
  /** `state` が "error" のときの、地図一覧の取得の失敗の分類。 */
  errorCode: PinReadErrorCode;
  onGoBack: () => void;
  onSignIn: () => void;
  onRetry: () => void;
};

/** 地図詳細（`SanpoMapDetailView`）の、地図を出さない状態の案内（id 不正・サインイン・見つからない・取得の失敗）。 */
export function SanpoMapDetailStateCard({
  state,
  errorCode,
  onGoBack,
  onSignIn,
  onRetry,
}: SanpoMapDetailStateCardProps) {
  const goBackAction = {
    label: "地図一覧へ戻る",
    onPress: onGoBack,
    testID: "sanpo-map-detail-go-back",
  };

  switch (state) {
    case "invalid-id":
      return (
        <PinStateCard
          testID="sanpo-map-detail-error"
          icon="alert-circle"
          tone="danger"
          title="地図を特定できませんでした"
          action={goBackAction}
        />
      );

    case "sign-in-required":
      return (
        <PinStateCard
          testID="sanpo-map-detail-sign-in-required"
          icon="user"
          title="地図の表示にはサインインが必要です"
          action={{ label: "サインイン", onPress: onSignIn, testID: "sanpo-map-detail-sign-in" }}
        />
      );

    case "not-found":
      return (
        <PinStateCard
          testID="sanpo-map-detail-error"
          icon="alert-circle"
          tone="danger"
          title="この地図は見つかりませんでした。削除された可能性があります。"
          action={goBackAction}
        />
      );

    case "error":
      return (
        <PinStateCard
          testID="sanpo-map-detail-error"
          icon="alert-circle"
          tone="danger"
          title={sanpoMapReadErrorMessage(errorCode, "maps")}
          action={
            isRetriablePinReadError(errorCode)
              ? { label: "再試行", onPress: onRetry, testID: "sanpo-map-detail-retry" }
              : undefined
          }
        />
      );

    default: {
      const exhaustiveCheck: never = state;
      return exhaustiveCheck;
    }
  }
}
