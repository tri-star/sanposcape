#!/usr/bin/env node
// LP（packages/lp）のページを、PC とスマホの幅で節ごとに撮る（SS-263）。
// 使い方は `node scripts/lp-tools/capture-lp.mjs --help`。Claude Code の sandbox の外で実行する。
import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CdpClient,
  ChromeLaunchError,
  findChrome,
  launchChrome,
} from "./lib/chrome.mjs";
import { capturePage } from "./lib/capture-page.mjs";
import { USAGE, UsageError, parseOptions } from "./lib/options.mjs";
import { renderMarkdown, renderSummary } from "./lib/report.mjs";
import { resolveRequestPath, startStaticServer } from "./lib/static-server.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
// 横スクロールを測るときの viewport の高さ（よくある画面の高さ）
const INITIAL_HEIGHTS = { desktop: 900, mobile: 844 };

async function ensurePageBuilt(dist, path) {
  const file = resolveRequestPath(dist, path);
  try {
    await access(file ?? "");
  } catch {
    throw new UsageError(
      `${dist} に ${path} がありません（${file}）。先に \`pnpm --filter lp build\` を実行してください。`,
    );
  }
}

async function openPage(cdp) {
  const { targetId } = await cdp.send("Target.createTarget", {
    url: "about:blank",
  });
  const { sessionId } = await cdp.send("Target.attachToTarget", {
    targetId,
    flatten: true,
  });
  await cdp.send("Page.enable", {}, sessionId);
  await cdp.send("Runtime.enable", {}, sessionId);
  return sessionId;
}

async function run(options) {
  await ensurePageBuilt(options.dist, options.path);
  const executable = await findChrome(options.chrome);
  const server = await startStaticServer(options.dist);
  let chrome;
  let cdp;
  try {
    chrome = await launchChrome(executable);
    cdp = await CdpClient.connect(chrome.wsUrl);
    const { product } = await cdp.send("Browser.getVersion");
    const sessionId = await openPage(cdp);
    await mkdir(options.out, { recursive: true });

    const results = [];
    for (const width of options.widths) {
      const initialHeight =
        width < 768 ? INITIAL_HEIGHTS.mobile : INITIAL_HEIGHTS.desktop;
      results.push(
        await capturePage(cdp, sessionId, {
          url: `${server.origin}${options.path}`,
          width,
          initialHeight,
          outDir: options.out,
          maxWidth: options.maxWidth,
        }),
      );
    }

    const report = {
      capturedAt: new Date().toISOString(),
      chrome: { product, executable },
      path: options.path,
      dist: options.dist,
      results,
      horizontalScroll: results.some(
        (r) => r.overflow.scrollWidth > r.overflow.clientWidth,
      ),
      files: results.flatMap((r) => r.shots.map((s) => s.file)),
      reportFile: join(options.out, "report.json"),
      markdownFile: join(options.out, "screenshots.md"),
    };
    await writeFile(report.reportFile, `${JSON.stringify(report, null, 2)}\n`);
    await writeFile(report.markdownFile, renderMarkdown(report));
    console.log(renderSummary(report));
  } finally {
    cdp?.close();
    await chrome?.close();
    await server.close();
  }
}

async function main() {
  let options;
  try {
    options = parseOptions(process.argv.slice(2), {
      repoRoot: REPO_ROOT,
      env: process.env,
    });
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    console.error(`${error.message}\n\n${USAGE}`);
    return 2;
  }
  if (options.help) {
    console.log(USAGE);
    return 0;
  }
  try {
    await run(options);
    return 0;
  } catch (error) {
    if (error instanceof ChromeLaunchError || error instanceof UsageError) {
      console.error(error.message);
      return 1;
    }
    throw error;
  }
}

process.exitCode = await main();
