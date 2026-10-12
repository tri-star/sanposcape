"""Apple の REST API（Sign in with Apple の code 交換・トークン失効）の連携層。

Apple のレスポンスの生の形はこのパッケージの外へ出さない。code・refresh token・
client secret・交換レスポンスの id_token はログ・例外メッセージのどこにも出さない（ADR-013）。
"""
