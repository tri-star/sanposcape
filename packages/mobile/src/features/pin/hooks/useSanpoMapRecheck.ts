import { useEffect, useRef, useState } from "react";

/**
 * 地図詳細を開いたとき、地図一覧のキャッシュに id が無い場合の取り直し（SS-121。mobile ADR-014 D7）。
 * 地図一覧のキャッシュ（staleTime 5 分）が古いだけで not-found を確定しないよう、id ごとに
 * 一覧を1回だけ取り直す（取り直しても無ければ呼び出し側が not-found にする）。
 *
 * - 一覧が取得中なら、その取得に任せて新たに取り直さない（取得中の間は `pending` で loading 扱い）。
 * - `mapFound` が true になった id は確認済みとして扱う（あとから消えた場合に再取得を重ねない。
 *   引っ張って更新で取り直した結果が「無い」なら、そのまま not-found にする）。
 * - 取り直しの失敗（データ保持のまま）は握りつぶす。`refresh` は失敗でも解決する前提。
 */
export function useSanpoMapRecheck(input: {
  sanpoMapId: string | null;
  enabled: boolean;
  mapsReady: boolean;
  mapFound: boolean;
  mapsFetching: boolean;
  refreshMaps: () => Promise<void>;
}): { pending: boolean } {
  const { sanpoMapId, enabled, mapsReady, mapFound, mapsFetching, refreshMaps } = input;
  const [settledId, setSettledId] = useState<string | null>(null);
  const startedIdRef = useRef<string | null>(null);

  // 見つかった id は確認済みにする（レンダー中の state 調整。effect だと余分な再レンダーになる）。
  if (sanpoMapId !== null && mapFound && settledId !== sanpoMapId) setSettledId(sanpoMapId);

  const settled = sanpoMapId !== null && settledId === sanpoMapId;
  const needsRecheck = enabled && sanpoMapId !== null && mapsReady && !mapFound && !settled;

  useEffect(() => {
    if (sanpoMapId === null) return;
    if (!needsRecheck || mapsFetching) return;
    if (startedIdRef.current === sanpoMapId) return;
    startedIdRef.current = sanpoMapId;
    void refreshMaps().finally(() => setSettledId(sanpoMapId));
  }, [sanpoMapId, needsRecheck, mapsFetching, refreshMaps]);

  return { pending: needsRecheck };
}
