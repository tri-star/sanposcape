// システムの Chrome を headless で起動し、CDP（Chrome DevTools Protocol）で操作する。
// 依存パッケージは使わず、Node の標準の WebSocket で話す。
// Chrome の sandbox は有効のまま使う（--no-sandbox を付けない。SS-263）。
import { spawn } from "node:child_process";
import { access, constants, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const DEFAULT_CHROME_CANDIDATES = [
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/opt/google/chrome/chrome",
];

const LAUNCH_TIMEOUT_MS = 20_000;
const COMMAND_TIMEOUT_MS = 60_000;

export class ChromeLaunchError extends Error {}

/** 使う Chrome の実行ファイルを決める。明示されたパスが無ければ候補を順に探す。 */
export async function findChrome(explicitPath) {
  const candidates = explicitPath ? [explicitPath] : DEFAULT_CHROME_CANDIDATES;
  for (const path of candidates) {
    try {
      await access(path, constants.X_OK);
      return path;
    } catch {
      // 次の候補へ
    }
  }
  throw new ChromeLaunchError(
    [
      `Chrome が見つかりません（探した場所: ${candidates.join(", ")}）。`,
      "- Google Chrome を入れる（例: https://www.google.com/chrome/ の .deb を `sudo apt install ./google-chrome-stable_current_amd64.deb`）",
      "- 別の場所の Chrome を使うときは `--chrome <パス>` か環境変数 LP_CHROME で指定する",
    ].join("\n"),
  );
}

/** Chrome の起動に失敗したときの stderr から、利用者向けの案内を作る。 */
export function explainLaunchFailure(stderr) {
  const lines = ["Chrome を起動できませんでした。"];
  if (/SUID sandbox|chrome-sandbox|No usable sandbox/i.test(stderr)) {
    lines.push(
      "- Chrome の sandbox が起動できていません。Claude Code の sandbox の中では起動できないため、sandbox の外で実行してください（Bash ツールの dangerouslyDisableSandbox）。",
      "- `--no-sandbox` で回避しないでください（renderer の隔離が無くなるため。SS-263）。",
    );
  } else {
    lines.push(
      "- sandbox の外で実行しているか確かめてください（Claude Code の sandbox の中では起動できません）。",
    );
  }
  const tail = stderr.trim().split("\n").slice(-8).join("\n");
  if (tail) lines.push("", "Chrome の出力（末尾）:", tail);
  return lines.join("\n");
}

/**
 * headless の Chrome の起動引数。Chrome の sandbox を無効にする指定（--no-sandbox・--disable-setuid-sandbox）は入れない。
 * CDP のポートは 0 にして OS に選ばせ、stderr の `DevTools listening on` から URL を得る。
 */
export function chromeArgs(userDataDir) {
  return [
    "--headless",
    "--remote-debugging-port=0",
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-sync",
    // クラッシュレポートを ~/.config/google-chrome に書かせない（--user-data-dir の外に書くため）
    "--disable-breakpad",
    "--disable-crash-reporter",
    "--hide-scrollbars",
    "--mute-audio",
    "about:blank",
  ];
}

/** headless の Chrome を起動し、CDP の WebSocket の URL が出るまで待つ。 */
export async function launchChrome(executable) {
  const userDataDir = await mkdtemp(join(tmpdir(), "lp-capture-chrome-"));
  const args = chromeArgs(userDataDir);
  const child = spawn(executable, args, {
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  const wsUrl = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new ChromeLaunchError(
          explainLaunchFailure(
            `${stderr}\n(${LAUNCH_TIMEOUT_MS}ms 待っても DevTools の URL が出ませんでした)`,
          ),
        ),
      );
    }, LAUNCH_TIMEOUT_MS);
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      const match = stderr.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(
        new ChromeLaunchError(
          explainLaunchFailure(`${stderr}\n${error.message}`),
        ),
      );
    });
    child.on("exit", (code, signal) => {
      clearTimeout(timer);
      reject(
        new ChromeLaunchError(
          explainLaunchFailure(
            `${stderr}\n(exit code ${code}, signal ${signal})`,
          ),
        ),
      );
    });
  }).catch(async (error) => {
    await cleanup(child, userDataDir);
    throw error;
  });
  return {
    wsUrl,
    close: () => cleanup(child, userDataDir),
  };
}

