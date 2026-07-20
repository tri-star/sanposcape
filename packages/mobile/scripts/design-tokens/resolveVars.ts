/**
 * `var(--name)` / `var(--name, fallback)` 形式のエイリアスを実値まで再帰的に解決する。
 *
 * CSS パーサライブラリを追加しない方針(parseCss.ts と同様)のため、
 * 波括弧ではなく丸括弧の対応関係を自前で数えて `var(...)` の呼び出しを検出する
 * (box-shadow の `rgba(...)` や cubic-bezier のようなネストした関数呼び出しにも対応するため)。
 */

const MAX_RESOLUTION_DEPTH = 20;

type VarCall = {
  /** 元の値文字列における `var(` の開始インデックス */
  start: number;
  /** 対応する `)` のインデックス */
  end: number;
  /** 先頭の `--` を除いた変数名 */
  name: string;
  /** `var(--x, fallback)` の第2引数(未指定なら undefined) */
  fallback?: string;
};

function findMatchingParen(value: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < value.length; i++) {
    if (value[i] === "(") {
      depth++;
    } else if (value[i] === ")") {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }
  throw new Error(`resolveVars: var() の括弧が閉じられていません: "${value}"`);
}

/** `depth === 0` の位置にある最初のカンマのインデックスを返す(無ければ -1) */
function findTopLevelComma(value: string): number {
  let depth = 0;
  for (let i = 0; i < value.length; i++) {
    if (value[i] === "(") {
      depth++;
    } else if (value[i] === ")") {
      depth--;
    } else if (value[i] === "," && depth === 0) {
      return i;
    }
  }
  return -1;
}

/** 値文字列中で最初に現れる `var(...)` 呼び出しを1つ検出する(無ければ null) */
function findFirstVarCall(value: string): VarCall | null {
  const varIndex = value.indexOf("var(");
  if (varIndex === -1) {
    return null;
  }

  const openIndex = varIndex + "var".length;
  const closeIndex = findMatchingParen(value, openIndex);
  const inner = value.slice(openIndex + 1, closeIndex);

  const commaIndex = findTopLevelComma(inner);
  const namePart = (commaIndex === -1 ? inner : inner.slice(0, commaIndex)).trim();
  const fallbackPart = commaIndex === -1 ? undefined : inner.slice(commaIndex + 1).trim();

  if (!namePart.startsWith("--")) {
    throw new Error(`resolveVars: var() の第1引数が不正です: "${namePart}"`);
  }

  return { start: varIndex, end: closeIndex, name: namePart.slice(2), fallback: fallbackPart };
}

export function resolveVars(
  declarations: Record<string, string>,
  /** 解決に使う追加のスコープ(例: :root の宣言)。同名は declarations が優先 */
  fallbackScope?: Record<string, string>,
): Record<string, string> {
  // 変数名 → 解決済みの値。declarations / fallbackScope どちらの名前も同じキャッシュに乗せてよい
  // (`lookup` が常に declarations を優先するため、名前が指す値は一意に定まる)。
  const cache = new Map<string, string>();
  // 現在解決中の変数名(循環参照検出用)
  const resolving = new Set<string>();

  function lookup(name: string): string | undefined {
    return declarations[name] ?? fallbackScope?.[name];
  }

  function resolveName(name: string, depth: number): string {
    const cached = cache.get(name);
    if (cached !== undefined) {
      return cached;
    }
    if (resolving.has(name)) {
      throw new Error(`resolveVars: 循環参照を検出しました(--${name})`);
    }
    if (depth > MAX_RESOLUTION_DEPTH) {
      throw new Error(
        `resolveVars: 解決の深さが上限(${MAX_RESOLUTION_DEPTH})を超えました(--${name})`,
      );
    }

    const raw = lookup(name);
    if (raw === undefined) {
      throw new Error(`resolveVars: 未定義の変数を参照しています(--${name})`);
    }

    resolving.add(name);
    const value = resolveValue(raw, depth + 1);
    resolving.delete(name);

    cache.set(name, value);
    return value;
  }

  function resolveValue(value: string, depth: number): string {
    if (depth > MAX_RESOLUTION_DEPTH) {
      throw new Error(
        `resolveVars: 解決の深さが上限(${MAX_RESOLUTION_DEPTH})を超えました: "${value}"`,
      );
    }

    let result = value;
    let call = findFirstVarCall(result);
    while (call !== null) {
      const { start, end, name, fallback } = call;

      let replacement: string;
      if (lookup(name) !== undefined) {
        replacement = resolveName(name, depth + 1);
      } else if (fallback !== undefined) {
        replacement = resolveValue(fallback, depth + 1);
      } else {
        throw new Error(
          `resolveVars: 未定義の変数 --${name} を参照していて、フォールバックもありません`,
        );
      }

      result = result.slice(0, start) + replacement + result.slice(end + 1);
      call = findFirstVarCall(result);
    }
    return result;
  }

  const output: Record<string, string> = {};
  for (const name of Object.keys(declarations)) {
    output[name] = resolveName(name, 0);
  }
  return output;
}
