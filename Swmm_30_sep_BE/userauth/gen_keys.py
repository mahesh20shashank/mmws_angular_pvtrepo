"""Generate the RS256 (JWT) and RSA-OAEP (login) key pairs.

Keys are written to the shared repo root -- the parent of swmm/ and userauth/ --
so both services load the exact same pair. Idempotent per key: an existing .pem
is left untouched unless you pass --force.

    poetry run python gen_keys.py
    poetry run python gen_keys.py --force   # overwrite existing keys

Point the service at them with KEYS_DIR=../keys in .env (already the default in
.env.example).
"""

import argparse
import pathlib

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

KEYS_DIR = pathlib.Path(__file__).resolve().parent.parent / "keys"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--force", action="store_true", help="overwrite key files that already exist"
    )
    args = parser.parse_args()

    KEYS_DIR.mkdir(exist_ok=True)

    for name in ("jwt", "login"):
        priv_path = KEYS_DIR / f"{name}_private.pem"
        pub_path = KEYS_DIR / f"{name}_public.pem"

        if priv_path.exists() and pub_path.exists() and not args.force:
            print(f"skip  {name}: {priv_path.name} / {pub_path.name} already exist")
            continue

        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        priv_path.write_bytes(
            key.private_bytes(
                serialization.Encoding.PEM,
                serialization.PrivateFormat.PKCS8,
                serialization.NoEncryption(),
            )
        )
        pub_path.write_bytes(
            key.public_key().public_bytes(
                serialization.Encoding.PEM,
                serialization.PublicFormat.SubjectPublicKeyInfo,
            )
        )
        print(f"wrote {name}: {priv_path} + {pub_path.name}")

    print(f"\nkeys dir: {KEYS_DIR}")


if __name__ == "__main__":
    main()
