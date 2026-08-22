import type { ExploreCategory } from "@/api/generated/model";
import type { IconName } from "@/components/ui/icon/Icon";
import type { MapPinCategory } from "@/components/ui/map-pin/MapPin";
import type { GeoCoordinates } from "@/services/location/types";
import type { Theme } from "@/theme/tokens";

/** 探索カテゴリ。API の語彙（snake_case の enum）をそのまま UI の語彙として使う。 */
export type { ExploreCategory };

/** カテゴリごとの表示メタ情報。 */
export type CategoryMeta = {
  label: string;
  icon: IconName;
  pin: MapPinCategory;
  mapColorKey: keyof Theme["map"];
};

/** 画面が扱うスポット候補（PlaceCandidate を camelCase + 表示単位に整形したもの）。 */
export type SpotCandidate = {
  /** Google の place id。SS-16 の /explore/routes/walking に渡す。 */
  id: string;
  /**
   * 日本語優先の表示名。日本語が無い場合は provider の別言語名、
   * 値が空・不正なら「目的地」。trim 済みかつ最大256 Unicode code point。
   */
  name: string;
  category: ExploreCategory;
  location: GeoCoordinates;
  /** 往復の目安（分。四捨五入）。 */
  roundTripMinutes: number;
  /** 往復の目安距離（km。小数1桁）。 */
  roundTripKm: number;
};

/** 散歩ルートの目的地（Expo Router の route と混同しないよう walkRoute 系の語彙で統一する）。 */
export type WalkDestination = {
  /**
   * Google の place id（SpotCandidate.id）。
   * SS-33 の「復路の再計算（現在地 → 出発地）」だけは place id を持たない地点を目的地にするため
   * 空文字になりうる（`buildReturnToStartRouteRequest` が組み立てる）。
   * backend は SS-33 で `destination.place_id` を **`route_type` によらず常に任意**（`str | None`）にしたため、
   * レスポンスの `place_id` は null で返りうる（`toWalkRoute` が空文字へ写像する）。
   */
  placeId: string;
  /**
   * 画面に出す表示名。**必ず非空**であることを `toWalkRoute` が保証する。
   * backend は SS-33 で `destination.name` に**空文字を返しうる**（place_id も name も無いリクエスト＝
   * 「出発地へ帰る片道」では `""` を返す。backend は日本語の表示文言を発明しない方針）。
   * 空文字をそのまま持つと地図のピンのラベルやヘッダーが空になるため、
   * `toWalkRoute` が「呼び出し側指定 → レスポンスの name → `"目的地"`」の順で解決する
   * （`lib/walkRoute.ts` の `resolveDestinationName`）。
   */
  name: string;
  location: GeoCoordinates;
};

/** 地図の表示範囲（API の MapBounds を camelCase 化したもの）。 */
export type WalkRouteBounds = {
  northEast: GeoCoordinates;
  southWest: GeoCoordinates;
};

/** 周回ルートの区間種別。API の `legs[].kind` の語彙をそのまま使う。 */
export type WalkRouteLegKind = "outbound" | "return";

/** 周回ルートの1区間（往路 or 復路）。 */
export type WalkRouteLeg = {
  kind: WalkRouteLegKind;
  /** この区間の所要時間（秒）。 */
  durationSeconds: number;
  /** この区間の距離（m）。 */
  distanceMeters: number;
  /**
   * この区間の折れ線（2点以上）。
   * backend は 2点未満の leg を含む応答を**周回不成立とみなしてフォールバックに落とす**契約なので、
   * 2点未満の leg がここに入ることは無い（`toWalkRoute` の除外は起きない前提の最終防衛）。
   */
  path: GeoCoordinates[];
};