async function cleanup(child, userDataDir) {
  if (child.exitCode === null && child.signalCode === null) {
    const exited = new Promise((resolve) => child.once("exit", resolve));
    child.kill("SIGTERM");
    const timer = setTimeout(() => child.kill("SIGKILL"), 5_000);
    await exited;
    clearTimeout(timer);
  }
  await rm(userDataDir, { recursive: true, force: true, maxRetries: 3 });
}

/** CDP の最小限のクライアント。flatten したセッション（sessionId）でページを操作する。 */
export class CdpClient {
  #ws;
  #nextId = 1;
  #pending = new Map();
  #listeners = new Set();
  // 待っているイベント（waitForEvent）。値は接続が切れたときに reject する関数
  #waits = new Map();

  static async connect(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve, { once: true });
      ws.addEventListener(
        "error",
        () => reject(new Error(`CDP に接続できません: ${wsUrl}`)),
        { once: true },
      );
    });
    return new CdpClient(ws);
  }

  constructor(ws) {
    this.#ws = ws;
    ws.addEventListener("message", (event) =>
      this.#onMessage(JSON.parse(event.data)),
    );
    ws.addEventListener("close", () => {
      for (const { reject, timer } of this.#pending.values()) {
        clearTimeout(timer);
        reject(new Error("CDP の接続が切れました"));
      }
      this.#pending.clear();
      // 待っているイベントは来なくなるので reject する（決着しないまま止まらないように）
      for (const rejectWait of [...this.#waits.values()])
        rejectWait(new Error("CDP の接続が切れました"));
    });
  }

  #onMessage(message) {
    if (message.id !== undefined) {
      const pending = this.#pending.get(message.id);
      if (!pending) return;
      this.#pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error)
        pending.reject(
          new Error(`${pending.method}: ${message.error.message}`),
        );
      else pending.resolve(message.result);
      return;
    }
    for (const listener of this.#listeners) listener(message);
  }

  send(method, params = {}, sessionId = undefined) {
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(
          new Error(`${method}: ${COMMAND_TIMEOUT_MS}ms で応答がありません`),
        );
      }, COMMAND_TIMEOUT_MS);
      this.#pending.set(id, { resolve, reject, timer, method });
      this.#ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }

  /**
   * 指定のイベントを1回待つ。send より先に呼んで、取りこぼさないようにする。
   * 待つのをやめるときは、返す promise の cancel() を呼ぶ（timer が残って終了が遅れ、
   * 受け手の無い reject で終了コードが変わるのを防ぐ）。
   */
  waitForEvent(method, sessionId, timeoutMs = COMMAND_TIMEOUT_MS) {
    let cancel;
    const promise = new Promise((resolve, reject) => {
      const listener = (message) => {
        if (message.method === method && message.sessionId === sessionId) {
          cancel();
          resolve(message.params);
        }
      };
      const timer = setTimeout(() => {
        cancel();
        reject(
          new Error(`${method} を ${timeoutMs}ms 待ちましたが来ませんでした`),
        );
      }, timeoutMs);
      cancel = () => {
        this.#listeners.delete(listener);
        this.#waits.delete(timer);
        clearTimeout(timer);
      };
      this.#waits.set(timer, (error) => {
        cancel();
        reject(error);
      });
      this.#listeners.add(listener);
    });
    promise.cancel = cancel;
    return promise;
  }

  /** 接続を閉じる。残っている待ちは reject せずに片付ける（呼ぶのは後始末のときで、待っている呼び出し元はいない）。 */
  close() {
    for (const timer of this.#waits.keys()) clearTimeout(timer);
    this.#waits.clear();
    this.#listeners.clear();
    this.#ws.close();
  }
}
