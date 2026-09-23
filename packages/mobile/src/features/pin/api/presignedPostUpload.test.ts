import { HttpResponse, http } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";

import { isS3UploadError } from "@/features/pin/lib/photoUploadError";
import type { UploadFilePart } from "@/features/pin/lib/presignedPostForm";
import { uploadToPresignedPost } from "@/features/pin/api/presignedPostUpload";
import type { PinPhotoUploadTicket } from "@/features/pin/types";
import { logDiagnostic } from "@/lib/diagnosticLog";
import { server } from "@/test/setup";

// 診断ログの内容を検証するためにモックする（console への出力も抑止される）。
vi.mock("@/lib/diagnosticLog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/diagnosticLog")>()),
  logDiagnostic: vi.fn(),
}));

afterEach(() => {
  vi.mocked(logDiagnostic).mockClear();
});

const FILE_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x01, 0x02, 0x03, 0x04]);

/**
 * ファイルパートは **Blob 実装**でなければならない（`{ uri, name, type }` は Expo の fetch が
 * 送信前に `Unsupported FormDataPart implementation` で落とす。SS-88 で実機・エミュレータ再現）。
 * 実機では `expo-file-system` の `File`（`implements Blob`）が渡ってくる。
 */
const FILE: UploadFilePart = new Blob([FILE_BYTES], { type: "image/jpeg" });

const S3_TICKET: Pick<PinPhotoUploadTicket, "url" | "fields"> = {
  url: "https://sanposcape-dev-pin-photos-000000000000.s3.ap-southeast-1.amazonaws.com/",
  fields: [
    ["key", "staging/pins/u1/x.jpg"],
    ["policy", "abc"],
  ],
};

