#!/usr/bin/env python3
"""Generate icns/ico from build/appicon.png.

macOS `iconutil` rejects some PNGs in this sandboxed environment (returns
"Invalid Iconset" silently), so we build the icns container by hand from
Pillow-produced RGBA PNGs. The resulting icns covers 16/32/64/128/256/512/1024
using Apple's documented type codes (icp4..ic14).
"""

import io
import struct
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent
PNG = ROOT / "appicon.png"
ICNS = ROOT / "appicon.icns"
APP_ICNS = ROOT / "bin" / "SimpleMCP.app" / "Contents" / "Resources" / "iconfile.icns"
ICO = ROOT / "windows" / "icon.ico"

# (pixel_size, icns_type_code)
ICNS_SPEC = [
    (16, "icp4"),
    (32, "icp5"),
    (64, "icp6"),
    (128, "ic07"),
    (256, "ic08"),
    (512, "ic09"),
    (1024, "ic10"),
    (256, "ic11"),
    (512, "ic12"),
    (1024, "ic13"),
    (1024, "ic14"),
]


def png_at(src: Image.Image, size: int) -> bytes:
    buf = io.BytesIO()
    src.resize((size, size), Image.LANCZOS).save(buf, "PNG", optimize=True)
    return buf.getvalue()


def write_icns(src: Image.Image, path: Path) -> None:
    seen = set()
    chunks = bytearray()
    for size, code in ICNS_SPEC:
        if size in seen:
            continue
        seen.add(size)
        data = png_at(src, size)
        chunks += code.encode("ascii")
        chunks += struct.pack(">I", 8 + len(data))
        chunks += data
    body = b"icns" + struct.pack(">I", 8 + len(chunks)) + chunks
    path.write_bytes(body)


def write_ico(src: Image.Image, path: Path) -> None:
    sizes = [16, 24, 32, 48, 64, 128, 256]
    images = [(s, png_at(src, s)) for s in sizes]
    header = struct.pack("<HHH", 0, 1, len(images))
    out = bytearray(header)
    offset = 6 + 16 * len(images)
    entry = bytearray()
    for size, data in images:
        w = size if size < 256 else 0
        h = size if size < 256 else 0
        entry += struct.pack("<BBBBHHII", w, h, 0, 0, 1, 32, len(data), offset)
        offset += len(data)
    out += entry
    for _, data in images:
        out += data
    path.write_bytes(out)


def main() -> int:
    if not PNG.exists():
        print(f"missing {PNG}", file=sys.stderr)
        return 1
    src = Image.open(PNG).convert("RGBA")
    write_icns(src, ICNS)
    print(f"wrote {ICNS} ({ICNS.stat().st_size} bytes)")
    if APP_ICNS.parent.exists():
        write_icns(src, APP_ICNS)
        print(f"wrote {APP_ICNS} ({APP_ICNS.stat().st_size} bytes)")
    write_ico(src, ICO)
    print(f"wrote {ICO} ({ICO.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())