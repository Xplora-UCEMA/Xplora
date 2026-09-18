#!/usr/bin/env python3
"""Build a signed, payload-free manifest from a local ZIP of ticket QR images.

The archive is never extracted by filename. Every accepted image is streamed into
a private staging directory, normalized to a metadata-free PNG, checked by
the repository's local QR decoder, and only then atomically published with its
manifest/contact sheet. A native macOS helper remains available as fallback.
"""

from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import math
import os
import platform
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import time
import unicodedata
import warnings
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

try:
    from PIL import Image, ImageDraw, ImageFont, ImageOps, UnidentifiedImageError
except ImportError:  # pragma: no cover - exercised through the CLI error path.
    Image = ImageDraw = ImageFont = ImageOps = UnidentifiedImageError = None  # type: ignore[assignment]


MIB = 1024 * 1024
MANIFEST_VERSION = 1
SECRET_ENV = "POINTS_TICKET_FINGERPRINT_SECRET"
SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
SUPPORTED_IMAGE_FORMATS = {"JPEG", "PNG", "WEBP"}
ARCHIVE_EXTENSIONS = {".zip", ".7z", ".rar", ".tar", ".tgz", ".gz", ".bz2", ".xz"}
IGNORED_BASENAMES = {".DS_Store", "Thumbs.db"}
SLUG_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$")


@dataclass(frozen=True)
class Limits:
    max_archive_bytes: int = 100 * MIB
    max_entries: int = 500
    max_image_entries: int = 250
    max_entry_bytes: int = 25 * MIB
    max_total_uncompressed_bytes: int = 300 * MIB
    max_compression_ratio: float = 100.0
    max_pixels: int = 16_777_216
    max_dimension: int = 4_096
    max_final_png_bytes: int = 2 * MIB
    min_resize_long_edge: int = 800
    max_qr_payload_bytes: int = 8 * 1024
    max_entry_name_bytes: int = 512
    max_path_parts: int = 20
    chunk_bytes: int = 256 * 1024
    vision_timeout_seconds: int = 30
    max_intake_seconds: int = 20 * 60


DEFAULT_LIMITS = Limits()


