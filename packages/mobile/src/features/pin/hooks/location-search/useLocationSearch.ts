import { useMutation } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { Keyboard } from "react-native";

import {
  fetchLocationSearch,
  type LocationSearchResponse,
} from "@/features/pin/api/locationSearchApi";
import {
  buildLocationSearchRequest,
  locationSearchFocusRegion,
  normalizeLocationSearchQuery,
  type LocationSearchResult,
} from "@/features/pin/lib/location-search/locationSearch";
import {
  locationSearchErrorMessage,
  locationSearchResultMessage,
} from "@/features/pin/lib/location-search/locationSearchMessage";
import type { MapRegion } from "@/lib/mapRegion";

type SearchVariables = { query: string; visibleRegion: MapRegion };

export type UseLocationSearchOptions = {
  /** 表示範囲の外まで広げて見つけたとき、地図をそこへ動かす（ピンタブの `regionRequest`）。 */
  onFocusRegion: (region: MapRegion) => void;
};

export type UseLocationSearchResult = {
  /** 入力欄の文字。 */
  query: string;
  setQuery: (value: string) => void;
  /** 地図に打つ検索結果のピン。検索中・失敗・クリアの後は空。 */
  results: readonly LocationSearchResult[];
  selected: LocationSearchResult | null;
  select: (id: string) => void;
  /** 結果のカードを閉じる（ピンは残す）。 */
  deselect: () => void;
  /**
   * その結果のピンを地図から外し、カードも閉じる（SS-272。カードからピンの登録画面を開いたとき、
   * 戻ったときに新しいピンの上に検索結果のピンが重ならないようにする）。次の検索・クリアで戻す。
   */
  dismiss: (id: string) => void;
  isSearching: boolean;
  /** 検索欄の下に出す案内（0件・広げて探した・失敗）。無ければ null。 */
  message: string | null;
  isError: boolean;
  /** 今の表示範囲で探す。検索語が空・表示範囲が未確定なら何もしない。 */
  submit: (visibleRegion: MapRegion | null) => void;
  /** 入力・結果のピン・案内をまとめて消す（課題の「ピン一式をクリア」）。 */
  clear: () => void;
};

/**
 * ピンタブの検索（SS-267。ADR-M-026）。送信のたびに `POST /explore/places/text-search` を1回呼ぶ（backend が画面内 → 1段階の拡大まで行う）。
 *
 * - 結果は Google Places の内容なので、TanStack Query のキャッシュ（useQuery）に載せず、mutation の状態（メモリ）だけに持つ。
 *   画面を離れても常駐タブなので残るが、クリアで消える。サインアウトではルートが検索欄ごと外す。
 * - 新しい検索・クリアの後に前の要求の応答が届いても、mutation の状態は最後の `mutate` の分だけを映す（TanStack Query v5）。
 *   地図を動かすのも `mutate` の呼び出しごとの `onSuccess` で行うので、古い応答では動かない。
 * - POST なので `customFetch` の一時障害の再送は効かない。失敗は案内を出し、利用者がもう一度送る。
 */
export function useLocationSearch({
  onFocusRegion,
}: UseLocationSearchOptions): UseLocationSearchResult {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dismissedIds, setDismissedIds] = useState<ReadonlySet<string>>(() => new Set());
  const mutation = useMutation<LocationSearchResponse, unknown, SearchVariables>({
    mutationFn: ({ query: rawQuery, visibleRegion }) => {
      const request = buildLocationSearchRequest(rawQuery, visibleRegion);
      // submit で弾いているので通常は来ない（型の網羅のため）。
      if (request === null) return Promise.resolve({ results: [], scope: "visible_area" });
      return fetchLocationSearch(request);
    },
  });
  const { mutate, reset } = mutation;

  const submit = useCallback(
    (visibleRegion: MapRegion | null) => {
      if (visibleRegion === null || normalizeLocationSearchQuery(query) === null) return;
      Keyboard.dismiss();
      setSelectedId(null);
      setDismissedIds(new Set());
      mutate(
        { query, visibleRegion },
        {
          onSuccess: (data) => {
            const region = locationSearchFocusRegion(data.results, data.scope);
            if (region !== null) onFocusRegion(region);
          },
        },
      );
    },
    [query, mutate, onFocusRegion],
  );

  const clear = useCallback(() => {
    setQuery("");
    setSelectedId(null);
    setDismissedIds(new Set());
    reset();
  }, [reset]);

  const dismiss = useCallback((id: string) => {
    setSelectedId(null);
    setDismissedIds((previous) => new Set(previous).add(id));
  }, []);

  // `LocationSearchMarkers` に渡すので、応答と外した結果が変わらない間は同じ配列を返す。
  const data = mutation.isSuccess ? mutation.data : null;
  const results = useMemo(
    () => (data === null ? [] : data.results.filter((result) => !dismissedIds.has(result.id))),
    [data, dismissedIds],
  );
  const selected = results.find((result) => result.id === selectedId) ?? null;
  let message: string | null = null;
  if (mutation.isError) {
    message = locationSearchErrorMessage(mutation.error);
  } else if (mutation.isSuccess) {
    message = locationSearchResultMessage({
      query: normalizeLocationSearchQuery(mutation.variables.query) ?? "",
      resultCount: mutation.data.results.length,
      scope: mutation.data.scope,
    });
  }

  return {
    query,
    setQuery,
    results,
    selected,
    select: setSelectedId,
    deselect: () => setSelectedId(null),
    dismiss,
    isSearching: mutation.isPending,
    message,
    isError: mutation.isError,
    submit,
    clear,
  };
}
