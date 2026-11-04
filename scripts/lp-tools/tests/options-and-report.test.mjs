import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { clipRanges, sectionName } from "../lib/capture-page.mjs";
import { chromeArgs, explainLaunchFailure } from "../lib/chrome.mjs";
import { UsageError, parseOptions } from "../lib/options.mjs";
import {
  escapeCell,
  overflowLine,
  renderMarkdown,
  renderSummary,
} from "../lib/report.mjs";

const context = { repoRoot: "/repo", env: {} };

describe("parseOptions", () => {
  test("既定値", () => {
    const options = parseOptions(["--out", "/out"], context);
    assert.deepEqual(options, {
      help: false,
      out: "/out",
      dist: "/repo/packages/lp/dist",
      path: "/",
      widths: [1440, 390],
      maxWidth: undefined,
      chrome: undefined,
    });
  });

  test("指定した値を使い、Chrome は --chrome が LP_CHROME より優先", () => {
    const options = parseOptions(
      [
        "--out",
        "/out",
        "--widths",
        "1280, 375",
        "--max-width",
        "720",
        "--path",
        "/privacy/",
        "--chrome",
        "/x/chrome",
      ],
      { repoRoot: "/repo", env: { LP_CHROME: "/env/chrome" } },
    );
    assert.deepEqual(options.widths, [1280, 375]);
    assert.equal(options.maxWidth, 720);
    assert.equal(options.path, "/privacy/");
    assert.equal(options.chrome, "/x/chrome");
    assert.equal(
      parseOptions(["--out", "/o"], {
        repoRoot: "/repo",
        env: { LP_CHROME: "/env/chrome" },
      }).chrome,
      "/env/chrome",
    );
  });

  test("不正な指定は UsageError", () => {
    for (const argv of [
      [],
      ["--out", "/o", "--widths", "0"],
      ["--out", "/o", "--widths", "abc"],
      ["--out", "/o", "--path", "privacy"],
      ["--out", "/o", "--unknown"],
    ]) {
      assert.throws(
        () => parseOptions(argv, context),
        UsageError,
        argv.join(" "),
      );
    }
  });

  test("--help", () => {
    assert.deepEqual(parseOptions(["-h"], context), { help: true });
  });
});

describe("sectionName", () => {
  test("aria-labelledby の -title を除いた語を使う", () => {
    assert.equal(
      sectionName({
        labelledBy: "hero-title",
        id: null,
        className: "hero container",
        tagName: "section",
      }),
      "hero",
    );
  });

  test("無ければ id、class の最初の語（-section を除く）、タグ名の順", () => {
    assert.equal(
      sectionName({
        labelledBy: null,
        id: "pins",
        className: "pin-section",
        tagName: "section",
      }),
      "pins",
    );
    assert.equal(
      sectionName({
        labelledBy: null,
        id: null,
        className: "walk-section section-wrap",
        tagName: "section",
      }),
      "walk",
    );
    assert.equal(
      sectionName({
        labelledBy: null,
        id: null,
        className: "",
        tagName: "main",
      }),
      "main",
    );
  });

  test("ファイル名に使えない文字は - にする", () => {
    assert.equal(
      sectionName({
        labelledBy: "Foo_Bar-title",
        id: null,
        className: "",
        tagName: "section",
      }),
      "foo-bar",
    );
    assert.equal(
      sectionName({
        labelledBy: null,
        id: "地図",
        className: "",
        tagName: "section",
      }),
      "section",
    );
  });
});

test("clipRanges は最初の節をページの上端から、最後の節をページの下端まで広げる", () => {
  const rects = [
    { top: 65, bottom: 800.4 },
    { top: 800.4, bottom: 1500 },
    { top: 1540, bottom: 2000.2 },
  ];
  assert.deepEqual(clipRanges(rects, 2300), [
    { top: 0, height: 801 },
    { top: 800, height: 700 },
    { top: 1540, height: 760 },
  ]);
  assert.deepEqual(clipRanges([{ top: 64, bottom: 900 }], 1000), [
    { top: 0, height: 1000 },
  ]);
});

