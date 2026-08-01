/** UUID v4 のバイト長。 */
const UUID_BYTE_LENGTH = 16;
/** `random` の取り得る最大値。1.0 は含めない。 */
const MAX_RANDOM_VALUE = 1 - Number.EPSILON;

/**
 * RFC 4122 v4 形式の UUID 文字列を生成する純粋関数。
 *
 * `crypto.randomUUID` / `expo-crypto` を使わない理由:
 * - Expo SDK 57 / RN 0.86 の実行時に `crypto.randomUUID` / `getRandomValues` は存在しない
 *   （`node_modules/expo`・`node_modules/react-native/Libraries` に実装なし）。
 * - `expo-crypto` を追加するとネイティブモジュールが1つ増え、`@expo/fingerprint` が変化して
 *   ADR-004 の E2E APK キャッシュを1回ミスさせる。
 * - 用途は保存の冪等キー（`client_walk_id`）であり暗号強度を要しない。
 *
 * `random` はテストのために注入可能（既定 `Math.random`）。0..1 の一様乱数を返す関数を渡すこと。
 */
export function randomUuidV4(random: () => number = Math.random): string {
  const bytes = new Array<number>(UUID_BYTE_LENGTH);
  for (let i = 0; i < UUID_BYTE_LENGTH; i += 1) {
    const randomValue = Math.min(Math.max(random(), 0), MAX_RANDOM_VALUE);
    bytes[i] = Math.floor(randomValue * 256);
  }

  // version 4: 上位4ビットを 0100 にする。
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  // variant 10xxxxxx（RFC 4122）。
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = bytes.map((byte) => byte.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}
