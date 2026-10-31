# ADR-M-024: 地図への招待の受諾画面と、招待リンクの受け取り

## 日付

2026-11-01（SS-250）

## ステータス

採用（SS-250）。フラグ `map_invitation` の裏（本番で ON にするのはプライバシーポリシーの施行日 2026-12-02 の後）。

## コンテキスト

地図への招待はリンク方式（[ADR-009](../../../docs/adr/ADR-009-sanpo-map-pin-data-model-and-photo-upload.md) 決定39）。owner がメンバー画面（ADR-M-014 SS-249 追補）から招待リンクを作って送り、
受け取った人がアプリで内容を確かめて参加する。リンク `https://sanposcape.com/i/#<token>` はトークンを fragment に載せるので、
Expo Router の既定の解釈（path だけを見る）では受け取れない。Universal Links / App Links が効かない環境（開発ビルド・
検証に失敗した Android・アプリ内ブラウザ）もある。

## 決定

- **D1: 招待する側**: メンバー画面の owner 向けに「メンバーを招待」（`SanpoMapInviteSection`。フラグ ON のときだけ）。招待シート（ダイアログ）で
  招待された人ができること・1リンク1人・期限7日・送る相手への注意を示し、「招待リンクを送る」で発行して `Share.share` に渡す。
  発行した URL は共有シートに渡したら持たない。下に有効なリンク（期限）と「取り消す」を並べる。
- **D2: 受諾画面** `app/invitations/accept.tsx`（`?token=`。`presentation: "modal"`）。`InvitationAcceptView` が preview を取り、
  地図の名前・アイコン・招待した人、参加するとできること（見える・追加できる・抜けても追加したものは残る）、自分の名前がメンバーにどう見えるかを示す。
  「参加する」を押したときだけ受諾する。参加したら地図詳細へ `replace` し、フラッシュメッセージ「『…』に参加しました」を地図詳細で出す。
  - 状態: 読み込み中・使えないリンク（理由を区別しない1つの文言）・すでにメンバー（「地図を開く」）・フラグ OFF（「この機能はまだ使えません」）・上限・通信の失敗（再試行）。
  - ゲストは地図の名前と招待した人を見られ、「サインインして参加」で `returnTo=invitation`（ADR-M-009 SS-250 追補）。サインイン後はスタックに残る受諾画面へ戻るので、トークンを別のストアに持たない。
  - モーダルなので、散歩中にリンクを開いても閉じれば散歩の画面に戻る。
- **D3: リンクの受け取り** `app/+native-intent.tsx` の `redirectSystemPath` が、`https://(dev.)sanposcape.com/i/#<token>` と
  `sanposcape(-dev)://invite?t=<token>`（LP の「アプリで開く」）を `/invitations/accept?token=<token>` に書き換える。
  トークンの形（base64url・16〜128文字）に合わないものは載せず、`/i/` なのに読めないときはトークン無しで受諾画面（使えないリンク）へ。
  例外はアプリが開かなくなるので、失敗は元のパスに倒す。
  - 注意: iOS の Universal Links・Android の App Links で fragment が `redirectSystemPath` まで届くかは、実機でまだ確かめていない（届かなければ受諾画面が「使えないリンク」になり、
    LP の「アプリで開く」か「招待リンクで参加」で開ける）。
- **D4: 招待リンクで参加**（地図一覧のヘッダーのリンクのアイコン。サインイン中・フラグ ON）。届いたリンクを貼り付けて受諾画面へ進む（`InvitationLinkPasteDialog`）。
  Universal Links が効かない環境の逃げ道。読み取れないときは通信しない。
- **D5: トークンを持つ場所**: ルートパラメータとクエリのキー（メモリ）だけ。端末のストレージ・ログには載せない（台帳 1 の対象パスに native-intent と受諾画面を足した）。
- **D6: Universal Links / App Links の設定**は `app.config.ts`（ADR-006 の SS-250 追補）。ネイティブの設定なので新しいビルドが要る。intentFilters の `pathPrefix` は `/i/`（AASA の対象と揃える）。
- **D7: custom scheme の乗っ取り**: LP の「アプリで開く」は、Android では `intent://…#Intent;scheme=…;package=<パッケージ名>;end` でパッケージを指定し、同じ scheme を名乗る別のアプリにトークンを渡さない。iOS は custom scheme の重複を防げないので、**受け入れた危険**とする（端末に悪意あるアプリが入っていることが前提。1リンク1人なので本来の相手は「使えないリンク」になって気付け、owner はメンバー画面で外せる）。本番の Android は App Links の検証が通らない間（assetlinks.json の値が揃うまで）、この経路が主になる。

## 検討した選択肢

- 保留中の招待のストア（Zustand）でサインインをまたぐ → 受諾画面がスタックに残るので要らない（ADR-M-009 SS-250 追補）。
- 受諾画面を通常の push にする → 散歩中に開くと散歩の画面を隠す。モーダルなら閉じれば戻る。
- インストールをまたいでリンクを引き継ぐ deferred deep link → 第三者の SDK が要るので採らない。LP でインストール後にリンクを開き直してもらう。

## 影響

- 実機（iOS・Android）でのリンクの確認が要る（このリポジトリの検証では確かめていない）。
- 本番の Android の App Links は、署名証明書の値（ストア）が揃うまで検証が通らない。
