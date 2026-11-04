// 撮影の結果を、端末への要約と PR のコメントに貼る Markdown の表にする。

/** 表のセルに入れる文字列から、表を壊す `|` と Markdown の記号を逃がす。 */
export function escapeCell(text) {
  return text.replace(/[\\|*_`[\]<>]/g, (c) => `\\${c}`);
}

/**
 * 幅ごとの横スクロールの判定の1行。要素の名前（ページの id・class から作る）は escape を通す
 * （Markdown に入れるときは escapeCell）。
 */
export function overflowLine({ width, overflow }, escape = (text) => text) {
  const { scrollWidth, clientWidth, offenders } = overflow;
  if (scrollWidth <= clientWidth)
    return `${width}px: 横スクロールなし（scrollWidth ${scrollWidth} / clientWidth ${clientWidth}）`;
  const where = offenders
    .map((o) => `${escape(o.element)}（${o.left}〜${o.right}px）`)
    .join("、");
  return `${width}px: 横スクロールあり（scrollWidth ${scrollWidth} > clientWidth ${clientWidth}）${where ? ` はみ出し: ${where}` : ""}`;
}

export const VIEWPORT_DEPENDENT_NOTE =
  "viewport の高さで文書の高さが変わるレイアウト（vh など）があります。画像の高さが実際の画面と違うことがあります";

/** 端末に出す要約。 */
export function renderSummary(report) {
  const lines = [
    `Chrome: ${report.chrome.product}（${report.chrome.executable}）`,
    `ページ: ${report.path}`,
  ];
  for (const result of report.results) {
    lines.push(overflowLine(result));
    if (result.images.broken.length > 0)
      lines.push(`  読み込めなかった画像: ${result.images.broken.join(", ")}`);
    if (result.images.timedOut)
      lines.push("  画像の読み込みの待ちが時間切れになりました");
    if (result.viewportDependent) lines.push(`  ${VIEWPORT_DEPENDENT_NOTE}`);
    if (result.skipped?.length > 0)
      lines.push(
        `  viewport の外にあり撮らなかった節: ${result.skipped.join(", ")}`,
      );
    for (const shot of result.shots)
      lines.push(`  ${shot.file}（${shot.width}x${shot.height}）`);
  }
  lines.push(`レポート: ${report.reportFile}`, `表: ${report.markdownFile}`);
  return lines.join("\n");
}

/**
 * PR のコメントに貼る表。行が節、列が幅。画像は絶対パスで参照する
 * （gh の --attach に同じパスを渡すと、アップロード先の URL に書き換わる）。
 */
export function renderMarkdown(report) {
  const widths = report.results.map((r) => r.width);
  const names = [];
  const headings = new Map();
  for (const result of report.results) {
    for (const shot of result.shots) {
      if (!names.includes(shot.name)) names.push(shot.name);
      if (shot.heading && !headings.has(shot.name))
        headings.set(shot.name, shot.heading);
    }
  }
  const lines = [
    `- Chrome: ${report.chrome.product}`,
    `- ページ: \`${report.path}\``,
    ...report.results.map((r) => `- ${overflowLine(r, escapeCell)}`),
    ...report.results
      .filter((r) => r.viewportDependent)
      .map((r) => `- ${r.width}px: ${VIEWPORT_DEPENDENT_NOTE}`),
    "",
    `| 節 | ${widths.map((w) => `${w}px`).join(" | ")} |`,
    `|---|${widths.map(() => "---").join("|")}|`,
  ];
  for (const name of names) {
    const cells = report.results.map((result) => {
      const shot = result.shots.find((s) => s.name === name);
      return shot ? `![${name} ${result.width}px](${shot.file})` : "（なし）";
    });
    const heading = headings.get(name);
    const label = heading ? `${name}<br>${escapeCell(heading)}` : name;
    lines.push(`| ${label} | ${cells.join(" | ")} |`);
  }
  return `${lines.join("\n")}\n`;
}