class IntakeError(Exception):
    """A safe, expected failure. Only ``code`` is emitted by the CLI."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


class RejectedImage(Exception):
    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


@dataclass(frozen=True)
class ArchiveImage:
    info: zipfile.ZipInfo
    source_name: str


def _sha256_file(path: Path, chunk_bytes: int = 256 * 1024) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(chunk_bytes):
            digest.update(chunk)
    return digest.hexdigest()


def _safe_text(value: str, *, maximum: int, code: str) -> str:
    cleaned = value.strip()
    if not cleaned or len(cleaned) > maximum:
        raise IntakeError(code)
    if any(unicodedata.category(character) in {"Cc", "Cs"} for character in cleaned):
        raise IntakeError(code)
    return unicodedata.normalize("NFC", cleaned)


def _canonical_entry_name(info: zipfile.ZipInfo, limits: Limits) -> tuple[str, bool]:
    raw = info.filename
    if not raw or "\\" in raw or "\x00" in raw:
        raise IntakeError("unsafe_archive_path")
    name = unicodedata.normalize("NFC", raw)
    if name.startswith("/") or re.match(r"^[A-Za-z]:", name):
        raise IntakeError("unsafe_archive_path")
    is_directory = info.is_dir() or name.endswith("/")
    parts = name.split("/")
    if is_directory and parts and parts[-1] == "":
        parts.pop()
    if not parts or len(parts) > limits.max_path_parts:
        raise IntakeError("unsafe_archive_path")
    if any(part in {"", ".", ".."} for part in parts):
        raise IntakeError("unsafe_archive_path")
    if any(
        unicodedata.category(character) in {"Cc", "Cs"}
        for part in parts
        for character in part
    ):
        raise IntakeError("unsafe_archive_path")
    canonical = "/".join(parts)
    if len(canonical.encode("utf-8")) > limits.max_entry_name_bytes:
        raise IntakeError("archive_path_too_long")
    return canonical, is_directory


def _reject_special_entry(info: zipfile.ZipInfo, is_directory: bool) -> None:
    if info.flag_bits & 0x1:
        raise IntakeError("encrypted_archive_entry")
    if info.compress_type not in {zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED}:
        raise IntakeError("unsupported_zip_compression")
    if info.create_system != 3:
        return
    mode = (info.external_attr >> 16) & 0xFFFF
    file_type = stat.S_IFMT(mode)
    expected = stat.S_IFDIR if is_directory else stat.S_IFREG
    if file_type not in {0, expected}:
        raise IntakeError("special_archive_entry")


def _is_ignored_metadata(source_name: str) -> bool:
    parts = source_name.split("/")
    return parts[0] == "__MACOSX" or parts[-1] in IGNORED_BASENAMES


def _preflight_archive(
    archive: zipfile.ZipFile,
    limits: Limits,
) -> tuple[list[ArchiveImage], list[dict[str, str]], int]:
    entries = archive.infolist()
    if len(entries) > limits.max_entries:
        raise IntakeError("too_many_archive_entries")

    seen_names: set[str] = set()
    images: list[ArchiveImage] = []
    rejected: list[dict[str, str]] = []
    total_uncompressed = 0
    total_compressed = 0
    file_entries = 0

    for info in entries:
        source_name, is_directory = _canonical_entry_name(info, limits)
        _reject_special_entry(info, is_directory)
        collision_key = source_name.casefold()
        if collision_key in seen_names:
            raise IntakeError("duplicate_archive_path")
        seen_names.add(collision_key)
        if is_directory:
            continue

        file_entries += 1
        if info.file_size < 0 or info.compress_size < 0:
            raise IntakeError("invalid_archive_sizes")
        if info.file_size > limits.max_entry_bytes:
            raise IntakeError("archive_entry_too_large")
        total_uncompressed += info.file_size
        total_compressed += info.compress_size
        if total_uncompressed > limits.max_total_uncompressed_bytes:
            raise IntakeError("archive_uncompressed_limit")
        if info.file_size and info.compress_size == 0:
            raise IntakeError("archive_compression_ratio")
        if info.file_size / max(1, info.compress_size) > limits.max_compression_ratio:
            raise IntakeError("archive_compression_ratio")

        if _is_ignored_metadata(source_name):
            continue
        suffix = Path(source_name).suffix.lower()
        if suffix in ARCHIVE_EXTENSIONS:
            raise IntakeError("nested_archive")
        if suffix not in SUPPORTED_EXTENSIONS:
            rejected.append({"sourceName": source_name, "reason": "unsupported_extension"})
            continue
        images.append(ArchiveImage(info=info, source_name=source_name))

    if total_uncompressed / max(1, total_compressed) > limits.max_compression_ratio:
        raise IntakeError("archive_compression_ratio")
    if len(images) > limits.max_image_entries:
        raise IntakeError("too_many_images")
    images.sort(key=lambda item: (item.source_name.casefold(), item.source_name))
    rejected.sort(key=lambda item: (item["sourceName"].casefold(), item["sourceName"]))
    return images, rejected, file_entries


def _stream_entry(
    archive: zipfile.ZipFile,
    image: ArchiveImage,
    destination: Path,
    limits: Limits,
) -> str:
    digest = hashlib.sha256()
    written = 0
    try:
        with archive.open(image.info, "r") as source, destination.open("xb") as target:
            while chunk := source.read(limits.chunk_bytes):
                written += len(chunk)
                if written > limits.max_entry_bytes or written > image.info.file_size:
                    raise IntakeError("archive_entry_expanded_past_declared_size")
                digest.update(chunk)
                target.write(chunk)
            target.flush()
            os.fsync(target.fileno())
    except (zipfile.BadZipFile, EOFError, RuntimeError, OSError) as error:
        if isinstance(error, IntakeError):
            raise
        raise IntakeError("corrupt_archive") from None
    if written != image.info.file_size:
        raise IntakeError("archive_entry_size_mismatch")
    os.chmod(destination, 0o600)
    return digest.hexdigest()


def _save_clean_png(image: Any, destination: Path) -> None:
    image.save(destination, format="PNG", compress_level=9, optimize=False)
    os.chmod(destination, 0o600)


def _normalize_image(source: Path, destination: Path, limits: Limits) -> tuple[int, int, bool]:
    if Image is None or ImageOps is None or UnidentifiedImageError is None:
        raise IntakeError("pillow_not_installed")

    original_max_pixels = Image.MAX_IMAGE_PIXELS
    Image.MAX_IMAGE_PIXELS = limits.max_pixels
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            try:
                with Image.open(source) as probe:
                    image_format = (probe.format or "").upper()
                    width, height = probe.size
                    frames = int(getattr(probe, "n_frames", 1))
                    if image_format not in SUPPORTED_IMAGE_FORMATS:
                        raise RejectedImage("unsupported_image_format")
                    if frames != 1:
                        raise RejectedImage("animated_image")
                    if width <= 0 or height <= 0:
                        raise RejectedImage("invalid_image")
                    if width > limits.max_dimension or height > limits.max_dimension or width * height > limits.max_pixels:
                        raise RejectedImage("image_dimensions_limit")
                    probe.verify()

                with Image.open(source) as reopened:
                    oriented = ImageOps.exif_transpose(reopened)
                    oriented.load()
                    if "A" in oriented.getbands():
                        rgba = oriented.convert("RGBA")
                        clean = Image.new("RGB", rgba.size, "white")
                        clean.paste(rgba, mask=rgba.getchannel("A"))
                    else:
                        clean = oriented.convert("RGB")
            except RejectedImage:
                raise
            except (Image.DecompressionBombWarning, Image.DecompressionBombError):
                raise RejectedImage("image_dimensions_limit") from None
            except (UnidentifiedImageError, OSError, ValueError):
                raise RejectedImage("invalid_image") from None

        _save_clean_png(clean, destination)
        resized = False
        original_width, original_height = clean.size
        original_long_edge = max(clean.size)
        target_long_edge = original_long_edge

        while destination.stat().st_size > limits.max_final_png_bytes:
            if target_long_edge <= limits.min_resize_long_edge:
                destination.unlink(missing_ok=True)
                raise RejectedImage("normalized_png_too_large")
            target_long_edge = max(limits.min_resize_long_edge, int(target_long_edge * 0.85))
            scale = target_long_edge / original_long_edge
            target_size = (
                max(1, round(original_width * scale)),
                max(1, round(original_height * scale)),
            )
            resized_image = clean.resize(target_size, Image.Resampling.LANCZOS, reducing_gap=3.0)
            _save_clean_png(resized_image, destination)
            resized = True

        with Image.open(destination) as normalized:
            width, height = normalized.size
            # A freshly-created RGB image saved without pnginfo/EXIF/ICC is metadata-free.
            if normalized.info:
                destination.unlink(missing_ok=True)
                raise RejectedImage("normalized_png_metadata")
        return width, height, resized
    finally:
        Image.MAX_IMAGE_PIXELS = original_max_pixels


def _decode_qr(decoder: Path, image: Path, limits: Limits) -> tuple[int, str | None]:
    environment = dict(os.environ)
    environment.pop(SECRET_ENV, None)
    try:
        result = subprocess.run(
            [str(decoder), str(image)],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            timeout=limits.vision_timeout_seconds,
            check=False,
            env=environment,
        )
    except (OSError, subprocess.TimeoutExpired):
        raise IntakeError("qr_decoder_failed") from None
    if len(result.stdout) > limits.max_qr_payload_bytes * 4 + 4096:
        raise IntakeError("qr_decoder_failed")
    try:
        response = json.loads(result.stdout.decode("utf-8"))
        count = int(response["count"])
    except (UnicodeDecodeError, ValueError, TypeError, KeyError, json.JSONDecodeError):
        raise IntakeError("qr_decoder_failed") from None
    if result.returncode == 2 and count != 1:
        return count, None
    if result.returncode != 0 or count != 1:
        raise IntakeError("qr_decoder_failed")
    payload = response.get("payload")
    if not isinstance(payload, str):
        raise IntakeError("qr_decoder_failed")
    payload_bytes = payload.encode("utf-8")
    if not payload_bytes or len(payload_bytes) > limits.max_qr_payload_bytes:
        raise RejectedImage("qr_payload_size")
    return 1, payload


def _fingerprint(secret: bytes, payload: str) -> str:
    return hmac.new(secret, payload.encode("utf-8"), hashlib.sha256).hexdigest()


def _canonical_signed_json(version: int, event: dict[str, str], accepted: list[dict[str, Any]]) -> bytes:
    signed = {"version": version, "event": event, "accepted": accepted}
    return json.dumps(
        signed,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def _manifest_signature(secret: bytes, event: dict[str, str], accepted: list[dict[str, Any]]) -> str:
    canonical = _canonical_signed_json(MANIFEST_VERSION, event, accepted)
    return hmac.new(secret, canonical, hashlib.sha256).hexdigest()


def _ascii_label(value: str, maximum: int = 34) -> str:
    basename = value.rsplit("/", 1)[-1]
    safe = basename.encode("ascii", "backslashreplace").decode("ascii")
    if len(safe) <= maximum:
        return safe
    return safe[: maximum - 3] + "..."


def _build_contact_sheet(staging: Path, accepted: list[dict[str, Any]]) -> str:
    if Image is None or ImageDraw is None or ImageFont is None or ImageOps is None:
        raise IntakeError("pillow_not_installed")
    columns = max(1, math.ceil(math.sqrt(len(accepted))))
    rows = math.ceil(len(accepted) / columns)
    tile_width, tile_height = 260, 300
    sheet = Image.new("RGB", (columns * tile_width, rows * tile_height), "white")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()

    for index, item in enumerate(accepted):
        row, column = divmod(index, columns)
        left, top = column * tile_width, row * tile_height
        normalized_path = staging / item["normalizedFile"]
        with Image.open(normalized_path) as source:
            preview = ImageOps.contain(source.convert("RGB"), (226, 226), Image.Resampling.LANCZOS)
        image_left = left + (tile_width - preview.width) // 2
        sheet.paste(preview, (image_left, top + 8))
        draw.rectangle((left, top, left + tile_width - 1, top + tile_height - 1), outline="#D6D9DD", width=1)
        draw.text((left + 10, top + 242), f"#{index + 1:03d}  {item['qrFingerprint'][:12]}", fill="#111111", font=font)
        draw.text((left + 10, top + 262), _ascii_label(item["sourceName"]), fill="#555555", font=font)

    relative = "contact-sheet.png"
    destination = staging / relative
    sheet.save(destination, format="PNG", compress_level=9, optimize=False)
    os.chmod(destination, 0o600)
    return relative


def _write_json(path: Path, value: dict[str, Any]) -> None:
    serialized = json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    with path.open("x", encoding="utf-8", newline="\n") as handle:
        handle.write(serialized)
        handle.flush()
        os.fsync(handle.fileno())
    os.chmod(path, 0o600)


def _write_preview_gitignore(path: Path) -> None:
    with path.open("x", encoding="utf-8", newline="\n") as handle:
        handle.write("*\n!.gitignore\n")
        handle.flush()
        os.fsync(handle.fileno())
    os.chmod(path, 0o600)


def _fsync_directory(path: Path) -> None:
    descriptor = os.open(path, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def _compile_default_decoder() -> Path:
    source = Path(__file__).with_name("decode_qr.swift")
    if not source.is_file():
        raise IntakeError("vision_decoder_missing")
    compiler = shutil.which("swiftc")
    if not compiler:
        raise IntakeError("swift_not_installed")
    try:
        compiler_version = subprocess.run(
            [compiler, "--version"],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            timeout=10,
            check=True,
        ).stdout
    except (OSError, subprocess.SubprocessError):
        raise IntakeError("swift_not_available") from None

    cache_key = hashlib.sha256(source.read_bytes() + compiler_version + platform.machine().encode()).hexdigest()[:20]
    cache_root = Path(tempfile.gettempdir()) / f"xplora-ticket-intake-{os.getuid()}"
    if cache_root.exists() and (cache_root.is_symlink() or cache_root.stat().st_uid != os.getuid()):
        raise IntakeError("unsafe_decoder_cache")
    cache_root.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(cache_root, 0o700)
    binary = cache_root / f"decode-qr-{cache_key}"
    if binary.is_file() and os.access(binary, os.X_OK) and binary.stat().st_uid == os.getuid():
        return binary

    build_directory = Path(tempfile.mkdtemp(prefix="decoder-build-", dir=cache_root))
    try:
        candidate = build_directory / "decode-qr"
        module_cache = build_directory / "module-cache"
        result = subprocess.run(
            [
                compiler,
                "-module-cache-path",
                str(module_cache),
                str(source),
                "-framework",
                "Vision",
                "-framework",
                "CoreImage",
                "-o",
                str(candidate),
            ],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=180,
            check=False,
        )
        if result.returncode != 0 or not candidate.is_file():
            raise IntakeError("vision_decoder_compile_failed")
        os.chmod(candidate, 0o700)
        os.replace(candidate, binary)
        return binary
    except subprocess.TimeoutExpired:
        raise IntakeError("vision_decoder_compile_failed") from None
    finally:
        shutil.rmtree(build_directory, ignore_errors=True)


def _default_decoder() -> Path:
    node_decoder = Path(__file__).with_name("decode_qr_node.mjs")
    if shutil.which("node") and node_decoder.is_file() and os.access(node_decoder, os.X_OK):
        environment = dict(os.environ)
        environment.pop(SECRET_ENV, None)
        try:
            check = subprocess.run(
                [str(node_decoder), "--self-test"],
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                timeout=10,
                check=False,
                env=environment,
            )
            if check.returncode == 0 and check.stdout.strip() == b'{"ok":true}':
                return node_decoder
        except (OSError, subprocess.TimeoutExpired):
            pass
    return _compile_default_decoder()


def _validated_decoder(value: Path | None) -> Path:
    decoder = value if value is not None else _default_decoder()
    decoder = decoder.expanduser().resolve()
    if not decoder.is_file() or not os.access(decoder, os.X_OK):
        raise IntakeError("qr_decoder_not_executable")
    return decoder


def build_intake(
    archive_path: Path,
    output_path: Path,
    *,
    event_slug: str,
    event_title: str,
    secret: bytes,
    decoder: Path,
    limits: Limits = DEFAULT_LIMITS,
) -> dict[str, Any]:
    if len(secret) < 32:
        raise IntakeError("fingerprint_secret_too_short")
    if not SLUG_RE.fullmatch(event_slug):
        raise IntakeError("invalid_event_slug")
    event_title = _safe_text(event_title, maximum=160, code="invalid_event_title")
    archive_path = archive_path.expanduser().resolve()
    output_path = output_path.expanduser().resolve()
    if not archive_path.is_file():
        raise IntakeError("archive_not_found")
    if archive_path.stat().st_size > limits.max_archive_bytes:
        raise IntakeError("archive_too_large")
    if output_path.exists():
        raise IntakeError("output_already_exists")

    output_path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=f".{output_path.name}.staging-", dir=output_path.parent))
    os.chmod(staging, 0o700)
    published = False
    intake_deadline = time.monotonic() + limits.max_intake_seconds

    try:
        normalized_directory = staging / "normalized"
        scratch_directory = staging / ".scratch"
        normalized_directory.mkdir(mode=0o700)
        scratch_directory.mkdir(mode=0o700)

        accepted: list[dict[str, Any]] = []
        duplicates: list[dict[str, str]] = []
        raw_hashes: dict[str, str] = {}
        normalized_hashes: dict[str, str] = {}
        fingerprints: dict[str, str] = {}

        try:
            archive = zipfile.ZipFile(archive_path, "r")
        except (zipfile.BadZipFile, OSError):
            raise IntakeError("corrupt_archive") from None

        with archive:
            images, rejected, file_entries = _preflight_archive(archive, limits)
            for candidate_index, archive_image in enumerate(images, start=1):
                if time.monotonic() > intake_deadline:
                    raise IntakeError("intake_timeout")
                raw_path = scratch_directory / f"raw-{candidate_index:04d}"
                normalized_path = scratch_directory / f"normalized-{candidate_index:04d}.png"
                raw_hash = _stream_entry(archive, archive_image, raw_path, limits)

                if raw_hash in raw_hashes:
                    duplicates.append({
                        "sourceName": archive_image.source_name,
                        "kind": "exact",
                        "duplicateOf": raw_hashes[raw_hash],
                    })
                    raw_path.unlink(missing_ok=True)
                    continue

                try:
                    width, height, resized = _normalize_image(raw_path, normalized_path, limits)
                    normalized_hash = _sha256_file(normalized_path, limits.chunk_bytes)
                    if normalized_hash in normalized_hashes:
                        duplicate_of = normalized_hashes[normalized_hash]
                        duplicates.append({
                            "sourceName": archive_image.source_name,
                            "kind": "exact",
                            "duplicateOf": duplicate_of,
                        })
                        raw_hashes[raw_hash] = duplicate_of
                        continue

                    count, payload = _decode_qr(decoder, normalized_path, limits)
                    if count == 0:
                        raise RejectedImage("qr_not_found_after_resize" if resized else "qr_not_found")
                    if count != 1 or payload is None:
                        raise RejectedImage("multiple_qr_codes")
                    qr_fingerprint = _fingerprint(secret, payload)
                    if qr_fingerprint in fingerprints:
                        duplicate_of = fingerprints[qr_fingerprint]
                        duplicates.append({
                            "sourceName": archive_image.source_name,
                            "kind": "semantic",
                            "duplicateOf": duplicate_of,
                        })
                        raw_hashes[raw_hash] = duplicate_of
                        normalized_path.unlink(missing_ok=True)
                        continue

                    relative_file = f"normalized/{len(accepted) + 1:04d}-{qr_fingerprint[:16]}.png"
                    final_path = staging / relative_file
                    os.replace(normalized_path, final_path)
                    item: dict[str, Any] = {
                        "sourceName": archive_image.source_name,
                        "normalizedFile": relative_file,
                        "imageSha256": normalized_hash,
                        "qrFingerprint": qr_fingerprint,
                        "width": width,
                        "height": height,
                    }
                    accepted.append(item)
                    raw_hashes[raw_hash] = archive_image.source_name
                    normalized_hashes[normalized_hash] = archive_image.source_name
                    fingerprints[qr_fingerprint] = archive_image.source_name
                except RejectedImage as error:
                    rejected.append({"sourceName": archive_image.source_name, "reason": error.reason})
                finally:
                    raw_path.unlink(missing_ok=True)
                    normalized_path.unlink(missing_ok=True)

        if not accepted:
            raise IntakeError("no_accepted_tickets")

        duplicates.sort(key=lambda item: (item["sourceName"].casefold(), item["sourceName"]))
        rejected.sort(key=lambda item: (item["sourceName"].casefold(), item["sourceName"], item["reason"]))
        contact_sheet = _build_contact_sheet(staging, accepted)
        event = {"slug": event_slug, "title": event_title}
        manifest: dict[str, Any] = {
            "version": MANIFEST_VERSION,
            "event": event,
            "summary": {
                "archiveEntries": file_entries,
                "accepted": len(accepted),
                "duplicates": len(duplicates),
                "rejected": len(rejected),
            },
            "accepted": accepted,
            "duplicates": duplicates,
            "rejected": rejected,
            "contactSheet": contact_sheet,
            "manifestSignature": _manifest_signature(secret, event, accepted),
        }
        _write_json(staging / "manifest.json", manifest)
        _write_preview_gitignore(staging / ".gitignore")
        shutil.rmtree(scratch_directory)
        _fsync_directory(normalized_directory)
        _fsync_directory(staging)
        if output_path.exists():
            raise IntakeError("output_already_exists")
        os.rename(staging, output_path)
        published = True
        _fsync_directory(output_path.parent)
        return manifest
    finally:
        if not published:
            shutil.rmtree(staging, ignore_errors=True)


def _argument_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Procesa localmente un ZIP de entradas LABITCONF.")
    parser.add_argument("archive", type=Path, help="ZIP de imágenes de entradas")
    parser.add_argument("--output", required=True, type=Path, help="Directorio de salida nuevo")
    parser.add_argument("--event-slug", required=True, help="Slug estable del evento")
    parser.add_argument("--event-title", required=True, help="Título visible del evento")
    parser.add_argument(
        "--qr-decoder",
        type=Path,
        help="Decoder QR ejecutable opcional (por defecto usa el decoder local Node y conserva Swift como fallback)",
    )
    return parser


def main(argv: Iterable[str] | None = None) -> int:
    os.umask(0o077)
    arguments = _argument_parser().parse_args(list(argv) if argv is not None else None)
    secret_value = os.environ.get(SECRET_ENV, "")
    try:
        decoder = _validated_decoder(arguments.qr_decoder)
        manifest = build_intake(
            arguments.archive,
            arguments.output,
            event_slug=arguments.event_slug,
            event_title=arguments.event_title,
            secret=secret_value.encode("utf-8"),
            decoder=decoder,
        )
    except IntakeError as error:
        print(f"ticket intake failed: {error.code}", file=sys.stderr)
        return 1
    except Exception:
        # Do not print provider errors, filenames or decoded QR payloads.
        print("ticket intake failed: internal_error", file=sys.stderr)
        return 1
    print(
        f"Intake listo: {manifest['summary']['accepted']} aceptadas, "
        f"{manifest['summary']['duplicates']} duplicadas, "
        f"{manifest['summary']['rejected']} rechazadas."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