/**
 * 提示する徒歩ルート（/explore/routes/walking のレスポンスを画面用に整形したもの）。
 *
 * SS-33 以降、`durationSeconds` / `distanceMeters` / `path` / `bounds` は
 * **周回ルート全体（現在地 → 目的地 → 現在地）** の値である（SS-16〜SS-32 の片道値ではない）。
 * backend は周回時に `path` を legs の連結で構築するため、
 * `durationSeconds === Σ legs[].durationSeconds` / `path === legs[].path の連結` が**恒等的に成立する**
 * （丸め差も出ない。backend の実装が legs から総計・折れ線を構築しているため）。ただし mobile はこの
 * 恒等性に依存した計算を書かない（one_way・フォールバック・将来の契約変更で崩れうるため、
 * 常に「全体は全体、leg は leg」から読む）。
 * 往路・復路それぞれの値は `legs` を `lib/walkRouteLeg.ts` のセレクタ経由で参照する。
 *
 * 例外: SS-35 の復路側の再計算（`routeType: "one_way"` で「現在地 → 出発地」を引き直したもの）だけは
 * 周回ではなく片道であり、その場合 `legs` は空配列・`returnIsSamePath` は false になる。
 * 呼び出し側は `legs` の有無で分岐せず、必ず `hasDistinctLegs()` を通して判定すること。
 */
export type WalkRoute = {
  origin: GeoCoordinates;
  destination: WalkDestination;
  /** 周回全体の所要時間（秒）。 */
  durationSeconds: number;
  /** 周回全体の距離（m）。 */
  distanceMeters: number;
  /** 周回全体の折れ線（2点以上。往路+復路を連結したもの）。 */
  path: GeoCoordinates[];
  /**
   * 区間の内訳。**backend の契約では `route_type: "loop"` なら必ず2件、`"one_way"` なら空配列**
   * （周回を作れなかった場合もフォールバックとして2件返る）。
   * mobile 側の座標検証で leg が落ちた場合だけ1件になりうるが、これは起きない前提の防御であり、
   * 呼び出し側は件数を直接見ずに `hasDistinctLegs()` / `findWalkRouteLeg()` を通すこと。
   */
  legs: WalkRouteLeg[];
  /**
   * backend が周回を作れず「同じ道を戻る」フォールバックをした場合に true。
   * この時 `legs` は2件返るが往路と復路の折れ線は同一なので、描き分け・投影による
   * 往路/復路判定は意味を持たない（`hasDistinctLegs()` が false になる）。
   */
  returnIsSamePath: boolean;
  bounds: WalkRouteBounds;
};

/**
 * 進行中の散歩。サーバー由来ではない「どの散歩を今やっているか」だけを持つ
 * （ルート本体は TanStack Query が保持する）。
 */
export type ActiveWalk = {
  /** 保存の冪等キー。**散歩開始時**に採番し、終了・再送でも変えない（ADR-003 D3）。 */
  clientWalkId: string;
  /** 散歩の起点。散歩中もこの値でルートを引き続けるため、現在地の更新では書き換えない。 */
  origin: GeoCoordinates;
  destination: WalkDestination;
  /**
   * 散歩開始時に確定した**周回ルートの実値**（表示用のスナップショット）。
   * SS-32 までは /explore/places 由来の「片道×2」概算だったが、SS-33 で
   * `WalkStartView` が `walkRoute`（/explore/routes/walking の周回実値）から採るように変更した。
   */
  roundTripMinutes: number;
  roundTripKm: number;
  /** 開始時刻（`Date.now()`）。経過時間はこの値から計算する。 */
  startedAtMs: number;
};

/**
 * 終了して保存待ちの散歩。サーバー由来の値は一切含まない（保存前の端末側の事実だけ）。
 * track は「生の軌跡」で保持し、送信時の丸め・間引きは walkTrackPayload が行う。
 */
export type FinishedWalk = {
  clientWalkId: string;
  startedAtMs: number;
  endedAtMs: number;
  /** 一時停止を除いた実活動秒（= duration_seconds）。 */
  elapsedSec: number;
  /** GPS ノイズ除去後の実測距離（m）。 */
  distanceMeters: number;
  destination: WalkDestination;
  track: GeoCoordinates[];
};

/** サマリ画面の表示値（FinishedWalk から導出、または画面カタログ用の代表値）。 */
export type WalkSummaryStats = {
  elapsedSec: number;
  /** 小数1桁に丸めた km。 */
  distanceKm: number;
  steps: number;
  goalName: string;
};

/** 散歩記録の保存状態。 */
export type WalkSaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * 現在地起点のルート再計算の状態（SS-35）。
 * `idle`   … 再計算していない／直近の再計算は成功済み
 * `recalculating` … リクエスト中（同時に1つだけ）
 * `failed` … 直近のリクエストが失敗し、表示は直前の正常ルートのまま
 */
export type WalkRouteRecalcStatus = "idle" | "recalculating" | "failed";
