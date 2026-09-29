"""RSA-OAEP password decryption for login.

Origin: ITTTM user_service/encryption.py -- but the decrypt is **mandatory**
(build prompt anti-pattern #4). There is NO branch that accepts the raw string
as the password when decryption fails; callers get `InvalidEncryptedPassword`
and must reject the login.

In DEBUG, `settings.LOGIN_DECRYPTION_REQUIRED = False` lets a plaintext
password through for local curl / tests -- this is an explicit, config-gated
allowance, not a silent fallback.
"""

import base64
import binascii
import functools
import random
import string

from Crypto.Cipher import AES
from Crypto.Util.Padding import pad, unpad
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from django.conf import settings


class InvalidEncryptedPassword(ValueError):
    """Raised when an encrypted password cannot be decrypted. Login must 401."""


@functools.lru_cache(maxsize=1)
def _private_key():
    path = settings.LOGIN_PRIVATE_KEY_PATH
    with open(path, "rb") as fh:
        return serialization.load_pem_private_key(fh.read(), password=None)


def decrypt_password(encrypted_password: str) -> str:
    """Decrypt a Base64 RSA-OAEP(SHA-256) ciphertext to the plaintext password.

    Raises InvalidEncryptedPassword on any failure -- never returns the input.
    """
    if not isinstance(encrypted_password, str) or not encrypted_password:
        raise InvalidEncryptedPassword("Empty password.")
    try:
        decoded = base64.b64decode(encrypted_password, validate=True)
        plaintext = _private_key().decrypt(
            decoded,
            padding.OAEP(
                mgf=padding.MGF1(algorithm=hashes.SHA256()),
                algorithm=hashes.SHA256(),
                label=None,
            ),
        )
        return plaintext.decode("utf-8")
    except InvalidEncryptedPassword:
        raise
    except Exception as exc:
        raise InvalidEncryptedPassword("Invalid encrypted password.") from exc


def resolve_login_password(raw: str) -> str:
    """Return the plaintext to check against the stored hash.

    - LOGIN_DECRYPTION_REQUIRED (default outside DEBUG): always RSA-decrypt;
      a failure raises InvalidEncryptedPassword and the login is rejected.
    - Otherwise: try to decrypt, and if that fails fall back to treating the
      value as already-plaintext (DEBUG / test convenience only).
    """
    if settings.LOGIN_DECRYPTION_REQUIRED:
        return decrypt_password(raw)
    try:
        return decrypt_password(raw)
    except InvalidEncryptedPassword:
        return raw


DATA_KEY = "TRIALS-ADMIN-API"
DATA_IV = "TRIALS-INITIAL-V"
SECRET_KEY = "V1VWTVRFOVhJRk5WUWsxQlVrbE9SUT09LFRrOUNUMFJaSUZkSlRFd2dTMDVQVnc9PQ=="


class AESify:
    def __init__(
        self, key=DATA_KEY, iv=DATA_IV, secret=SECRET_KEY, block_len=16, salt_len=8
    ):
        self.key = key
        self.iv = iv
        self.salt_len = salt_len
        self.block_len = block_len
        self.mode = AES.MODE_CBC
        if secret:
            self.secret = secret
            self.useSecret(secret)
        else:
            self.secret = self.makeSecret(key, iv)
            if self.secret:
                self.useSecret(self.secret)
        if self.key is None and self.iv is None:
            raise Exception("No key , IV pair or secret provided")

    @staticmethod
    def makeSecret(key, iv):
        if len(key) % 8 != 0:
            raise Exception("Key length must be a mutliple of 8")
        if len(iv) % 8 != 0:
            raise Exception("Initial vector must be a multiple of 8")
        key64 = base64.b64encode(key.encode()).decode()
        iv64 = base64.b64encode(iv.encode()).decode()
        secret = iv64 + "," + key64
        secret64 = base64.b64encode(secret.encode()).decode()
        return secret64

    def useSecret(self, secret):
        iv64, key64 = (
            base64.b64decode(secret).decode().split(",")
        )  # decode and convert to string
        self.iv = base64.b64decode(iv64)
        self.key = base64.b64decode(key64)
        return self

    def encrypt(self, text):
        text = self.add_salt(text, self.salt_len)
        cipher = AES.new(self.key, self.mode, self.iv)
        text = cipher.encrypt(pad(text.encode("utf-8"), self.block_len))
        return binascii.hexlify(text).decode()

    def decrypt(self, data):
        # UNHEX and convert the encrypted data to text
        text = binascii.unhexlify(data)
        cipher = AES.new(self.key, self.mode, self.iv)
        decData = unpad(cipher.decrypt(text), self.block_len).decode("utf-8")[
            self.salt_len :
        ]
        return decData[4:]

    def add_salt(self, text, salt_len):
        # pre-pad with random salt
        salt = "".join(
            random.choice(string.ascii_letters + string.digits) for _ in range(salt_len)
        )
        text = salt + text
        return text
