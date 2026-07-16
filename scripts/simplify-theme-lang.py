#!/usr/bin/env python3
"""
Phase 2 simplifications:
- t(lang, 'key') -> t('key')  (also 3-arg form)
- t(lang, 'key', params) -> t('key', params)
- theme === 'dark' ? A : B -> B   (drop the dark branch, keep light)
- theme === 'light' ? A : B -> A
- lang === 'en' ? A : B -> B       (drop the en branch, keep zh)
- lang === 'zh' ? A : B -> A
"""
import re
import sys
from pathlib import Path

# ── 1. t(lang, ...) → t(...) ────────────────────────────────
# Match: t(lang, 'X' or "X", optional 3rd arg)
# Use a non-greedy match for the key, then optional comma+args
T_LANG_RE = re.compile(r'\bt\(\s*lang\s*,\s*([\'"])([^\'"]+)\1(\s*,[^)]*)?\)')

def replace_t_lang(text: str) -> str:
    def repl(m: re.Match) -> str:
        _quote = m.group(1)
        key = m.group(2)
        rest = m.group(3) or ''
        return f"t('{key}'{rest})"
    return T_LANG_RE.sub(repl, text)

# ── 2. theme === 'dark' ? X : Y → Y (ternary) ─────────────
# Support: theme === 'dark' ? 'A' : 'B'  (strings)
#          theme === 'dark' ? exprA : exprB (idents/expressions)
# Strategy: match "theme === 'dark' ? <balanced> : <balanced>" recursively
# Use a manual parser since regex is fragile for nested parens.

def find_matching(text: str, start: int, open_ch: str, close_ch: str) -> int:
    """Find index of matching close char, accounting for nesting."""
    depth = 1
    i = start
    in_str = None  # quote char if inside string
    while i < len(text):
        c = text[i]
        if in_str:
            if c == '\\':
                i += 2
                continue
            if c == in_str:
                in_str = None
        else:
            if c in ('"', "'", '`'):
                in_str = c
            elif c == open_ch:
                depth += 1
            elif c == close_ch:
                depth -= 1
                if depth == 0:
                    return i
        i += 1
    return -1

def replace_theme_ternary(text: str) -> str:
    """theme === 'dark' ? A : B -> B
       theme === 'light' ? A : B -> A
    """
    out = []
    i = 0
    n = len(text)
    while i < n:
        # Look for: theme === 'dark'  or  theme === 'light'
        # Allow any whitespace
        m = re.match(r"theme\s*===\s*'(dark|light)'", text[i:])
        if not m:
            out.append(text[i])
            i += 1
            continue
        variant = m.group(1)  # 'dark' or 'light'
        j = i + m.end()
        # Skip whitespace
        while j < n and text[j] in ' \t':
            j += 1
        if j >= n or text[j] != '?':
            out.append(text[i])
            i += 1
            continue
        # Parse the TRUE branch
        k = j + 1
        while k < n and text[k] in ' \t':
            k += 1
        # Find end of true-branch (must end with ':' at paren depth 0)
        branch_start = k
        depth_paren = 0
        depth_bracket = 0
        depth_brace = 0
        in_str = None
        colon_pos = -1
        while k < n:
            c = text[k]
            if in_str:
                if c == '\\':
                    k += 2
                    continue
                if c == in_str:
                    in_str = None
                k += 1
                continue
            if c in ('"', "'", '`'):
                in_str = c
            elif c == '(':
                depth_paren += 1
            elif c == ')':
                depth_paren -= 1
            elif c == '[':
                depth_bracket += 1
            elif c == ']':
                depth_bracket -= 1
            elif c == '{':
                depth_brace += 1
            elif c == '}':
                depth_brace -= 1
            elif c == ':' and depth_paren == 0 and depth_bracket == 0 and depth_brace == 0:
                colon_pos = k
                break
            k += 1
        if colon_pos < 0:
            out.append(text[i])
            i += 1
            continue
        # Find end of false-branch (match parens)
        false_start = colon_pos + 1
        while false_start < n and text[false_start] in ' \t':
            false_start += 1
        k2 = false_start
        # We need to find the end of the false-branch.
        # It can be: end of statement (;) , end of line, end of ) of enclosing paren, end of } of enclosing jsx, comma
        # Strategy: walk forward tracking depth. Stop at first unmatched , ; or ) at outer depth 0.
        depth_paren = 0
        depth_bracket = 0
        depth_brace = 0
        in_str = None
        while k2 < n:
            c = text[k2]
            if in_str:
                if c == '\\':
                    k2 += 2
                    continue
                if c == in_str:
                    in_str = None
                k2 += 1
                continue
            if c in ('"', "'", '`'):
                in_str = c
            elif c == '(':
                depth_paren += 1
            elif c == ')':
                if depth_paren == 0 and depth_bracket == 0 and depth_brace == 0:
                    break
                depth_paren -= 1
            elif c == '[':
                depth_bracket += 1
            elif c == ']':
                depth_bracket -= 1
            elif c == '{':
                depth_brace += 1
            elif c == '}':
                if depth_paren == 0 and depth_bracket == 0 and depth_brace == 0:
                    break
                depth_brace -= 1
            elif c == ',' and depth_paren == 0 and depth_bracket == 0 and depth_brace == 0:
                break
            elif c == ';' and depth_paren == 0 and depth_bracket == 0 and depth_brace == 0:
                break
            elif c == '\n' and depth_paren == 0 and depth_bracket == 0 and depth_brace == 0:
                # could be end of line — but JSX attributes span lines, so only stop if not in JSX
                # For now: treat newline as part of expression (most ternary fits on one line anyway)
                pass
            k2 += 1
        false_end = k2
        # Get the chosen branch
        if variant == 'dark':
            chosen = text[false_start:false_end].strip()
        else:
            chosen = text[branch_start:colon_pos].strip()
        out.append(chosen)
        i = false_end
    return ''.join(out)

