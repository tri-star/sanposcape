---
name: fetch-long-legal-pages-with-curl
description: WebFetch は Google Maps Platform の規約のような長いページの本文を切り捨てて返し、条項を引けない。curl で取得して HTML を落とし、grep・スライスで条項を抜き出す。条項の番号と版は「Last modified」で確かめる
metadata:
  type: reference
  scope: durable
  source_issue: SS-212
---

規約・ポリシーのような長いページを WebFetch で読むと、タイトルだけ返して「Content truncated」となり、条項の原文を引けない
（SS-212: https://cloud.google.com/maps-platform/terms と maps-service-terms はどちらも 2MB 超）。検索結果の要約は古い版の条項番号を混ぜる。

**Why:** 条項を確かめられないまま記憶や検索の要約で答えると、版の違いで逆の結論になる。SS-212 では最初に「住所の保存は明示的に許可されていない」と
答えたが、現行版（2026-10-15）には住所の無期限キャッシュを条件付きで認める Geocoding API 6.3.2 があり、2025-05-01 版には無かった。

**How to apply:**
- sandbox の中なら `allowed_domains: ["cloud.google.com"]` を付けて curl で取得し、`python3 -I` で `<script>`・`<style>`・タグを落として空白を詰め、
  `str.find` とスライスで該当の節を表示する（ugrep の `.{0,900}` は複雑さの上限で失敗する）。保存先は `$TMPDIR` の専用ディレクトリ。
- 版は本文の「Last modified」で確かめ、旧版はアーカイブ（`/archive/maps-platform/terms/maps-service-terms-<YYYYMMDD>`）と比べて、いつ足された条項かを見る。
- ADR に引くときは URL・取得日・版を書く。

関連: [[doc-section-quoted-by-code-comments]]
