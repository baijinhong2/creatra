"""Generate creatra favicon assets from icon.svg.

- src/app/icon.svg is the master SVG (used by in-app <img> + modern browsers)
- src/app/apple-icon.png is the iOS touch icon (180x180)
- src/app/favicon.ico is the legacy multi-size ICO (16/32/48/64) — takes precedence
  over icon.svg in browsers, so we MUST update it for the new design to show.
"""
import subprocess
import tempfile
from pathlib import Path
from PIL import Image

ROOT = Path("/Users/Zhuanz/Documents/project/creatra")
SVG = ROOT / "src/app/icon.svg"
APPLE = ROOT / "src/app/apple-icon.png"
ICO = ROOT / "src/app/favicon.ico"

# Sizes: favicon legacy + apple touch + various displays
FAVICON_SIZES = [16, 32, 48, 64, 128, 256]
APPLE_SIZE = 180


def sips_to_png(svg: Path, size: int, out: Path) -> Path:
    """Use macOS sips to rasterize SVG → PNG at a given size."""
    subprocess.run(
        ["sips", "-s", "format", "png", "-Z", str(size), str(svg), "--out", str(out)],
        check=True,
        capture_output=True,
    )
    return out


def main():
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)

        # Apple touch icon: 180x180
        sips_to_png(SVG, APPLE_SIZE, tmp / f"apple-{APPLE_SIZE}.png")
        apple_png = tmp / f"apple-{APPLE_SIZE}.png"
        # Replace any existing apple-icon
        APPLE.write_bytes(apple_png.read_bytes())
        print(f"✓ apple-icon.png ({APPLE_SIZE}x{APPLE_SIZE}) — {APPLE.stat().st_size} bytes")

        # Favicon ICO: 16/32/48/64 (NO 128/256 — per memory, mixing sizes breaks ICO)
        ico_sizes = [16, 32, 48, 64]
        ico_frames = []
        for s in ico_sizes:
            png = sips_to_png(SVG, s, tmp / f"fav-{s}.png")
            ico_frames.append(Image.open(png).convert("RGBA"))
            print(f"  rendered {s}x{s} → {png.stat().st_size} bytes")

        # Save as multi-size ICO (per memory: sizes=[(s,s) for s in [...]] ONLY,
        # do NOT combine with append_images)
        with tempfile.NamedTemporaryFile(suffix=".ico", delete=False) as tmp_ico:
            ico_path = Path(tmp_ico.name)
        # Use the largest frame as the base (Pillow will downscale into the ICO)
        base = ico_frames[-1]  # 64x64
        base.save(
            ico_path,
            format="ICO",
            sizes=[(s, s) for s in ico_sizes],
        )
        ICO.write_bytes(ico_path.read_bytes())
        print(f"✓ favicon.ico ({ico_sizes}) — {ICO.stat().st_size} bytes")

    # Verify
    import hashlib
    h = hashlib.md5(ICO.read_bytes()).hexdigest()
    print(f"  md5: {h}")


if __name__ == "__main__":
    main()
