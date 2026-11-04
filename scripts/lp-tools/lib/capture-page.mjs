// 1つの幅で LP のページを開き、横スクロールを測ってから節ごとに撮る。
//
// viewport の高さを文書の高さまで広げてから撮る。こうすると、遅延読み込み（loading="lazy"）の画像も
// viewport の中に入り、sticky のヘッダーはページの上端にとどまって節に重ならない。
// vh などで viewport の高さに合わせて伸びるレイアウトは、広げると実際の画面と違う高さになる。
// トップページは vh を使っていない。404 は `min-height: 60vh` だが、文書が初期の viewport に収まるので広げない。
// 広げて高さが変わったときは viewportDependent として知らせる（画像の高さを実際の画面と見比べる）。
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const IMAGE_WAIT_MS = 30_000;
const MAX_HEIGHT_PASSES = 4;

// ---- ページの中で評価する関数（Runtime.evaluate に文字列で渡す） ----

function measureOverflowInPage() {
  const root = document.documentElement;
  const clientWidth = root.clientWidth;
  const scrollWidth = root.scrollWidth;
  const offenders = [];
  if (scrollWidth > clientWidth) {
    const describe = (el) => {
      const id = el.id ? `#${el.id}` : "";
      const classes = [...el.classList]
        .slice(0, 2)
        .map((c) => `.${c}`)
        .join("");
      return `${el.tagName.toLowerCase()}${id}${classes}`;
    };
    // 祖先が横方向を切り取っている（overflow-x が visible 以外）要素は、ページの横スクロールの原因にならない
    const clippedByAncestor = (el) => {
      for (
        let node = el.parentElement;
        node && node !== document.body;
        node = node.parentElement
      ) {
        if (getComputedStyle(node).overflowX !== "visible") return true;
      }
      return false;
    };
    const over = new Set();
    for (const el of document.body.querySelectorAll("*")) {
      const rect = el.getBoundingClientRect();
      if (
        rect.width > 0 &&
        (rect.right > clientWidth + 0.5 || rect.left < -0.5) &&
        !clippedByAncestor(el)
      )
        over.add(el);
    }
    // はみ出した要素のうち、親がはみ出していないもの（はみ出しの起点）だけを挙げる
    for (const el of over) {
      if (over.has(el.parentElement)) continue;
      const rect = el.getBoundingClientRect();
      offenders.push({
        element: describe(el),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
      });
      if (offenders.length >= 5) break;
    }
  }
  return { clientWidth, scrollWidth, offenders };
}

function documentHeightInPage() {
  return Math.ceil(
    Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
  );
}

async function waitForImagesInPage(timeoutMs) {
  const images = [...document.images];
  for (const image of images) {
    image.loading = "eager";
    image.decoding = "sync";
  }
  const loaded = Promise.all(
    images.map((image) =>
      image.complete
        ? null
        : new Promise((resolve) => {
            image.addEventListener("load", resolve, { once: true });
            image.addEventListener("error", resolve, { once: true });
          }),
    ),
  ).then(() =>
    Promise.all(images.map((image) => image.decode().catch(() => null))),
  );
  const timedOut = await Promise.race([
    loaded.then(() => false),
    new Promise((resolve) => setTimeout(() => resolve(true), timeoutMs)),
  ]);
  await document.fonts.ready;
  await new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  );
  const broken = images
    .filter((image) => !image.complete || image.naturalWidth === 0)
    .map((image) => image.currentSrc || image.src);
  return { count: images.length, broken, timedOut };
}

function sectionRectsInPage() {
  const sections = [...document.querySelectorAll("main > section")];
  const main = document.querySelector("main");
  const targets =
    sections.length > 0 ? sections : main ? [main] : [document.body];
  return targets.map((el) => {
    const rect = el.getBoundingClientRect();
    const labelledBy = el.getAttribute("aria-labelledby");
    const headingEl =
      (labelledBy && document.getElementById(labelledBy.split(/\s+/)[0])) ||
      el.querySelector("h1, h2");
    return {
      labelledBy,
      heading: headingEl
        ? headingEl.textContent.replace(/\s+/g, " ").trim().slice(0, 40)
        : "",
      id: el.id || null,
      className: typeof el.className === "string" ? el.className : "",
      tagName: el.tagName.toLowerCase(),
      top: rect.top + window.scrollY,
      bottom: rect.bottom + window.scrollY,
    };
  });
}

// ---- Node 側 ----

/** 節の名前を決める。`aria-labelledby="hero-title"` → `hero`。無ければ id、class の最初の語、タグ名。 */
export function sectionName({ labelledBy, id, className, tagName }) {
  const raw =
    (labelledBy && labelledBy.split(/\s+/)[0].replace(/-title$/, "")) ||
    id ||
    (className &&
      className
        .trim()
        .split(/\s+/)[0]
        .replace(/-section$/, "")) ||
    tagName ||
    "section";
  return (
    raw
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "section"
  );
}

