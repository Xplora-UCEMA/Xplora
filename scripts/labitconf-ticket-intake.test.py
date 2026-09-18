#!/usr/bin/env python3

from __future__ import annotations

import hashlib
import hmac
import json
import os
import random
import shutil
import stat
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "labitconf_ticket_intake.py"
IMPORT_SCRIPT = ROOT / "scripts" / "import-labitconf-tickets.ts"
SWIFT_DECODER = ROOT / "scripts" / "decode_qr.swift"
NODE_DECODER = ROOT / "scripts" / "decode_qr_node.mjs"
SECRET = "fixture-ticket-fingerprint-secret-with-at-least-32-bytes"
SECRET_ENV = "POINTS_TICKET_FINGERPRINT_SECRET"
EVENT_SLUG = "labitconf-2026"
EVENT_TITLE = "LABITCONF 2026"

RED = (230, 20, 20)
BLUE = (20, 70, 230)
GREEN = (20, 180, 70)
YELLOW = (230, 190, 20)
CYAN = (20, 190, 190)
ORANGE = (230, 110, 20)
MAGENTA = (210, 20, 190)


class TicketIntakeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        if not shutil.which("node"):
            raise unittest.SkipTest("The intake requires the repository Node runtime")
        cls.class_temp = tempfile.TemporaryDirectory(prefix="ticket-intake-tests-")
        cls.class_root = Path(cls.class_temp.name)
        if sys.platform == "darwin" and shutil.which("swiftc"):
            cls.vision_decoder = cls.class_root / "decode-qr"
            module_cache = Path(tempfile.gettempdir()) / f"xplora-ticket-intake-test-modules-{os.getuid()}"
            module_cache.mkdir(mode=0o700, parents=True, exist_ok=True)
            compile_result = subprocess.run(
                [
                    "swiftc",
                    "-module-cache-path",
                    str(module_cache),
                    str(SWIFT_DECODER),
                    "-framework",
                    "Vision",
                    "-framework",
                    "CoreImage",
                    "-o",
                    str(cls.vision_decoder),
                ],
                cwd=ROOT,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=180,
                check=False,
            )
            if compile_result.returncode != 0:
                raise AssertionError("decode_qr.swift did not compile")

        # Vision cannot create its inference context inside some CI/sandbox
        # environments. The intake contract is tested with a deterministic
        # executable fixture; the production Vision helper is still compiled
        # above so API drift fails the suite.
        cls.decoder = cls.class_root / "fixture-decoder.py"
        fixture_decoder = r'''#!/usr/bin/env python3
import json
import os
import sys
from PIL import Image

COLORS = {
    (230, 20, 20): "labitconf-ticket-fixture-A",
    (20, 70, 230): "labitconf-ticket-fixture-B",
    (20, 180, 70): "same-ticket-payload",
    (230, 190, 20): "unique-ticket-payload",
    (20, 190, 190): "one-valid-ticket",
    (230, 110, 20): "large-image-ticket",
}

if "POINTS_TICKET_FINGERPRINT_SECRET" in os.environ:
    print(json.dumps({"count": 0, "error": "secret_leaked"}))
    raise SystemExit(3)

with Image.open(sys.argv[1]) as image:
    sample = image.convert("RGB").getpixel((0, 0))
nearest = min(COLORS, key=lambda color: sum((color[i] - sample[i]) ** 2 for i in range(3)))
distance = sum((nearest[i] - sample[i]) ** 2 for i in range(3))
if sample[0] > 160 and sample[2] > 140 and sample[1] < 80:
    print(json.dumps({"count": 2}))
    raise SystemExit(2)
if max(sample) < 60:
    print(json.dumps({"count": 0}))
    raise SystemExit(2)
if min(sample) > 240:
    print(json.dumps({"count": 0}))
    raise SystemExit(2)
if distance > 2500:
    print(json.dumps({"count": 0, "error": "unknown_fixture"}))
    raise SystemExit(3)
print(json.dumps({"count": 1, "payload": COLORS[nearest]}))
'''
        cls.decoder.write_text(fixture_decoder, encoding="utf-8")
        cls.decoder.chmod(0o700)

    @classmethod
    def tearDownClass(cls) -> None:
        cls.class_temp.cleanup()

    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory(prefix="ticket-intake-case-")
        self.work = Path(self.temp.name)

    def tearDown(self) -> None:
        self.temp.cleanup()

    def make_qr(self, name: str, payload: str, width: int = 360, marker: tuple[int, int, int] = RED) -> Path:
        destination = self.work / name
        javascript = """
const QRCode = require('qrcode');
QRCode.toFile(process.argv[1], process.argv[2], {
  width: Number(process.argv[3]), margin: 4, errorCorrectionLevel: 'H',
}).catch(() => process.exit(1));
"""
        result = subprocess.run(
            ["node", "-e", javascript, str(destination), payload, str(width)],
            cwd=ROOT,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=30,
            check=False,
        )
        self.assertEqual(result.returncode, 0, "failed to create QR fixture")
        with Image.open(destination) as image:
            marked = image.convert("RGB")
        draw = ImageDraw.Draw(marked)
        marker_size = max(18, width // 12)
        draw.rectangle((0, 0, marker_size, marker_size), fill=marker)
        marked.save(destination, format="PNG")
        return destination

    def make_zip(self, name: str, entries: list[tuple[str, bytes]], compression: int = zipfile.ZIP_DEFLATED) -> Path:
        destination = self.work / name
        with zipfile.ZipFile(destination, "w", compression=compression) as archive:
            for entry_name, content in entries:
                archive.writestr(entry_name, content)
        return destination

    def run_intake(self, archive: Path, output_name: str = "output") -> tuple[subprocess.CompletedProcess[str], Path]:
        output = self.work / output_name
        environment = dict(os.environ)
        environment["POINTS_TICKET_FINGERPRINT_SECRET"] = SECRET
        result = subprocess.run(
            [
                sys.executable,
                str(SCRIPT),
                str(archive),
                "--output",
                str(output),
                "--event-slug",
                EVENT_SLUG,
                "--event-title",
                EVENT_TITLE,
                "--qr-decoder",
                str(self.decoder),
            ],
            cwd=ROOT,
            env=environment,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=120,
            check=False,
        )
        return result, output

    def run_intake_with_default_decoder(
        self,
        archive: Path,
        output_name: str = "default-decoder-output",
    ) -> tuple[subprocess.CompletedProcess[str], Path]:
        output = self.work / output_name
        environment = dict(os.environ)
        environment[SECRET_ENV] = SECRET
        result = subprocess.run(
            [
                sys.executable,
                str(SCRIPT),
                str(archive),
                "--output",
                str(output),
                "--event-slug",
                EVENT_SLUG,
                "--event-title",
                EVENT_TITLE,
            ],
            cwd=ROOT,
            env=environment,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=120,
            check=False,
        )
        return result, output

    def read_manifest(self, output: Path) -> tuple[dict[str, object], str]:
        text = (output / "manifest.json").read_text(encoding="utf-8")
        return json.loads(text), text

    def assert_no_staging(self, output: Path) -> None:
        self.assertEqual(list(output.parent.glob(f".{output.name}.staging-*")), [])

    def test_happy_path_builds_signed_payload_free_manifest_and_contact_sheet(self) -> None:
        payload_a = "labitconf-ticket-fixture-A"
        payload_b = "labitconf-ticket-fixture-B"
        qr_a = self.make_qr("a.png", payload_a, 380, RED)
        qr_b = self.make_qr("b.png", payload_b, 420, BLUE)
        archive = self.make_zip("tickets.zip", [
            ("zeta/ticket-b.png", qr_b.read_bytes()),
            ("notes.txt", b"not an image"),
            ("__MACOSX/._ticket.png", b"resource fork"),
            ("alpha/ticket-a.png", qr_a.read_bytes()),
        ])

        result, output = self.run_intake(archive)
        self.assertEqual(result.returncode, 0, result.stderr)
        manifest, manifest_text = self.read_manifest(output)
        self.assertEqual(manifest["version"], 1)
        self.assertEqual(manifest["event"], {"slug": EVENT_SLUG, "title": EVENT_TITLE})
        accepted = manifest["accepted"]
        self.assertIsInstance(accepted, list)
        self.assertEqual([item["sourceName"] for item in accepted], [
            "alpha/ticket-a.png",
            "zeta/ticket-b.png",
        ])
        self.assertEqual(manifest["summary"], {
            "archiveEntries": 4,
            "accepted": 2,
            "duplicates": 0,
            "rejected": 1,
        })
        self.assertNotIn(payload_a, manifest_text)
        self.assertNotIn(payload_b, manifest_text)

        for item, payload in zip(accepted, (payload_a, payload_b), strict=True):
            self.assertEqual(set(item), {
                "sourceName", "normalizedFile", "imageSha256", "qrFingerprint", "width", "height",
            })
            normalized = output / item["normalizedFile"]
            self.assertTrue(normalized.is_file())
            self.assertLessEqual(normalized.stat().st_size, 2 * 1024 * 1024)
            self.assertEqual(hashlib.sha256(normalized.read_bytes()).hexdigest(), item["imageSha256"])
            expected_fingerprint = hmac.new(SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
            self.assertEqual(item["qrFingerprint"], expected_fingerprint)
            with Image.open(normalized) as image:
                self.assertEqual(image.format, "PNG")
                self.assertEqual(image.mode, "RGB")
                self.assertEqual(image.info, {})
                self.assertEqual(image.size, (item["width"], item["height"]))

        signed = {"version": 1, "event": manifest["event"], "accepted": accepted}
        canonical = json.dumps(signed, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
        expected_signature = hmac.new(SECRET.encode(), canonical, hashlib.sha256).hexdigest()
        self.assertEqual(manifest["manifestSignature"], expected_signature)
        with Image.open(output / manifest["contactSheet"]) as contact_sheet:
            self.assertEqual(contact_sheet.format, "PNG")
            self.assertGreater(contact_sheet.width, 0)
            self.assertGreater(contact_sheet.height, 0)
        self.assertEqual((output / ".gitignore").read_text(encoding="utf-8"), "*\n!.gitignore\n")
        self.assertEqual(stat.S_IMODE((output / ".gitignore").stat().st_mode), 0o600)
        self.assertEqual(stat.S_IMODE(output.stat().st_mode), 0o700)
        self.assert_no_staging(output)

    def test_exact_and_semantic_duplicates_are_not_accepted_twice(self) -> None:
        payload = "same-ticket-payload"
        exact = self.make_qr("exact.png", payload, 360, GREEN).read_bytes()
        visually_different = self.make_qr("semantic.png", payload, 520, GREEN).read_bytes()
        unique = self.make_qr("unique.png", "unique-ticket-payload", 400, YELLOW).read_bytes()
        archive = self.make_zip("duplicates.zip", [
            ("a.png", exact),
            ("b.png", exact),
            ("c.png", visually_different),
            ("d.png", unique),
        ])

        result, output = self.run_intake(archive)
        self.assertEqual(result.returncode, 0, result.stderr)
        manifest, text = self.read_manifest(output)
        self.assertEqual(manifest["summary"]["accepted"], 2)
        self.assertEqual(manifest["duplicates"], [
            {"sourceName": "b.png", "kind": "exact", "duplicateOf": "a.png"},
            {"sourceName": "c.png", "kind": "semantic", "duplicateOf": "a.png"},
        ])
        self.assertNotIn(payload, text)

    def test_traversal_is_rejected_before_any_output_is_published(self) -> None:
        qr = self.make_qr("valid.png", "traversal-test-ticket")
        archive = self.make_zip("traversal.zip", [
            ("valid.png", qr.read_bytes()),
            ("../escape.png", qr.read_bytes()),
        ])

        result, output = self.run_intake(archive)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("unsafe_archive_path", result.stderr)
        self.assertFalse(output.exists())
        self.assertFalse((self.work.parent / "escape.png").exists())
        self.assert_no_staging(output)

    def test_high_ratio_zip_bomb_is_rejected_during_preflight(self) -> None:
        archive = self.make_zip("bomb.zip", [("bomb.txt", b"0" * (2 * 1024 * 1024))])

        result, output = self.run_intake(archive)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("archive_compression_ratio", result.stderr)
        self.assertFalse(output.exists())
        self.assert_no_staging(output)

    def test_nested_archive_is_rejected_before_image_decoding(self) -> None:
        qr = self.make_qr("nested-valid.png", "nested-valid-ticket")
        archive = self.make_zip("nested.zip", [
            ("ticket.png", qr.read_bytes()),
            ("more-tickets.zip", b"PK\x03\x04nested"),
        ])

        result, output = self.run_intake(archive)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("nested_archive", result.stderr)
        self.assertFalse(output.exists())
        self.assert_no_staging(output)

    def test_corrupt_archive_and_corrupt_image_never_publish_partial_output(self) -> None:
        corrupt_archive = self.work / "corrupt.zip"
        corrupt_archive.write_bytes(b"PK\x03\x04not-a-real-central-directory")
        result, output = self.run_intake(corrupt_archive, "bad-archive-output")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("corrupt_archive", result.stderr)
        self.assertFalse(output.exists())
        self.assert_no_staging(output)

    def test_decoder_infrastructure_failure_aborts_the_whole_preview(self) -> None:
        valid = self.make_qr("a-valid.png", "valid-before-decoder-failure", 360, RED)
        broken = self.work / "z-decoder-failure.png"
        Image.new("RGB", (400, 400), (120, 120, 120)).save(broken, format="PNG")
        archive = self.make_zip("decoder-failure.zip", [
            ("a-valid.png", valid.read_bytes()),
            ("z-decoder-failure.png", broken.read_bytes()),
        ])

        result, output = self.run_intake(archive)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("qr_decoder_failed", result.stderr)
        self.assertFalse(output.exists())
        self.assert_no_staging(output)

        invalid_image_zip = self.make_zip("invalid-image.zip", [("ticket.png", b"not a png")])
        result, output = self.run_intake(invalid_image_zip, "bad-image-output")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("no_accepted_tickets", result.stderr)
        self.assertFalse(output.exists())
        self.assert_no_staging(output)

    def test_images_without_exactly_one_qr_are_rejected_without_leaking_payloads(self) -> None:
        valid_payload = "one-valid-ticket"
        left_payload = "ambiguous-left-ticket"
        right_payload = "ambiguous-right-ticket"
        valid = self.make_qr("valid.png", valid_payload, 360, CYAN)
        left = self.make_qr("left.png", left_payload, 320)
        right = self.make_qr("right.png", right_payload, 320)
        double = Image.new("RGB", (700, 340), "white")
        with Image.open(left) as image:
            double.paste(image.convert("RGB"), (10, 10))
        with Image.open(right) as image:
            double.paste(image.convert("RGB"), (370, 10))
        double_path = self.work / "double.png"
        ImageDraw.Draw(double).rectangle((0, 0, 40, 40), fill=MAGENTA)
        double.save(double_path, format="PNG")
        blank_path = self.work / "blank.png"
        Image.new("RGB", (400, 400), "white").save(blank_path, format="PNG")
        archive = self.make_zip("cardinality.zip", [
            ("blank.png", blank_path.read_bytes()),
            ("double.png", double_path.read_bytes()),
            ("valid.png", valid.read_bytes()),
        ])

        result, output = self.run_intake(archive)
        self.assertEqual(result.returncode, 0, result.stderr)
        manifest, text = self.read_manifest(output)
        self.assertEqual(manifest["summary"]["accepted"], 1)
        self.assertEqual(manifest["rejected"], [
            {"sourceName": "blank.png", "reason": "qr_not_found"},
            {"sourceName": "double.png", "reason": "multiple_qr_codes"},
        ])
        for payload in (valid_payload, left_payload, right_payload):
            self.assertNotIn(payload, text)

    def test_node_decoder_detects_zero_one_and_multiple_qrs(self) -> None:
        single_payload = "node-decoder-single-ticket"
        left_payload = "node-decoder-left-ticket"
        right_payload = "node-decoder-right-ticket"
        single = self.make_qr("node-single.png", single_payload, 420)
        left = self.make_qr("node-left.png", left_payload, 320)
        right = self.make_qr("node-right.png", right_payload, 320)

        double = Image.new("RGB", (700, 340), "white")
        with Image.open(left) as image:
            double.paste(image.convert("RGB"), (10, 10))
        with Image.open(right) as image:
            double.paste(image.convert("RGB"), (370, 10))
        double_path = self.work / "node-double.png"
        double.save(double_path, format="PNG")
        blank_path = self.work / "node-blank.png"
        Image.new("RGB", (400, 400), "white").save(blank_path, format="PNG")
        oversized_path = self.work / "node-oversized.png"
        Image.new("RGB", (4097, 1), "white").save(oversized_path, format="PNG")

        cases = [
            (single, 0, {"count": 1, "payload": single_payload}),
            (blank_path, 2, {"count": 0}),
            (double_path, 2, {"count": 2}),
            (oversized_path, 3, {"count": 0, "error": "decode_failed"}),
        ]
        for image_path, expected_status, expected_body in cases:
            with self.subTest(image=image_path.name):
                result = subprocess.run(
                    [str(NODE_DECODER), str(image_path)],
                    cwd=ROOT,
                    text=True,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    timeout=30,
                    check=False,
                    env={key: value for key, value in os.environ.items() if key != SECRET_ENV},
                )
                self.assertEqual(result.returncode, expected_status, result.stderr)
                self.assertEqual(json.loads(result.stdout), expected_body)
                self.assertEqual(result.stderr, "")

    def test_default_decoder_builds_a_real_archive_preview(self) -> None:
        payload = "default-node-decoder-ticket"
        qr = self.make_qr("default-node.png", payload, 420)
        archive = self.make_zip("default-node.zip", [("ticket.png", qr.read_bytes())])

        result, output = self.run_intake_with_default_decoder(archive)
        self.assertEqual(result.returncode, 0, result.stderr)
        manifest, manifest_text = self.read_manifest(output)
        self.assertEqual(manifest["summary"]["accepted"], 1)
        self.assertEqual(
            manifest["accepted"][0]["qrFingerprint"],
            hmac.new(SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest(),
        )
        self.assertNotIn(payload, manifest_text)

    def test_typescript_preview_wrapper_builds_the_review_artifacts_without_remote_writes(self) -> None:
        payload = "typescript-wrapper-preview-ticket"
        qr = self.make_qr("wrapper.png", payload, 420)
        archive = self.make_zip("wrapper.zip", [("ticket.png", qr.read_bytes())])
        output = self.work / "wrapper-preview"
        environment = dict(os.environ)
        environment[SECRET_ENV] = SECRET

        result = subprocess.run(
            [
                "node",
                "--import",
                "tsx",
                str(IMPORT_SCRIPT),
                "preview",
                "--zip",
                str(archive),
                "--out",
                str(output),
            ],
            cwd=ROOT,
            env=environment,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=120,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        manifest, manifest_text = self.read_manifest(output)
        self.assertEqual(manifest["event"], {"slug": "labitconf", "title": "LaBitConf"})
        self.assertEqual(manifest["summary"]["accepted"], 1)
        self.assertTrue((output / manifest["contactSheet"]).is_file())
        self.assertNotIn(payload, manifest_text)

    def test_large_png_is_reduced_below_email_limit_and_qr_is_revalidated(self) -> None:
        payload = "large-image-ticket"
        qr_path = self.make_qr("overlay.png", payload, 620, ORANGE)
        random_bytes = random.Random(7).randbytes(1400 * 1400 * 3)
        noisy = Image.frombytes("RGB", (1400, 1400), random_bytes)
        with Image.open(qr_path) as qr:
            noisy.paste(qr.convert("RGB"), (390, 390))
        ImageDraw.Draw(noisy).rectangle((0, 0, 120, 120), fill=ORANGE)
        large_path = self.work / "large.png"
        noisy.save(large_path, format="PNG", compress_level=1)
        self.assertGreater(large_path.stat().st_size, 2 * 1024 * 1024)
        archive = self.make_zip("large.zip", [("large.png", large_path.read_bytes())], compression=zipfile.ZIP_STORED)

        result, output = self.run_intake(archive)
        self.assertEqual(result.returncode, 0, result.stderr)
        manifest, _ = self.read_manifest(output)
        item = manifest["accepted"][0]
        normalized = output / item["normalizedFile"]
        self.assertLessEqual(normalized.stat().st_size, 2 * 1024 * 1024)
        self.assertGreaterEqual(max(item["width"], item["height"]), 800)
        self.assertLess(max(item["width"], item["height"]), 1400)
        expected = hmac.new(SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
        self.assertEqual(item["qrFingerprint"], expected)


if __name__ == "__main__":
    unittest.main(verbosity=2)
