"""Mangum を包んだ Lambda ハンドラーの組み立て（import しても副作用は無い）。

このモジュールは import しただけでは何も起動しない（ハイドレーションも `sanposcape.main`
の import も lifespan の起動もしない）。起動の順序は `aws_lambda/api.py` が持つ。
"""

from fastapi import FastAPI
from mangum import Mangum


def build_handler(app: FastAPI) -> Mangum:
    return Mangum(app, lifespan="auto")
