#!/usr/bin/env python3
import argparse
import ctypes
import errno
import os
from pathlib import Path
import plistlib
import re
import shutil
import stat
import sys
from xml.parsers.expat import ExpatError


def clone_root():
    # Python omits Darwin's _CS_DARWIN_USER_TEMP_DIR name from confstr_names.
    return Path(os.confstr(65537)).resolve().parent / "X/com.google.Chrome.code_sign_clone"


def identity(path):
    info = path.lstat()
    return info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns


def candidate(path):
    if not re.fullmatch(r"code_sign_clone\.[A-Za-z0-9._-]{6}", path.name):
        raise ValueError("unrecognized clone name")
    info = path.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid():
        raise ValueError("clone is not an owned directory")
    bundle = path / "Google Chrome.app.bundle"
    if {p.name for p in path.iterdir()} != {bundle.name}:
        raise ValueError("unrecognized clone contents")
    for part in (bundle, bundle / "Contents", bundle / "Contents/MacOS"):
        if not stat.S_ISDIR(part.lstat().st_mode):
            raise ValueError("clone bundle contains a directory symlink")
    metadata = bundle / "Contents/Info.plist"
    if not stat.S_ISREG(metadata.lstat().st_mode):
        raise ValueError("clone metadata is not a regular file")
    with metadata.open("rb") as file:
        data = plistlib.load(file)
    if not isinstance(data, dict) or data.get("CFBundleIdentifier") != "com.google.Chrome" or data.get("CFBundleExecutable") != "Google Chrome":
        raise ValueError("unrecognized Chrome bundle")
    executable = bundle / "Contents/MacOS/Google Chrome"
    if not stat.S_ISREG(executable.lstat().st_mode):
        raise ValueError("clone executable is not a regular file")
    return executable, str(data.get("CFBundleShortVersionString", "unknown")), tuple(identity(p) for p in (path, bundle, metadata, executable))


def unused(fd):
    libc = ctypes.CDLL(None, use_errno=True)
    libc.ffsctl.argtypes = [ctypes.c_int, ctypes.c_ulong, ctypes.c_void_p, ctypes.c_uint]
    libc.ffsctl.restype = ctypes.c_int
    value = ctypes.c_uint32()
    ctypes.set_errno(0)
    # XNU's FSIOC_FD_ONLY_OPEN_ONCE is private; Chromium uses the same request.
    if libc.ffsctl(fd, 0xC0044115, ctypes.byref(value), 0) == 0:
        return True
    error = ctypes.get_errno()
    if error == errno.EBUSY:
        return False
    raise OSError(error, "native executable reference check unavailable")


def clean(root, apply=False, names=None):
    removed = eligible = kept = 0
    if root.name != "com.google.Chrome.code_sign_clone" or root.parent.name != "X":
        raise ValueError("unexpected Chrome clone root")
    if not root.exists():
        print("Chrome clones: 0 eligible, 0 removed, 0 kept.")
        return
    if root.is_symlink() or root.resolve() != root or root.stat().st_uid != os.getuid():
        raise ValueError("Chrome clone root is not an owned real directory")
    paths = sorted(root.iterdir()) if names is None else [root / name for name in names]
    for path in paths:
        if path.parent != root:
            raise ValueError("clone name must be a direct child")
        fd = None
        try:
            executable, version, before = candidate(path)
            fd = os.open(executable, os.O_RDONLY | os.O_NOFOLLOW)
            info = os.fstat(fd)
            if (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns) != before[-1]:
                raise ValueError("clone executable changed")
            if not unused(fd):
                raise ValueError("executable still referenced")
            eligible += 1
            print(f"  chrome-clone {path.name} version {version}", flush=True)
            if apply:
                if candidate(path)[2] != before:
                    raise ValueError("clone identity changed before removal")
                if not unused(fd):
                    raise ValueError("executable became referenced")
                if candidate(path)[2] != before:
                    raise ValueError("clone identity changed during native check")
                shutil.rmtree(path)
                removed += 1
        except (OSError, ValueError, ExpatError) as error:
            kept += 1
            print(f"  kept {path.name}: {error}", flush=True)
        finally:
            if fd is not None:
                os.close(fd)
    print(f"Chrome clones: {eligible} eligible, {removed} removed, {kept} kept. Apply: {str(apply).lower()}.")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--yes", action="store_true")
    parser.add_argument("clones", nargs="*")
    args = parser.parse_args()
    if sys.platform != "darwin":
        print("Chrome code-sign clone cleanup is available only on macOS.")
        return 0
    try:
        clean(clone_root(), args.yes, args.clones or None)
    except (OSError, ValueError, AttributeError) as error:
        print("Chrome clone cleanup failed: " + str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
