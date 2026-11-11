#!/usr/bin/env python3
"""Render the three icon directions for AmitAI and build one contact sheet.

Everything is vector: the SVG is the source of truth, cairosvg rasterises it at
any size, so the launcher icons, the adaptive-icon foreground and the splash
logo all come from the same geometry.
"""
import cairosvg
import os

HERE = os.path.dirname(os.path.abspath(__file__))

# --- A: spark pair (AI convention: ChatGPT's knot, Gemini's sparkle) ----------
SPARK_A = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="g" x1="0.1" y1="0" x2="0.9" y2="1">
      <stop offset="0" stop-color="#a5b4ff"/>
      <stop offset="0.5" stop-color="#6366f1"/>
      <stop offset="1" stop-color="#10b981"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.44" r="0.58">
      <stop offset="0" stop-color="#6366f1" stop-opacity="0.34"/>
      <stop offset="1" stop-color="#6366f1" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1024" height="1024" fill="#0a0a12"/>
  <rect width="1024" height="1024" fill="url(#glow)"/>
  <g transform="translate(492,540)">
    <path d="M0,-252 Q28,-28 252,0 Q28,28 0,252 Q-28,28 -252,0 Q-28,-28 0,-252 Z" fill="url(#g)"/>
  </g>
  <g transform="translate(752,272)">
    <path d="M0,-96 Q11,-11 96,0 Q11,11 0,96 Q-11,11 -96,0 Q-11,-11 0,-96 Z" fill="#34d399" opacity="0.92"/>
  </g>
</svg>"""

# --- B: geometric monogram A ------------------------------------------------
MONO_B = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0" stop-color="#141428"/>
      <stop offset="1" stop-color="#07070d"/>
    </linearGradient>
    <linearGradient id="ink" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#c7cbff"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.3" r="0.6">
      <stop offset="0" stop-color="#6366f1" stop-opacity="0.28"/>
      <stop offset="1" stop-color="#6366f1" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#bg)"/>
  <rect width="1024" height="1024" fill="url(#glow)"/>
  <g fill="none" stroke="url(#ink)" stroke-width="74" stroke-linecap="round" stroke-linejoin="round">
    <path d="M322 716 L512 320 L702 716"/>
    <path d="M398 596 L626 596"/>
  </g>
  <circle cx="512" cy="320" r="46" fill="#10b981"/>
</svg>"""

# --- C: core with two orbits -----------------------------------------------
CORE_C = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="orb" x1="0.1" y1="0.1" x2="0.9" y2="0.9">
      <stop offset="0" stop-color="#8f9bff"/>
      <stop offset="0.55" stop-color="#6366f1"/>
      <stop offset="1" stop-color="#10b981"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.52">
      <stop offset="0" stop-color="#6366f1" stop-opacity="0.3"/>
      <stop offset="1" stop-color="#6366f1" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1024" height="1024" fill="#08080f"/>
  <rect width="1024" height="1024" fill="url(#glow)"/>
  <g fill="none" stroke="url(#orb)" stroke-width="40" opacity="0.85">
    <ellipse cx="512" cy="512" rx="318" ry="128" transform="rotate(-28 512 512)"/>
    <ellipse cx="512" cy="512" rx="318" ry="128" transform="rotate(28 512 512)"/>
  </g>
  <circle cx="512" cy="512" r="118" fill="url(#orb)"/>
  <circle cx="512" cy="512" r="118" fill="none" stroke="#ffffff" stroke-opacity="0.18" stroke-width="6"/>
</svg>"""

CANDS = [("A-spark", SPARK_A), ("B-monogram", MONO_B), ("C-core", CORE_C)]


def squircle(svg: str, size: int) -> str:
    """Wrap the art in the squircle mask Android/Play show, for preview only."""
    inner = svg.replace("<svg ", '<svg width="1024" height="1024" ')
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
        f'viewBox="0 0 1024 1024" width="{size}" height="{size}">'
        f'<defs><clipPath id="sq"><rect width="1024" height="1024" rx="228"/></clipPath></defs>'
        f'<g clip-path="url(#sq)">{inner}</g></svg>'
    )


def circle(svg: str, size: int) -> str:
    inner = svg.replace("<svg ", '<svg width="1024" height="1024" ')
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
        f'viewBox="0 0 1024 1024" width="{size}" height="{size}">'
        f'<defs><clipPath id="ci"><circle cx="512" cy="512" r="512"/></clipPath></defs>'
        f'<g clip-path="url(#ci)">{inner}</g></svg>'
    )


for name, svg in CANDS:
    with open(os.path.join(HERE, f"{name}.svg"), "w") as f:
        f.write(svg)
    cairosvg.svg2png(bytestring=squircle(svg, 432).encode(), write_to=os.path.join(HERE, f"{name}-squircle.png"))
    cairosvg.svg2png(bytestring=circle(svg, 432).encode(), write_to=os.path.join(HERE, f"{name}-circle.png"))
    # what the adaptive foreground looks like inside the 72dp safe zone
    cairosvg.svg2png(bytestring=svg.encode(), write_to=os.path.join(HERE, f"{name}-full.png"), output_width=432)

print("rendered:", ", ".join(n for n, _ in CANDS))
