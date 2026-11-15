import os
import stat
from pathlib import Path
from typing import Optional
from cryptography.fernet import Fernet, InvalidToken

class CryptoService:
    _key: Optional[bytes] = None
    _cipher: Optional[Fernet] = None

    @classmethod
    def _get_key_path(cls) -> Path:
        base_dir = Path(__file__).resolve().parent.parent / "data"
        base_dir.mkdir(parents=True, exist_ok=True)
        return base_dir / ".secret.key"

    @classmethod
    def _get_cipher(cls) -> Fernet:
        if cls._cipher is not None:
            return cls._cipher

        key_path = cls._get_key_path()
        if key_path.exists():
            with open(key_path, "rb") as f:
                key = f.read().strip()
        else:
            key = Fernet.generate_key()
            with open(key_path, "wb") as f:
                f.write(key)
            try:
                # Restringir permisos a 0600 (solo lectura/escritura para el dueño)
                os.chmod(key_path, stat.S_IRUSR | stat.S_IWUSR)
            except Exception:
                pass

        cls._key = key
        cls._cipher = Fernet(key)
        return cls._cipher

    @classmethod
    def encrypt(cls, plaintext: Optional[str]) -> Optional[str]:
        """Cifra un texto plano de forma segura. Si está vacío o es None, lo retorna tal cual."""
        if not plaintext or not isinstance(plaintext, str) or not plaintext.strip():
            return plaintext

        # Evitar re-cifrado si ya comienza con prefijo de cifrado
        if plaintext.startswith("enc::"):
            return plaintext

        cipher = cls._get_cipher()
        encrypted_bytes = cipher.encrypt(plaintext.encode("utf-8"))
        return f"enc::{encrypted_bytes.decode('utf-8')}"

    @classmethod
    def decrypt(cls, ciphertext: Optional[str]) -> Optional[str]:
        """Descifra un texto cifrado. Si no está cifrado (legacy), retorna el texto original de forma transparente."""
        if not ciphertext or not isinstance(ciphertext, str):
            return ciphertext

        if not ciphertext.startswith("enc::"):
            return ciphertext

        try:
            cipher = cls._get_cipher()
            raw_encrypted = ciphertext[5:].encode("utf-8")
            decrypted_bytes = cipher.decrypt(raw_encrypted)
            return decrypted_bytes.decode("utf-8")
        except (InvalidToken, Exception) as e:
            # En caso de token inválido, retornar None para no usar credenciales corruptas
            return None
