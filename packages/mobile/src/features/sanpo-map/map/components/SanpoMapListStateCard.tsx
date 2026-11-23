import { PinStateCard } from "@/features/sanpo-map/shared/components/PinStateCard";
import { sanpoMapReadErrorMessage } from "@/features/sanpo-map/map/lib/sanpoMapError";
import {
  sanpoMapNoMatchTitle,
  type SanpoMapListBodyState,
} from "@/features/sanpo-map/map/lib/sanpoMapScreenState";
import {
  isRetriablePinReadError,
  type PinReadErrorCode,
} from "@/features/sanpo-map/pin/lib/pinReadError";

/** 一覧を出さない状態（取得中と一覧の表示を除く）。 */
type SanpoMapListCardState = Exclude<SanpoMapListBodyState, "loading" | "ready">;

export type SanpoMapListStateCardProps = {
  state: SanpoMapListCardState;
  /** `state` が "error" のときの分類。 */
  errorCode: PinReadErrorCode;
  /** 絞り込みの語（"no-match" の見出しに使う）。 */
  query: string;
  onSignIn: () => void;
  onRetry: () => void;
};

/** 地図一覧（`SanpoMapListView`）の、一覧を出さない状態の案内（サインイン・取得の失敗・空・該当なし）。 */
export function SanpoMapListStateCard({
  state,
  errorCode,
  query,
  onSignIn,
  onRetry,
}: SanpoMapListStateCardProps) {
  switch (state) {
    case "sign-in-required":
      return (
        <PinStateCard
          testID="sanpo-map-list-sign-in-required"
          icon="user"
          title="地図の一覧を見るにはサインインが必要です"
          action={{ label: "サインイン", onPress: onSignIn, testID: "sanpo-map-list-sign-in" }}
        />
      );

    case "error":
      return (
        <PinStateCard
          testID="sanpo-map-list-error"
          icon="alert-circle"
          tone="danger"
          title={sanpoMapReadErrorMessage(errorCode, "maps")}
          action={
            isRetriablePinReadError(errorCode)
              ? { label: "再試行", onPress: onRetry, testID: "sanpo-map-list-retry" }
              : undefined
          }
        />
      );

    case "empty":
      return (
        <PinStateCard
          testID="sanpo-map-list-empty"
          icon="map"
          title="まだ地図がありません"
          description="右下の＋から地図を作成できます。ピンを登録すると「最初の地図」が自動で作られます"
        />
      );

    case "no-match":
      return (
        <PinStateCard
          testID="sanpo-map-list-no-match"
          icon="search-x"
          title={sanpoMapNoMatchTitle(query)}
        />
      );

    default: {
      const exhaustiveCheck: never = state;
      return exhaustiveCheck;
    }
  }
}
