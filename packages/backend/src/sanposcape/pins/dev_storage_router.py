"""`STORAGE_MODE=fake` 専用の開発用ストレージ受け口。

S3 の presigned POST / presigned GET の代わりに backend 自身が受ける（`FakeObjectStorage`
が発行する URL の宛先）。`include_in_schema=False` に加え、`main.py` は
`STORAGE_MODE=fake` のときだけこの router を include する（本番の OpenAPI に一切現れない）。
挙動は S3 互換にする（成功は 204、失敗は S3 と同じ XML エラー）。
"""

from fastapi import APIRouter, File, Form, Query, Request, UploadFile
from fastapi.responses import Response

from sanposcape.integrations.aws.s3 import FakeObjectStorage

router = APIRouter(prefix="/dev-storage", tags=["dev-storage"], include_in_schema=False)


def _fake_storage(request: Request) -> FakeObjectStorage:
    storage = request.app.state.object_storage
    if not isinstance(storage, FakeObjectStorage):
        # STORAGE_MODE=fake でない状態でこの router が include されることは無い
        # （main.py の配線ミスでしか起こらない防御的チェック）。
        raise RuntimeError("dev-storage router requires STORAGE_MODE=fake")
    return storage


def _s3_style_error(code: str, *, status_code: int) -> Response:
    body = f'<?xml version="1.0" encoding="UTF-8"?><Error><Code>{code}</Code></Error>'
    return Response(content=body, media_type="application/xml", status_code=status_code)


@router.post("/uploads")
async def upload(
    request: Request,
    file: UploadFile = File(...),
    key: str = Form(...),
    content_type: str = Form(..., alias="Content-Type"),
    max_bytes: str = Form(..., alias="x-fake-max-bytes"),
    expires: str = Form(..., alias="x-fake-expires"),
    signature: str = Form(..., alias="x-fake-signature"),
) -> Response:
    storage = _fake_storage(request)
    fields = {
        "key": key,
        "Content-Type": content_type,
        "x-fake-max-bytes": max_bytes,
        "x-fake-expires": expires,
        "x-fake-signature": signature,
    }
    error = storage.verify_upload_fields(fields)
    if error is not None:
        return _s3_style_error(error, status_code=403)

    data = await file.read()
    error = storage.store_upload(
        key=key, content_type=content_type, data=data, max_bytes=int(max_bytes)
    )
    if error is not None:
        return _s3_style_error(error, status_code=400)
    return Response(status_code=204)


@router.get("/objects/{key:path}")
def get_object(
    key: str,
    request: Request,
    expires: str = Query(...),
    signature: str = Query(...),
) -> Response:
    storage = _fake_storage(request)
    error = storage.verify_download_signature(key=key, expires=expires, signature=signature)
    if error is not None:
        return _s3_style_error(error, status_code=403)

    stored = storage.read_object(key)
    if stored is None:
        return _s3_style_error("NoSuchKey", status_code=404)
    data, content_type = stored
    return Response(content=data, media_type=content_type)
