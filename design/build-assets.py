#!/usr/bin/env python3
"""AmitAI brand mark — one geometry, every output.

Run from anywhere:  python3 design/build-assets.py

Outputs
  android/app/src/main/res/drawable/ic_launcher_foreground.xml   adaptive foreground
  android/app/src/main/res/drawable/ic_launcher_background.xml   adaptive background
  android/app/src/main/res/drawable/ic_launcher_monochrome.xml   Android 13+ themed icon
  android/app/src/main/res/drawable/splash_icon.xml             Android 12+ system splash
  android/app/src/main/res/mipmap-anydpi-v26/ic_launcher*.xml     adaptive declarations
  android/app/src/main/res/mipmap-*/ic_launcher*.png             legacy icons, 5 densities
  assets/icon.png                                               transparent mark (JS splash)
  design/store-icon-512.png                                     Play Store listing icon
"""
import os

import cairosvg

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, "android/app/src/main/res")
ASSETS = os.path.join(ROOT, "assets")
DESIGN = os.path.join(ROOT, "design")

# ---------------------------------------------------------------- geometry --
# Master canvas is 1024x1024 with the mark centred on (512, 512). Every
# consumer scales from these numbers, so the launcher icon, the splash and the
# store listing can never drift apart.
C = 512.0
RX, RY = 318.0, 128.0          # orbit ellipse radii
ORBIT_W = 40.0                 # orbit stroke
TILT = 28.0                    # each orbit leans the other way
CORE_R = 118.0                 # filled centre

# Adaptive icons: art must live inside the central 66dp of a 108dp canvas, so
# the outermost ink (orbit + half its stroke at full tilt) is mapped to 33dp.
EXTENT = RX + ORBIT_W / 2.0
SAFE_DP = 33.0
SCALE = SAFE_DP / EXTENT       # 1024-unit master -> 108-unit viewport


def ellipse_path(cx, cy, rx, ry):
    """One closed ellipse as two arc commands (VectorDrawable-safe)."""
    return (
        f"M{cx - rx:.3f},{cy:.3f} "
        f"a{rx:.3f},{ry:.3f} 0 1,0 {2 * rx:.3f},0 "
        f"a{rx:.3f},{ry:.3f} 0 1,0 {-2 * rx:.3f},0 Z"
    )


# ------------------------------------------------------------ vector drawer --
def vector(paths, size_dp, viewport=108.0):
    head = (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<vector xmlns:android="http://schemas.android.com/apk/res/android"\n'
        '    xmlns:aapt="http://schemas.android.com/aapt"\n'
        f'    android:width="{size_dp}dp"\n'
        f'    android:height="{size_dp}dp"\n'
        f'    android:viewportWidth="{viewport:g}"\n'
        f'    android:viewportHeight="{viewport:g}">\n'
    )
    return head + "".join(paths) + "</vector>\n"


def gradient(colors, kind="linear", **kw):
    """<gradient> block used inside android:fillColor / android:strokeColor."""
    if kind == "linear":
        coords = (
            f'        android:startX="{kw["x1"]:g}" android:startY="{kw["y1"]:g}"\n'
            f'        android:endX="{kw["x2"]:g}" android:endY="{kw["y2"]:g}"\n'
        )
        open_tag = "      <gradient\n        android:type=\"linear\"\n" + coords
    else:
        open_tag = (
            f'      <gradient\n        android:type="radial"\n'
            f'        android:centerX="{kw["cx"]:g}" android:centerY="{kw["cy"]:g}"\n'
            f'        android:gradientRadius="{kw["r"]:g}"\n'
        )
    body = "".join(f'        <item android:offset="{o:g}" android:color="{c}"/>\n' for o, c in colors)
    return open_tag + ">" + "\n" + body + "      </gradient>\n"


