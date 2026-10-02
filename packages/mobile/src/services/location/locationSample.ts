import { isValidCoordinate } from "@/lib/geoCoordinate";
import type { LocationSample } from "@/services/location/types";

/**
 * 位置サンプルの変換・符号化（純粋関数。`expo-*` も `react-native` も import しない）。
 *
 * ★ 呼び出し側への注意: サンプルは機微情報（居場所）。診断ログには座標を出さず、
 *   エラーコード・件数までにすること。
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function toAccuracy(value: unknown): number | null {
  return isFiniteNumber(value) && value >= 0 ? value : null;
}

/** 検証を通ったときだけサンプルを作る。不正なら null。 */
function buildSample(
  latitude: unknown,
  longitude: unknown,
  timestampMs: unknown,
  accuracy: unknown,
): LocationSample | null {
  if (!isFiniteNumber(latitude) || !isFiniteNumber(longitude) || !isFiniteNumber(timestampMs)) {
    return null;
  }
  if (!isValidCoordinate({ latitude, longitude })) return null;
  return { latitude, longitude, timestampMs, accuracyMeters: toAccuracy(accuracy) };
}

/**
 * startLocationUpdatesAsync のタスクに届く data（{ locations: LocationObject[] }）を LocationSample[] にする。
 * 構造を見て検証し、型は expo-location に依存させない（ADR-M-006）。
 * - data が object でない、locations が配列でない → []
 * - coords.latitude / longitude が有限でない、または範囲外（isValidCoordinate）→ その点を捨てる
 * - timestamp が有限数でない → その点を捨てる
 * - coords.accuracy が有限かつ 0 以上なら accuracyMeters、それ以外は null
 */
export function toLocationSamples(data: unknown): LocationSample[] {
  if (!isRecord(data) || !Array.isArray(data.locations)) return [];
  const samples: LocationSample[] = [];
  for (const location of data.locations as unknown[]) {
    if (!isRecord(location) || !isRecord(location.coords)) continue;
    const sample = buildSample(
      location.coords.latitude,
      location.coords.longitude,
      location.timestamp,
      location.coords.accuracy,
    );
    if (sample !== null) samples.push(sample);
  }
  return samples;
}

/**
 * JSONL（1行1サンプル）。キーは短縮形 {"t","lat","lng","acc"}。空配列なら "" を返す。
 * 先頭にも改行を置く（"\nA\nB\n"）。前回の追記が途中で切れて改行なしで終わっていても、
 * 次の追記の先頭の改行で行が分かれ、壊れた行が次の有効な行を巻き込まないようにするため。
 * decode は空行を読み飛ばす。
 */
export function encodeLocationSamples(samples: readonly LocationSample[]): string {
  if (samples.length === 0) return "";
  const lines = samples.map((sample) =>
    JSON.stringify({
      t: sample.timestampMs,
      lat: sample.latitude,
      lng: sample.longitude,
      acc: sample.accuracyMeters,
    }),
  );
  return `\n${lines.join("\n")}\n`;
}

/**
 * JSONL → LocationSample[]。null・空文字 → []。
 * 壊れた行（途中で落ちて書きかけになった最終行など）・不正な値の行は捨てて残りを返す（throw しない）。
 */
export function decodeLocationSamples(raw: string | null): LocationSample[] {
  if (raw === null || raw === "") return [];
  const samples: LocationSample[] = [];
  for (const line of raw.split("\n")) {
    if (line.trim() === "") continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isRecord(parsed)) continue;
    const sample = buildSample(parsed.lat, parsed.lng, parsed.t, parsed.acc);
    if (sample !== null) samples.push(sample);
  }
  return samples;
}