def replace_lang_ternary(text: str) -> str:
    """lang === 'en' ? A : B -> B  (drop en branch)
       lang === 'zh' ? A : B -> A
    """
    out = []
    i = 0
    n = len(text)
    while i < n:
        m = re.match(r"lang\s*===\s*'(en|zh)'", text[i:])
        if not m:
            out.append(text[i])
            i += 1
            continue
        variant = m.group(1)
        j = i + m.end()
        while j < n and text[j] in ' \t':
            j += 1
        if j >= n or text[j] != '?':
            out.append(text[i])
            i += 1
            continue
        k = j + 1
        while k < n and text[k] in ' \t':
            k += 1
        branch_start = k
        depth_paren = depth_bracket = depth_brace = 0
        in_str = None
        colon_pos = -1
        while k < n:
            c = text[k]
            if in_str:
                if c == '\\':
                    k += 2; continue
                if c == in_str:
                    in_str = None
                k += 1; continue
            if c in ('"', "'", '`'):
                in_str = c
            elif c == '(': depth_paren += 1
            elif c == ')': depth_paren -= 1
            elif c == '[': depth_bracket += 1
            elif c == ']': depth_bracket -= 1
            elif c == '{': depth_brace += 1
            elif c == '}': depth_brace -= 1
            elif c == ':' and depth_paren == 0 and depth_bracket == 0 and depth_brace == 0:
                colon_pos = k
                break
            k += 1
        if colon_pos < 0:
            out.append(text[i])
            i += 1
            continue
        false_start = colon_pos + 1
        while false_start < n and text[false_start] in ' \t':
            false_start += 1
        k2 = false_start
        depth_paren = depth_bracket = depth_brace = 0
        in_str = None
        while k2 < n:
            c = text[k2]
            if in_str:
                if c == '\\':
                    k2 += 2; continue
                if c == in_str:
                    in_str = None
                k2 += 1; continue
            if c in ('"', "'", '`'):
                in_str = c
            elif c == '(': depth_paren += 1
            elif c == ')':
                if depth_paren == 0 and depth_bracket == 0 and depth_brace == 0:
                    break
                depth_paren -= 1
            elif c == '[': depth_bracket += 1
            elif c == ']': depth_bracket -= 1
            elif c == '{': depth_brace += 1
            elif c == '}':
                if depth_paren == 0 and depth_bracket == 0 and depth_brace == 0:
                    break
                depth_brace -= 1
            elif c == ',' and depth_paren == 0 and depth_bracket == 0 and depth_brace == 0:
                break
            elif c == ';' and depth_paren == 0 and depth_bracket == 0 and depth_brace == 0:
                break
            k2 += 1
        false_end = k2
        if variant == 'en':
            chosen = text[false_start:false_end].strip()
        else:
            chosen = text[branch_start:colon_pos].strip()
        out.append(chosen)
        i = false_end
    return ''.join(out)

def process_file(path: Path) -> int:
    src = path.read_text(encoding='utf-8')
    new = src
    new = replace_t_lang(new)
    new = replace_theme_ternary(new)
    new = replace_lang_ternary(new)
    if new != src:
        path.write_text(new, encoding='utf-8')
        return 1
    return 0

def main():
    root = Path('src')
    changed = 0
    files = 0
    for p in root.rglob('*'):
        if p.suffix not in ('.tsx', '.ts'):
            continue
        if process_file(p):
            changed += 1
        files += 1
    print(f'Processed {files} files, changed {changed}')

if __name__ == '__main__':
    main()
