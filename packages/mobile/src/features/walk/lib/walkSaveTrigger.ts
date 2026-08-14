/**
 * 「保存（`POST /walks`）を自動発火すべきか」の判定（純粋関数）。
 *
 * `useWalkSave` の `useEffect` は「同じドラフト × 同じ認証状態につき1回だけ」自動発火する
 * （ADR-008 決定4 の SS-37 追補）。ゲストで 401 になったドラフトはサインイン後
 * （guest → signed-in）にもう一度だけ自動発火してほしいため、発火済みかどうかの
 * 判定キーに `clientWalkId` だけでなく `isSignedIn` を含める。
 */

/** 自動発火の重複判定キー。「どのドラフトを、どの認証状態で投げたか」を1つの文字列で表す。 */
export function walkSaveFireKey(clientWalkId: string, isSignedIn: boolean): string {
  return `${clientWalkId}:${isSignedIn ? "signed-in" : "guest"}`;
}

export type WalkSaveFireInput = {
  /** 保存対象ドラフトの clientWalkId。ドラフトが無ければ null。 */
  clientWalkId: string | null;
  /** 保存済み（`useFinishedWalkStore.saved`）。 */
  saved: boolean;
  /** 認証済みか。`app/walk-summary.tsx` が `useAuthSessionStore` から注入する。 */
  isSignedIn: boolean;
  /** 直近に発火したキー（未発火なら null）。 */
  lastFiredKey: string | null;
};

/**
 * 自動発火すべきなら「今回のキー」を、不要なら null を返す（純粋）。
 *
 * `clientWalkId` だけでなく `isSignedIn` をキーに含めるのが SS-37 の要点。
 * ゲストで 401 になったドラフトは、サインイン後（guest → signed-in）に**もう一度だけ**
 * 自動発火してほしい。キーが変わることでそれが表現できる。
 * 逆向き（signed-in → guest）でも発火するが、
 * (1) `POST /walks` は `client_walk_id` で冪等なので履歴は増えない、
 * (2) この遷移では `AuthGate` がサマリ画面から退避させる、
 * ため実害が無く、規則を1本に保つことを優先する。
 */
export function nextWalkSaveFireKey(input: WalkSaveFireInput): string | null {
  if (input.clientWalkId === null) return null;
  if (input.saved) return null;
  const key = walkSaveFireKey(input.clientWalkId, input.isSignedIn);
  return key === input.lastFiredKey ? null : key;
}
