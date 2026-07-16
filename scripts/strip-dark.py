#!/usr/bin/env python3
"""
Strip all `dark:...` Tailwind class variants from className strings.
Light is the default; dark variants become dead code.
"""
import re
import sys
from pathlib import Path

# Match: dark: followed by Tailwind utility chars (including colons for modifiers)
# Stops at whitespace, quote, or end-of-className.
DARK_RE = re.compile(r'\bdark:[A-Za-z0-9_:\-\/\[\]%.]+')

def strip_dark(s: str) -> str:
    """Remove dark:... tokens from a className string. Clean up extra whitespace."""
    # Remove the dark: token
    out = DARK_RE.sub('', s)
    # Collapse 2+ spaces into 1
    out = re.sub(r'  +', ' ', out)
    # Remove space right after quote/space at the start
    out = re.sub(r'"\s+', '"', out)
    out = re.sub(r"'\s+", "'", out)
    # Remove space right before quote at end
    out = re.sub(r'\s+"', '"', out)
    out = re.sub(r"\s+'", "'", out)
    return out

def process_file(path: Path) -> int:
    src = path.read_text(encoding='utf-8')
    new = strip_dark(src)
    if new != src:
        path.write_text(new, encoding='utf-8')
        return 1
    return 0

def main():
    root = Path('src')
    changed = 0
    files = 0
    for p in root.rglob('*'):
        if p.suffix not in ('.tsx', '.ts', '.css'):
            continue
        if process_file(p):
            changed += 1
        files += 1
    print(f'Processed {files} files, changed {changed}')

if __name__ == '__main__':
    main()
