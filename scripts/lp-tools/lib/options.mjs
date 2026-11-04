// capture-lp.mjs のコマンドライン引数を解釈する。
import { parseArgs } from "node:util";
import { resolve } from "node:path";

export const USAGE = `使い方: node scripts/lp-tools/capture-lp.mjs --out <出力先> [オプション]

  pnpm --filter lp build の後の dist を 127.0.0.1 で配信し、システムの Chrome（sandbox 付き）で
  ページを節（main > section）ごとに撮る。Claude Code の sandbox の外で実行する。

  --out <dir>         画像と report.json・screenshots.md を書く場所（必須）
  --dist <dir>        配信する dist（既定: packages/lp/dist）
  --path <path>       撮るページ（既定: /。例: /privacy/）。main > section が無いページは main を1枚で撮る
  --widths <list>     撮る幅（px）をカンマ区切りで（既定: 1440,390）
  --max-width <px>    これより広い幅の画像を、この幅に縮小して保存する（PR に添付するときは 720）
  --chrome <path>     Chrome の実行ファイル（既定: 環境変数 LP_CHROME、無ければ /usr/bin/google-chrome など）
  -h, --help          この説明を出す

  終了コード: 0 = 撮れた（横スクロールがあっても 0）、1 = Chrome が無い・起動できない、
  2 = 引数の誤り・dist が無い、3 = 撮影の途中で失敗した（ページを開けない・CDP の応答が無いなど）`;

export class UsageError extends Error {}

function parsePositiveInt(value, label) {
  if (!/^\d+$/.test(value) || Number(value) <= 0) {
    throw new UsageError(`${label} は正の整数で指定してください: ${value}`);
  }
  return Number(value);
}

/**
 * @param {string[]} argv process.argv.slice(2)
 * @param {{ repoRoot: string, env: Record<string, string | undefined> }} context
 */
export function parseOptions(argv, { repoRoot, env }) {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        out: { type: "string" },
        dist: { type: "string" },
        path: { type: "string", default: "/" },
        widths: { type: "string", default: "1440,390" },
        "max-width": { type: "string" },
        chrome: { type: "string" },
        help: { type: "boolean", short: "h", default: false },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch (error) {
    throw new UsageError(error.message);
  }
  if (values.help) return { help: true };
  if (!values.out) throw new UsageError("--out を指定してください");
  if (!values.path.startsWith("/"))
    throw new UsageError(`--path は / で始めてください: ${values.path}`);
  const widths = values.widths
    .split(",")
    .map((w) => parsePositiveInt(w.trim(), "--widths"));
  return {
    help: false,
    out: resolve(values.out),
    dist: resolve(values.dist ?? resolve(repoRoot, "packages/lp/dist")),
    path: values.path,
    widths,
    maxWidth: values["max-width"]
      ? parsePositiveInt(values["max-width"], "--max-width")
      : undefined,
    chrome: values.chrome ?? (env.LP_CHROME || undefined),
  };
}