test("explainLaunchFailure は SUID sandbox の失敗に sandbox の外での実行を案内し、--no-sandbox を勧めない", () => {
  const message = explainLaunchFailure(
    "FATAL:setuid_sandbox_host.cc:172] The SUID sandbox helper binary was found, but is not configured correctly.",
  );
  assert.match(message, /sandbox の外で実行/);
  assert.match(message, /--no-sandbox` で回避しないで/);
  assert.match(
    explainLaunchFailure("something else"),
    /sandbox の外で実行しているか/,
  );
});

describe("report", () => {
  const report = {
    chrome: {
      product: "Chrome/157.0.0.0",
      executable: "/usr/bin/google-chrome",
    },
    path: "/",
    results: [
      {
        width: 1440,
        overflow: { scrollWidth: 1440, clientWidth: 1440, offenders: [] },
        images: { count: 2, broken: [], timedOut: false },
        shots: [
          {
            name: "hero",
            heading: "いつもの道に、",
            file: "/o/1440/01-hero.png",
            width: 720,
            height: 400,
          },
          {
            name: "download",
            heading: "次の|散歩",
            file: "/o/1440/02-download.png",
            width: 720,
            height: 300,
          },
        ],
      },
      {
        width: 390,
        overflow: {
          scrollWidth: 600,
          clientWidth: 390,
          offenders: [{ element: "div.wide", left: 0, right: 600 }],
        },
        images: { count: 2, broken: [], timedOut: false },
        shots: [
          {
            name: "hero",
            heading: "いつもの道に、",
            file: "/o/390/01-hero.png",
            width: 390,
            height: 900,
          },
        ],
      },
    ],
  };

  test("overflowLine は横スクロールの有無とはみ出した要素を書く", () => {
    assert.equal(
      overflowLine(report.results[0]),
      "1440px: 横スクロールなし（scrollWidth 1440 / clientWidth 1440）",
    );
    assert.equal(
      overflowLine(report.results[1]),
      "390px: 横スクロールあり（scrollWidth 600 > clientWidth 390） はみ出し: div.wide（0〜600px）",
    );
  });

  test("renderMarkdown は節を行、幅を列にし、画像を絶対パスで参照する", () => {
    const markdown = renderMarkdown(report);
    assert.match(markdown, /\| 節 \| 1440px \| 390px \|\n\|---\|---\|---\|/);
    assert.match(
      markdown,
      /\| hero<br>いつもの道に、 \| !\[hero 1440px\]\(\/o\/1440\/01-hero\.png\) \| !\[hero 390px\]\(\/o\/390\/01-hero\.png\) \|/,
    );
    assert.match(
      markdown,
      /\| download<br>次の\\\|散歩 \| !\[download 1440px\]\(\/o\/1440\/02-download\.png\) \| （なし） \|/,
    );
    assert.match(markdown, /- 390px: 横スクロールあり/);
  });

  test("viewport の高さに依存するレイアウトがあれば、要約と表の前に知らせる", () => {
    const dependent = {
      ...report,
      reportFile: "/o/report.json",
      markdownFile: "/o/screenshots.md",
      results: [{ ...report.results[1], viewportDependent: true }],
    };
    assert.match(
      renderMarkdown(dependent),
      /- 390px: viewport の高さで文書の高さが変わる/,
    );
    assert.match(
      renderSummary(dependent),
      /viewport の高さで文書の高さが変わる/,
    );
    assert.doesNotMatch(renderMarkdown(report), /viewport の高さで/);
  });

  test("renderMarkdown は、はみ出した要素の名前の Markdown の記号を逃がす", () => {
    const odd = {
      ...report,
      results: [
        {
          ...report.results[1],
          overflow: {
            scrollWidth: 600,
            clientWidth: 390,
            offenders: [{ element: "div.a_b_c", left: 0, right: 600 }],
          },
        },
      ],
    };
    assert.match(renderMarkdown(odd), /はみ出し: div\.a\\_b\\_c（0〜600px）/);
    assert.match(overflowLine(odd.results[0]), /はみ出し: div\.a_b_c（/);
  });

  test("escapeCell は表と Markdown の記号を逃がす", () => {
    assert.equal(escapeCell("a|b*c<d>"), "a\\|b\\*c\\<d\\>");
  });
});

test("chromeArgs は Chrome の sandbox を無効にする指定を含まない", () => {
  const args = chromeArgs("/tmp/profile");
  for (const forbidden of [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--no-zygote",
  ]) {
    assert.ok(!args.some((arg) => arg.startsWith(forbidden)), forbidden);
  }
  assert.ok(args.includes("--headless"));
  assert.ok(args.includes("--user-data-dir=/tmp/profile"));
  assert.ok(args.includes("--remote-debugging-port=0"));
});