/**
 * 節の位置から撮る範囲を決める。最初の節はページの上端から（ヘッダーを含める）、
 * 最後の節はページの下端まで（フッターを含める）にする。
 */
export function clipRanges(rects, documentHeight) {
  return rects.map((rect, index) => {
    const top = Math.min(
      index === 0 ? 0 : Math.floor(rect.top),
      documentHeight - 1,
    );
    // viewport（= documentHeight）の外は描かれないので、そこで切る
    const bottom =
      index === rects.length - 1
        ? documentHeight
        : Math.min(Math.ceil(rect.bottom), documentHeight);
    return { top, height: Math.max(1, bottom - top) };
  });
}

async function evaluate(cdp, sessionId, fn, ...args) {
  const expression = `(${fn.toString()})(${args.map((arg) => JSON.stringify(arg)).join(", ")})`;
  const { result, exceptionDetails } = await cdp.send(
    "Runtime.evaluate",
    { expression, awaitPromise: true, returnByValue: true },
    sessionId,
  );
  if (exceptionDetails)
    throw new Error(
      `ページ内の評価に失敗しました: ${exceptionDetails.exception?.description ?? exceptionDetails.text}`,
    );
  return result.value;
}

async function setViewport(cdp, sessionId, width, height) {
  await cdp.send(
    "Emulation.setDeviceMetricsOverride",
    { width, height, deviceScaleFactor: 1, mobile: false },
    sessionId,
  );
}

async function navigate(cdp, sessionId, url) {
  const loaded = cdp.waitForEvent("Page.loadEventFired", sessionId);
  const { errorText } = await cdp.send("Page.navigate", { url }, sessionId);
  if (errorText) throw new Error(`${url} を開けませんでした: ${errorText}`);
  await loaded;
}

/**
 * viewport の高さを文書の高さに合わせる。広げて文書の高さが変わったら（vh などに依存するレイアウト）、
 * 落ち着くまで繰り返し、viewportDependent を立てる。
 */
async function expandToDocumentHeight(cdp, sessionId, width) {
  let height = await evaluate(cdp, sessionId, documentHeightInPage);
  let viewportDependent = false;
  for (let pass = 0; pass < MAX_HEIGHT_PASSES; pass++) {
    await setViewport(cdp, sessionId, width, height);
    const next = await evaluate(cdp, sessionId, documentHeightInPage);
    if (next === height) return { height, viewportDependent };
    viewportDependent = true;
    height = next;
  }
  // 落ち着かなかった（vh で伸び続けるなど）。最後に測った高さに viewport を合わせ、その高さで切る
  // （返す高さと viewport の高さを揃え、viewport の外を撮らないようにする）
  await setViewport(cdp, sessionId, width, height);
  return { height, viewportDependent };
}

/**
 * 1つの幅で撮る。
 * @returns {{ width, overflow, images, documentHeight, viewportDependent, shots: {name, file, width, height}[] }}
 */
export async function capturePage(
  cdp,
  sessionId,
  { url, width, initialHeight, outDir, maxWidth },
) {
  await setViewport(cdp, sessionId, width, initialHeight);
  await cdp.send("Emulation.setScrollbarsHidden", { hidden: true }, sessionId);
  await navigate(cdp, sessionId, url);
  await evaluate(cdp, sessionId, waitForImagesInPage, IMAGE_WAIT_MS);
  // 横スクロールは、利用者が見るのと同じ高さの viewport で測る
  const overflow = await evaluate(cdp, sessionId, measureOverflowInPage);

  const { height: documentHeight, viewportDependent } =
    await expandToDocumentHeight(cdp, sessionId, width);
  const images = await evaluate(
    cdp,
    sessionId,
    waitForImagesInPage,
    IMAGE_WAIT_MS,
  );
  const rects = await evaluate(cdp, sessionId, sectionRectsInPage);
  const ranges = clipRanges(rects, documentHeight);
  const scale = maxWidth && width > maxWidth ? maxWidth / width : 1;

  const widthDir = join(outDir, String(width));
  await mkdir(widthDir, { recursive: true });
  const usedNames = new Map();
  const shots = [];
  for (const [index, rect] of rects.entries()) {
    let name = sectionName(rect);
    const seen = usedNames.get(name) ?? 0;
    usedNames.set(name, seen + 1);
    if (seen > 0) name = `${name}-${seen + 1}`;
    const { top, height } = ranges[index];
    const { data } = await cdp.send(
      "Page.captureScreenshot",
      {
        format: "png",
        clip: { x: 0, y: top, width, height, scale },
        captureBeyondViewport: false,
      },
      sessionId,
    );
    const file = join(
      widthDir,
      `${String(index + 1).padStart(2, "0")}-${name}.png`,
    );
    await writeFile(file, Buffer.from(data, "base64"));
    shots.push({
      name,
      heading: rect.heading,
      file,
      width: Math.round(width * scale),
      height: Math.round(height * scale),
    });
  }
  return { width, overflow, images, documentHeight, viewportDependent, shots };
}