describe("uploadToPresignedPost", () => {
  it("S3 URL への POST が 204 なら成功する", async () => {
    server.use(http.post(S3_TICKET.url, () => new HttpResponse(null, { status: 204 })));

    await expect(
      uploadToPresignedPost(S3_TICKET, FILE, { apiBaseUrl: "https://app-api.dev.sanposcape.com" }),
    ).resolves.toBeUndefined();
  });

  it("認証ヘッダー・x-amz-content-sha256 を送らない", async () => {
    let headers: Headers | undefined;
    server.use(
      http.post(S3_TICKET.url, ({ request }) => {
        headers = request.headers;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await uploadToPresignedPost(S3_TICKET, FILE, {
      apiBaseUrl: "https://app-api.dev.sanposcape.com",
    });

    expect(headers?.get("x-app-authorization")).toBeNull();
    expect(headers?.get("authorization")).toBeNull();
    expect(headers?.get("x-amz-content-sha256")).toBeNull();
  });

  it("フォームのキー順が fields → 最後に file", async () => {
    let keys: string[] = [];
    server.use(
      http.post(S3_TICKET.url, async ({ request }) => {
        const form = await request.formData();
        // RN の型定義（react-native/src/types/globals.d.ts）の FormData は
        // append/getAll/getParts しか持たないが、実行時（vitest = Node）は Web 標準の
        // FormData（.keys() を含む）が渡ってくる。テストでの検証にだけ型を広げてアクセスする。
        keys = [...(form as unknown as { keys(): IterableIterator<string> }).keys()];
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await uploadToPresignedPost(S3_TICKET, FILE, {
      apiBaseUrl: "https://app-api.dev.sanposcape.com",
    });

    expect(keys).toEqual(["key", "policy", "file"]);
  });

  it("file パートに画像の中身がそのまま載る（SS-88 の回帰）", async () => {
    // 以前は `{ uri, name, type }` を Blob にキャストして渡しており、キー順の検証は通るのに
    // 中身が送られていなかった（実機では Expo の fetch が送信前に例外を投げていた）。
    // キーだけでなく **バイト列が届くこと** を固定する。
    let received: Uint8Array | null = null;
    server.use(
      http.post(S3_TICKET.url, async ({ request }) => {
        const form = await request.formData();
        // 上の「キー順」のテストと同じ理由で、RN の FormData 型には無い Web 標準の
        // メソッドへテストのときだけ型を広げてアクセスする。
        const part = (form as unknown as { get(name: string): Blob | string | null }).get("file");
        received = new Uint8Array(await (part as Blob).arrayBuffer());
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await uploadToPresignedPost(S3_TICKET, FILE, {
      apiBaseUrl: "https://app-api.dev.sanposcape.com",
    });

    expect(received).not.toBeNull();
    expect(Array.from(received!)).toEqual(Array.from(FILE_BYTES));
  });

  it("fake storage URL（backend と同じ origin の http）でも成功する", async () => {
    server.use(
      http.post(
        "http://localhost:8000/dev-storage/uploads",
        () => new HttpResponse(null, { status: 204 }),
      ),
    );

    await expect(
      uploadToPresignedPost(
        { url: "http://localhost:8000/dev-storage/uploads", fields: [["x-fake-signature", "sig"]] },
        FILE,
        { apiBaseUrl: "http://localhost:8000" },
      ),
    ).resolves.toBeUndefined();
  });

  it.each([
    [400, "<Error><Code>EntityTooLarge</Code></Error>", "EntityTooLarge"],
    [403, "<Error><Code>AccessDenied</Code></Error>", "AccessDenied"],
  ] as const)("%d + %s は S3UploadError(status, code) を投げる", async (status, body, code) => {
    server.use(http.post(S3_TICKET.url, () => new HttpResponse(body, { status })));

    await expect(
      uploadToPresignedPost(S3_TICKET, FILE, { apiBaseUrl: "https://app-api.dev.sanposcape.com" }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        isS3UploadError(error) && error.status === status && error.s3Code === code,
    );
  });

  it("3xx（リダイレクト）は追従せず S3UploadError として失敗する（MR3）", async () => {
    server.use(
      http.post(
        S3_TICKET.url,
        () =>
          new HttpResponse(null, {
            status: 302,
            headers: { Location: "https://evil.example/steal" },
          }),
      ),
    );

    await expect(
      uploadToPresignedPost(S3_TICKET, FILE, { apiBaseUrl: "https://app-api.dev.sanposcape.com" }),
    ).rejects.toSatisfy(
      (error: unknown) => isS3UploadError(error) && error.s3Code === "Redirected",
    );
  });

  it("許可されない URL は fetch せずに reject する", async () => {
    await expect(
      uploadToPresignedPost({ url: "http://evil.example/x", fields: [] }, FILE, {
        apiBaseUrl: "http://10.0.2.2:8000",
      }),
    ).rejects.toSatisfy(
      (error: unknown) => isS3UploadError(error) && error.s3Code === "InvalidUploadUrl",
    );
  });
});

describe("診断ログ（SS-88）", () => {
  /** SignatureDoesNotMatch の実応答を模した本文。`<StringToSign>` は policy(base64) そのもの。 */
  const SIGNATURE_MISMATCH_BODY =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    "<Error><Code>SignatureDoesNotMatch</Code>" +
    "<Message>The request signature we calculated does not match.</Message>" +
    "<AWSAccessKeyId>ASIAEXAMPLEKEYID</AWSAccessKeyId>" +
    "<StringToSign>eyJleHBpcmF0aW9uIjogIlNFQ1JFVCJ9</StringToSign></Error>";

  it("失敗ログに署名対象文書・アクセスキーIDを含めない（SS-88 の回帰）", async () => {
    server.use(
      http.post(S3_TICKET.url, () => new HttpResponse(SIGNATURE_MISMATCH_BODY, { status: 403 })),
    );

    await expect(
      uploadToPresignedPost(S3_TICKET, FILE, { apiBaseUrl: "https://app-api.dev.sanposcape.com" }),
    ).rejects.toThrow();

    const logged = JSON.stringify(vi.mocked(logDiagnostic).mock.calls);
    expect(logged).toContain("SignatureDoesNotMatch");
    expect(logged).toContain("The request signature we calculated does not match.");
    expect(logged).not.toContain("eyJleHBpcmF0aW9u");
    expect(logged).not.toContain("ASIAEXAMPLEKEYID");
  });

  it("意図的な中断（AbortError）はログしない", async () => {
    server.use(http.post(S3_TICKET.url, () => new HttpResponse(null, { status: 204 })));
    const controller = new AbortController();
    controller.abort();

    await expect(
      uploadToPresignedPost(S3_TICKET, FILE, {
        apiBaseUrl: "https://app-api.dev.sanposcape.com",
        signal: controller.signal,
      }),
    ).rejects.toSatisfy((error: unknown) => error instanceof Error && error.name === "AbortError");

    expect(vi.mocked(logDiagnostic)).not.toHaveBeenCalled();
  });
});
