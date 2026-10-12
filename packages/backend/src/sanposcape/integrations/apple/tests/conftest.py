import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec


@pytest.fixture(scope="session")
def ec_private_key() -> ec.EllipticCurvePrivateKey:
    """テスト用の EC P-256 秘密鍵（.p8 と同じ種類）。"""
    return ec.generate_private_key(ec.SECP256R1())


@pytest.fixture(scope="session")
def ec_private_key_pem(ec_private_key: ec.EllipticCurvePrivateKey) -> str:
    """PKCS#8 の PEM（.p8 の中身と同じ形式）。"""
    return ec_private_key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode("ascii")