def orbit_group(color_block, group_id=None):
    """Both orbits, each tilted, plus the core. `color_block` yields colour XML."""
    out = []
    for angle in (-TILT, TILT):
        out.append(
            f'  <group android:rotation="{angle:g}" android:pivotX="54" android:pivotY="54">\n'
            f'    <path android:pathData="{ellipse_path(54, 54, RX * SCALE, RY * SCALE)}"\n'
            f'        android:strokeWidth="{ORBIT_W * SCALE:g}"\n'
            f'        android:strokeAlpha="0.9"\n'
            f'        android:fillColor="@android:color/transparent">\n'
            f'{color_block("strokeColor")}'
            f'    </path>\n'
            f'  </group>\n'
        )
    out.append(
        f'  <path android:pathData="M{54 - CORE_R * SCALE:.3f},54 '
        f'a{CORE_R * SCALE:.3f},{CORE_R * SCALE:.3f} 0 1,0 {2 * CORE_R * SCALE:.3f},0 '
        f'a{CORE_R * SCALE:.3f},{CORE_R * SCALE:.3f} 0 1,0 {-2 * CORE_R * SCALE:.3f},0 Z">\n'
        f'{color_block("fillColor")}'
        f'    </path>\n'
    )
    return out


def brand_gradient(attr):
    """The indigo -> emerald ramp used by every lit surface of the mark."""
    stops = [
        (0.0, "#FF8F9BFF"),
        (0.55, "#FF6366F1"),
        (1.0, "#FF10B981"),
    ]
    return f'      <aapt:attr name="android:{attr}">\n' + gradient(
        stops, "linear", x1=22, y1=20, x2=88, y2=88
    ) + "      </aapt:attr>\n"


def flat(color="#FFFFFFFF"):
    """Monochrome layer: one colour, tinted by the system."""
    def block(attr):
        return f'      <aapt:attr name="android:{attr}">\n' + gradient(
            [(0.0, color), (1.0, color)], "linear", x1=0, y1=0, x2=108, y2=108
        ) + "      </aapt:attr>\n"
    return block


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write(text)
    return path


# ------------------------------------------------------------ android files --
write(os.path.join(RES, "drawable/ic_launcher_foreground.xml"),
      vector(orbit_group(brand_gradient), 108))

# Background: near-black with a soft indigo bloom behind the mark, so the icon
# has depth instead of reading as a flat black square.
bg = [
    '  <path android:pathData="M0,0 h108 v108 h-108 Z">\n'
    '      <aapt:attr name="android:fillColor">\n'
    '      <gradient\n'
    '          android:type="radial"\n'
    '          android:centerX="54" android:centerY="46" android:gradientRadius="78">\n'
    '        <item android:offset="0" android:color="#FF141433"/>\n'
    '        <item android:offset="0.55" android:color="#FF0C0C1A"/>\n'
    '        <item android:offset="1" android:color="#FF06060D"/>\n'
    '      </gradient>\n'
    '      </aapt:attr>\n'
    '  </path>\n',
]
write(os.path.join(RES, "drawable/ic_launcher_background.xml"), vector(bg, 108))

write(os.path.join(RES, "drawable/ic_launcher_monochrome.xml"),
      vector(orbit_group(flat()), 108))

# Android 12+ draws this in the system splash window.
write(os.path.join(RES, "drawable/splash_icon.xml"),
      vector(orbit_group(brand_gradient), 288))

adaptive = (
    '<?xml version="1.0" encoding="utf-8"?>\n'
    '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
    '    <background android:drawable="@drawable/ic_launcher_background"/>\n'
    '    <foreground android:drawable="@drawable/ic_launcher_foreground"/>\n'
    '    <monochrome android:drawable="@drawable/ic_launcher_monochrome"/>\n'
    '</adaptive-icon>\n'
)
write(os.path.join(RES, "mipmap-anydpi-v26/ic_launcher.xml"), adaptive)
write(os.path.join(RES, "mipmap-anydpi-v26/ic_launcher_round.xml"), adaptive)

