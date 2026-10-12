from datetime import UTC, datetime

import jwt
import pytest
from cryptography.exceptions import UnsupportedAlgorithm
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec, rsa

from sanposcape.integrations.apple.client_secret import (
    APPLE_AUDIENCE,
    build_client_secret,
    load_private_key,
)

NOW = datetime(2026, 10, 12, 0, 0, 0, tzinfo=UTC)


class TestBuildClientSecret:
    def test_signs_es256_jwt_with_apple_claims(self, ec_private_key) -> None:
        secret = build_client_secret(
            team_id="TEAM123456",
            key_id="KEY1234567",
            private_key=ec_private_key,
            client_id="com.sanposcape.app.dev",
            now=NOW,
        )

        header = jwt.get_unverified_header(secret)
        assert header["alg"] == "ES256"
        assert header["kid"] == "KEY1234567"
        claims = jwt.decode(
            secret,
            ec_private_key.public_key(),
            algorithms=["ES256"],
            audience=APPLE_AUDIENCE,
            options={"verify_exp": False, "verify_iat": False},
        )
        assert claims["iss"] == "TEAM123456"
        assert claims["sub"] == "com.sanposcape.app.dev"
        assert claims["aud"] == "https://appleid.apple.com"
        assert claims["iat"] == int(NOW.timestamp())
        assert claims["exp"] - claims["iat"] == 300

    def test_ttl_is_overridable(self, ec_private_key) -> None:
        secret = build_client_secret(
            team_id="T",
            key_id="K",
            private_key=ec_private_key,
            client_id="c",
            now=NOW,
            ttl_seconds=60,
        )

        claims = jwt.decode(secret, options={"verify_signature": False})
        assert claims["exp"] - claims["iat"] == 60


class TestLoadPrivateKey:
    def test_loads_p8_pem(self, ec_private_key_pem, ec_private_key) -> None:
        key = load_private_key(ec_private_key_pem)

        assert key.private_numbers() == ec_private_key.private_numbers()

    @pytest.mark.parametrize("pem", ["", "not a pem", "-----BEGIN PRIVATE KEY-----\nabc\n"])
    def test_rejects_unreadable_pem_without_echoing_it(self, pem: str) -> None:
        with pytest.raises(ValueError) as excinfo:
            load_private_key(pem)

        assert pem.strip() == "" or pem not in str(excinfo.value)

    def test_unsupported_algorithm_is_a_value_error(self, monkeypatch) -> None:
        """OpenSSL が扱えない鍵種別の PEM は `UnsupportedAlgorithm`。ValueError に揃える。"""

        def raise_unsupported(*args, **kwargs):
            raise UnsupportedAlgorithm("unsupported key type: SECRET-DETAIL")

        monkeypatch.setattr(
            "sanposcape.integrations.apple.client_secret.load_pem_private_key", raise_unsupported
        )

        with pytest.raises(ValueError, match="could not be loaded") as excinfo:
            load_private_key("-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----")

        assert "SECRET-DETAIL" not in str(excinfo.value)

    def test_rejects_non_ec_key(self) -> None:
        rsa_pem = (
            rsa.generate_private_key(public_exponent=65537, key_size=2048)
            .private_bytes(
                serialization.Encoding.PEM,
                serialization.PrivateFormat.PKCS8,
                serialization.NoEncryption(),
            )
            .decode("ascii")
        )

        with pytest.raises(ValueError, match="EC P-256"):
            load_private_key(rsa_pem)

    def test_rejects_ec_key_on_other_curve(self) -> None:
        pem = (
            ec.generate_private_key(ec.SECP384R1())
            .private_bytes(
                serialization.Encoding.PEM,
                serialization.PrivateFormat.PKCS8,
                serialization.NoEncryption(),
            )
            .decode("ascii")
        )

        with pytest.raises(ValueError, match="EC P-256"):
            load_private_key(pem)
