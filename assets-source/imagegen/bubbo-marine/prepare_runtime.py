"""Prepare five reviewed RGBA exports for Bubbo without writing to a repository.

Input paths are resolved against the input JSON. The output must not exist.
This checks recorded provenance; human review still owns origin/usage approval.
No generation, resize, cropping, compositing, upload or runtime selection occurs.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path

from PIL import Image

KEYS = ("mint", "amber", "coral", "sky", "berry")
BASELINE_BYTES = {"mint": 92756, "amber": 96904, "coral": 86504, "sky": 83582, "berry": 88912}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def prepare(manifest_path, output_path):
    manifest_path, output_path = Path(manifest_path).resolve(), Path(output_path).resolve()
    if output_path.exists():
        raise ValueError("Output must be a new isolated directory")
    data = json.loads(manifest_path.read_text())
    entries = data.get("tokens", [])
    if len(entries) != 5 or {entry.get("key") for entry in entries} != set(KEYS):
        raise ValueError("Exactly the five stable Bubbo color IDs are required")
    prepared, seen_sources = [], set()
    for key in KEYS:
        entry = next(item for item in entries if item["key"] == key)
        for field in ("originReference", "reviewReference", "sourceSha256", "exportSha256"):
            if not isinstance(entry.get(field), str) or not entry[field].strip():
                raise ValueError(f"{key}: missing {field}")
        source_path = (manifest_path.parent / entry["source"]).resolve()
        export_path = (manifest_path.parent / entry["export"]).resolve()
        if source_path in seen_sources:
            raise ValueError("Each token requires its own source asset, not a shared sheet")
        seen_sources.add(source_path)
        source, exported = source_path.read_bytes(), export_path.read_bytes()
        if sha(source) != entry["sourceSha256"] or sha(exported) != entry["exportSha256"]:
            raise ValueError(f"{key}: source/export hash changed since review")
        with Image.open(io.BytesIO(exported)) as image:
            if image.format != "PNG" or image.mode != "RGBA" or image.size != (320, 320) or getattr(image, "n_frames", 1) != 1:
                raise ValueError(f"{key}: expected one reviewed 320x320 RGBA PNG export")
            rgba = image.tobytes()
            alpha = image.getchannel("A")
            if alpha.getbbox() is None or alpha.getextrema()[0] != 0:
                raise ValueError(f"{key}: token must contain visible art and transparency")
            edge = [*alpha.crop((0, 0, 320, 1)).tobytes(), *alpha.crop((0, 319, 320, 320)).tobytes(),
                    *alpha.crop((0, 0, 1, 320)).tobytes(), *alpha.crop((319, 0, 320, 320)).tobytes()]
            if any(edge):
                raise ValueError(f"{key}: clipped/nontransparent outside border")
            encoded = io.BytesIO()
            profile = image.info.get("icc_profile", b"")
            image.save(encoded, format="WEBP", lossless=True, exact=True, method=6, quality=100, icc_profile=profile)
            webp = encoded.getvalue()
            bbox = list(alpha.getbbox())
        with Image.open(io.BytesIO(webp)) as decoded:
            decoded_rgba = decoded.convert("RGBA").tobytes()
            if decoded.size != (320, 320) or decoded_rgba != rgba:
                raise ValueError(f"{key}: WebP round trip changed RGBA, including transparent pixels")
            if decoded.info.get("icc_profile", b"") != profile:
                raise ValueError(f"{key}: color profile changed")
        prepared.append((key, source_path, source, exported, webp, {
            "game": "bubbo", "key": key, "path": f"/games/bubbo-v2/{key}.webp",
            "bytes": len(webp), "sha256": sha(webp), "width": 320, "height": 320,
            "sourceSha256": sha(source), "exportSha256": sha(exported), "rgbaSha256": sha(rgba),
            "decodedRgbaSha256": sha(decoded_rgba), "rgbaBytesCompared": len(rgba), "rgbaChangedBytes": 0,
            "alphaBounds": bbox, "iccSha256": sha(profile) if profile else None,
            "sourceBytes": len(source), "exportPngBytes": len(exported), "baselineWebpBytes": BASELINE_BYTES[key],
            "largerThanExportPng": len(webp) > len(exported), "largerThanBaselineToken": len(webp) > BASELINE_BYTES[key],
            "originReference": entry["originReference"], "reviewReference": entry["reviewReference"],
            "reviewNote": "Metadata records declared provenance; it does not independently establish rights or visual approval.",
        }))
    # Validate the entire set before creating any output files.
    output_path.mkdir(parents=True)
    for key, source_path, source, exported, webp, row in prepared:
        checkpoint = output_path / "source-checkpoint" / key
        checkpoint.mkdir(parents=True)
        (checkpoint / ("source" + source_path.suffix)).write_bytes(source)
        (checkpoint / "runtime-rgba.png").write_bytes(exported)
        runtime = output_path / "runtime" / f"{key}.webp"
        runtime.parent.mkdir(exist_ok=True)
        runtime.write_bytes(webp)
    rows = [item[-1] for item in prepared]
    result = {
        "status": "prepared_for_review_not_integrated", "tokens": rows,
        "totalRuntimeBytes": sum(row["bytes"] for row in rows),
        "baselineTokenBytes": sum(BASELINE_BYTES.values()),
        "rgbaBytesCompared": sum(row["rgbaBytesCompared"] for row in rows),
        "rgbaChangedBytes": 0,
        "largerThanExportPng": [row["key"] for row in rows if row["largerThanExportPng"]],
        "largerThanBaselineToken": [row["key"] for row in rows if row["largerThanBaselineToken"]],
    }
    (output_path / "asset-manifest.json").write_text(json.dumps(result, indent=2) + "\n")
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest")
    parser.add_argument("output")
    arguments = parser.parse_args()
    print(json.dumps(prepare(arguments.manifest, arguments.output), indent=2))