# --------------------------------------------------------------- raster art --
def master_svg(transparent=False, mark_scale=1.16):
    """The mark as SVG — the raster source and the JS accent share this shape.

    `mark_scale` differs from the adaptive foreground on purpose: a legacy
    launcher icon has no safe-zone crop, so the art fills the tile; the
    adaptive foreground is scaled down to survive the mask.
    """
    bgrect = "" if transparent else (
        '<defs>\n'
        '  <radialGradient id="bg" cx="0.5" cy="0.45" r="0.78">\n'
        '    <stop offset="0" stop-color="#141433"/>\n'
        '    <stop offset="0.55" stop-color="#0c0c1a"/>\n'
        '    <stop offset="1" stop-color="#06060d"/>\n'
        '  </radialGradient>\n'
        '</defs>\n'
        '<rect width="1024" height="1024" fill="url(#bg)"/>\n'
    )
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">\n'
        '<defs>\n'
        '  <linearGradient id="orb" x1="0.1" y1="0.05" x2="0.9" y2="0.95">\n'
        '    <stop offset="0" stop-color="#8f9bff"/>\n'
        '    <stop offset="0.55" stop-color="#6366f1"/>\n'
        '    <stop offset="1" stop-color="#10b981"/>\n'
        '  </linearGradient>\n'
        f'{"" if transparent else ""}'
        '</defs>\n'
        f'{bgrect}'
        f'<g transform="translate(512,512) scale({mark_scale:g}) translate(-512,-512)">\n'
        '<g fill="none" stroke="url(#orb)" stroke-width="40" opacity="0.9">\n'
        f'  <ellipse cx="512" cy="512" rx="318" ry="128" transform="rotate(-28 512 512)"/>\n'
        f'  <ellipse cx="512" cy="512" rx="318" ry="128" transform="rotate(28 512 512)"/>\n'
        '</g>\n'
        '<circle cx="512" cy="512" r="118" fill="url(#orb)"/>\n'
        '<circle cx="512" cy="512" r="118" fill="none" stroke="#ffffff" '
        'stroke-opacity="0.18" stroke-width="6"/>\n'
        '</g>\n'
        '</svg>'
    )


def masked(svg, mask, size):
    inner = svg.replace("<svg ", '<svg width="1024" height="1024" ', 1)
    clip = (
        '<rect width="1024" height="1024" rx="228"/>'
        if mask == "squircle"
        else '<circle cx="512" cy="512" r="512"/>'
    )
    out = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" '
        f'width="{size}" height="{size}">'
        f'<defs><clipPath id="m">{clip}</clipPath></defs>'
        f'<g clip-path="url(#m)">{inner}</g></svg>'
    )
    return out


DENSITIES = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
for dens, px in DENSITIES.items():
    folder = os.path.join(RES, f"mipmap-{dens}")
    cairosvg.svg2png(bytestring=masked(master_svg(), "squircle", px).encode(),
                     write_to=os.path.join(folder, "ic_launcher.png"))
    cairosvg.svg2png(bytestring=masked(master_svg(), "circle", px).encode(),
                     write_to=os.path.join(folder, "ic_launcher_round.png"))

# Transparent mark for the JS splash (no tile: the splash paints its own bg).
cairosvg.svg2png(bytestring=master_svg(transparent=True).encode(),
                 write_to=os.path.join(ASSETS, "icon.png"), output_width=512)

# Play Store wants a plain 512x512 square, no transparency, no rounded corners.
cairosvg.svg2png(bytestring=master_svg().encode(),
                 write_to=os.path.join(DESIGN, "store-icon-512.png"), output_width=512)

print("icons written:")
for dens, px in DENSITIES.items():
    print(f"  mipmap-{dens}/ic_launcher{'(+_round)' if px else ''}.png  {px}x{px}")
print("  drawable/ic_launcher_{foreground,background,monochrome}.xml, splash_icon.xml")
print("  mipmap-anydpi-v26/ic_launcher{,_round}.xml")
print("  assets/icon.png 512, design/store-icon-512.png")
