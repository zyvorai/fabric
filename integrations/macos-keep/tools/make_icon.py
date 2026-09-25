#!/usr/bin/env python3
"""Draws the Solvor app icon and the menu-bar glyph, and writes the asset catalogue.

The mark is Zyvor's: a white Z stroke (the path from website/static/img/favicon.svg) on the Zyvor orange gradient, here inside a sealed
"cell" frame with a seal latch. Needs rsvg-convert (brew install librsvg). Run from anywhere; writes Resources/Assets.xcassets and
docs/assets/keep/solvor-icon.png.
"""
import json, os, subprocess, sys

here = os.path.dirname(os.path.abspath(__file__))
root = os.path.join(here, "..")
assets = os.path.join(root, "Resources", "Assets.xcassets")
docs_png = os.path.join(root, "..", "..", "docs", "assets", "keep", "solvor-icon.png")

# The Z from the Zyvor favicon (64-unit box), mapped to the 1024 canvas.
Z = [(18.5, 20.5), (45.5, 20.5), (18.5, 43.5), (45.5, 43.5)]
K = 9.6
def zpath(k=K, cx=512, cy=512, ox=0, oy=0):
    pts = [(cx + (x - 32) * k + ox, cy + (y - 32) * k + oy) for x, y in Z]
    return "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in pts)

def icon_svg():
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <linearGradient id="bg" x1="150" y1="110" x2="880" y2="930" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#ff7a3d"/><stop offset="0.55" stop-color="#ff5a15"/><stop offset="1" stop-color="#c9440a"/>
    </linearGradient>
    <radialGradient id="glow" cx="30%" cy="18%" r="75%">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.34"/><stop offset="0.55" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="edge" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.55"/><stop offset="1" stop-color="#ffffff" stop-opacity="0.05"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="22" stdDeviation="26" flood-color="#5a1a00" flood-opacity="0.38"/>
    </filter>
    <filter id="zshadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="8" stdDeviation="9" flood-color="#7a2400" flood-opacity="0.35"/>
    </filter>
  </defs>
  <rect x="100" y="100" width="824" height="824" rx="188" fill="url(#bg)" filter="url(#shadow)"/>
  <rect x="100" y="100" width="824" height="824" rx="188" fill="url(#glow)"/>
  <rect x="103" y="103" width="818" height="818" rx="185" fill="none" stroke="url(#edge)" stroke-width="6"/>
  <!-- the sealed cell -->
  <rect x="262" y="262" width="500" height="500" rx="108" fill="#ffffff" fill-opacity="0.10" stroke="#ffffff" stroke-opacity="0.42" stroke-width="26"/>
  <!-- the Zyvor Z -->
  <path d="{zpath()}" fill="none" stroke="#ffffff" stroke-width="{8.3 * K:.1f}" stroke-linecap="round" stroke-linejoin="round" filter="url(#zshadow)"/>
  <!-- the seal latch -->
  <rect x="452" y="238" width="120" height="48" rx="24" fill="#ffffff"/>
  <circle cx="512" cy="262" r="9" fill="#ff5a15"/>
</svg>
'''

def glyph_svg():
    """Monochrome, for the menu bar (template image): the cell frame and the Z."""
    k = 9.0
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <rect x="140" y="140" width="744" height="744" rx="170" fill="none" stroke="#000" stroke-width="70"/>
  <path d="{zpath(k)}" fill="none" stroke="#000" stroke-width="{8.3 * k:.1f}" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="452" y="96" width="120" height="90" rx="30" fill="#000"/>
</svg>
'''

def render(svg_text, size, out):
    os.makedirs(os.path.dirname(out), exist_ok=True)
    p = subprocess.run(["rsvg-convert", "-w", str(size), "-h", str(size), "-o", out], input=svg_text.encode(), capture_output=True)
    if p.returncode != 0:
        sys.exit(p.stderr.decode())

def write_json(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, "w").write(json.dumps(obj, indent=2) + "\n")

svg = icon_svg()
open(os.path.join(here, "icon.svg"), "w").write(svg)
open(os.path.join(here, "glyph.svg"), "w").write(glyph_svg())

# App icon: macOS wants 16, 32, 128, 256, 512 at 1x and 2x.
iconset = os.path.join(assets, "AppIcon.appiconset")
images = []
for base in (16, 32, 128, 256, 512):
    for scale in (1, 2):
        name = f"icon_{base}x{base}{'@2x' if scale == 2 else ''}.png"
        render(svg, base * scale, os.path.join(iconset, name))
        images.append({"idiom": "mac", "size": f"{base}x{base}", "scale": f"{scale}x", "filename": name})
write_json(os.path.join(iconset, "Contents.json"), {"images": images, "info": {"version": 1, "author": "xcode"}})

# Menu-bar glyph as a template image.
glyph = os.path.join(assets, "MenuBarGlyph.imageset")
files = []
for scale in (1, 2, 3):
    name = f"glyph@{scale}x.png"
    render(glyph_svg(), 18 * scale, os.path.join(glyph, name))
    files.append({"idiom": "universal", "scale": f"{scale}x", "filename": name})
write_json(os.path.join(glyph, "Contents.json"), {"images": files, "info": {"version": 1, "author": "xcode"}, "properties": {"template-rendering-intent": "template"}})

# The Z mark alone, for the in-app logo where a bitmap is wanted, and a docs image.
write_json(os.path.join(assets, "Contents.json"), {"info": {"version": 1, "author": "xcode"}})
render(svg, 512, docs_png)
render(svg, 1024, "/tmp/solvor-icon-1024.png")
print("icon written:", os.path.relpath(iconset), "and", os.path.relpath(glyph))
