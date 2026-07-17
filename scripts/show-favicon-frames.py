"""Render the favicon at standard sizes for visual verification."""
from PIL import Image
from pathlib import Path

ICO = Path("/Users/Zhuanz/Documents/project/creatra/src/app/favicon.ico")
OUT = Path("/tmp/vp-audit/logo-v1")
OUT.mkdir(parents=True, exist_ok=True)

# Open the multi-size ICO and extract each frame
img = Image.open(ICO)
print(f"ICO size: {img.size}, mode: {img.mode}")
print(f"ICO info: {img.info}")

# Save each frame at its native size
sizes = []
i = 0
while True:
    try:
        img.seek(i)
        frame = img.copy()
        sizes.append(frame.size)
        out = OUT / f"favicon-frame-{i}-{frame.size[0]}x{frame.size[1]}.png"
        frame.save(out)
        print(f"  frame {i}: {frame.size} → {out.name}")
        i += 1
    except EOFError:
        break

# Build a comparison strip: 16, 32, 48, 64 side by side at 4x scale
strip = Image.new("RGBA", (sum(s*4 for s in [16, 32, 48, 64]) + 60, max(64*4, 16*4) + 40), (255, 255, 255, 255))
x = 10
for size, label in [(16, "16"), (32, "32"), (48, "48"), (64, "64")]:
    img = Image.open(ICO)
    # find the right size frame
    for i in range(10):
        try:
            img.seek(i)
            if img.size == (size, size):
                break
        except EOFError:
            pass
    scaled = img.copy().resize((size*4, size*4), Image.NEAREST)
    strip.paste(scaled, (x, 20))
    x += size*4 + 20

strip.save(OUT / "favicon-strip.png")
print(f"✓ favicon-strip.png")
