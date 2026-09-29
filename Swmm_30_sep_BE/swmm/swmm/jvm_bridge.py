"""Shared JPype/Jackcess bridge for writing real .accdb files on any OS.

JPype allows only one JVM per process, so every app (dart, ems, srar, ...)
must go through ``get_jackcess()`` instead of calling ``jpype.startJVM``
directly. Call it lazily from inside a view/service, not at import time -
importing this module must never require a JVM/JAR set to be present
(e.g. during ``manage.py check`` or unit tests that don't touch ACCDB export).

JARs are not vendored in git (binary blobs); place them under
``<BASE_DIR>/jvm_libs/`` (or set ``JACKCESS_LIB_DIR``):
    jackcess-3.0.1.jar
    jackcess-encrypt-3.0.0.jar
    commons-lang3-3.12.0.jar
    commons-logging-1.2.jar
    bcprov-jdk15on-1.70.jar
"""

import glob
import os
import threading

from django.conf import settings

_lock = threading.Lock()
_jackcess_classes = None


class AccdbBridgeUnavailable(RuntimeError):
    """Raised when the JVM/JAR bridge cannot be started (missing JRE/JARs)."""


def _lib_dir():
    configured = getattr(settings, "JACKCESS_LIB_DIR", None) or os.environ.get(
        "JACKCESS_LIB_DIR"
    )
    if configured:
        return configured
    return os.path.join(settings.BASE_DIR, "jvm_libs")


def get_jackcess():
    """Start the JVM (once) and return the Jackcess classes we need.

    Returns a dict with keys: DatabaseBuilder, TableBuilder, ColumnBuilder,
    DataType, CryptCodecProvider, CodecProvider, File.
    Raises AccdbBridgeUnavailable if the JVM or JARs are not available.
    """
    global _jackcess_classes

    if _jackcess_classes is not None:
        return _jackcess_classes

    with _lock:
        if _jackcess_classes is not None:
            return _jackcess_classes

        import jpype
        import jpype.imports  # noqa: F401  (enables `from java...` imports)

        if not jpype.isJVMStarted():
            lib_dir = _lib_dir()
            jars = sorted(glob.glob(os.path.join(lib_dir, "*.jar")))
            if not jars:
                raise AccdbBridgeUnavailable(
                    f"No Jackcess JARs found in {lib_dir}. "
                    "Download jackcess/jackcess-encrypt/commons-lang3/"
                    "commons-logging/bcprov and place them there."
                )
            try:
                jpype.startJVM(classpath=jars, convertStrings=False)
            except OSError as exc:
                raise AccdbBridgeUnavailable(
                    f"Could not start JVM - is a JRE installed? ({exc})"
                ) from exc

        from java.io import File
        from com.healthmarketscience.jackcess import (
            DatabaseBuilder,
            TableBuilder,
            ColumnBuilder,
            DataType,
        )

        _jackcess_classes = {
            "DatabaseBuilder": DatabaseBuilder,
            "TableBuilder": TableBuilder,
            "ColumnBuilder": ColumnBuilder,
            "DataType": DataType,
            "File": File,
        }
        return _jackcess_classes
