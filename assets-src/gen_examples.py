#!/usr/bin/env python3
"""Generate the house template example set (spec section 2.6).

Six generic Tap.Giving house designs, round and square variants,
authored as full-bleed 106 mm artboard SVGs and rendered to PNG at
424 px (4 px per mm). No customer artwork: every design is a house
template with a placeholder-style organization name, exactly as the
examples ruling requires. Fonts: DejaVu (present on the box), named
generically in the SVG so the source stays portable.

Writes SVGs beside this script and PNGs at 424x424. The build-examples
step then emits the Worker's example-assets modules.
"""
import html
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "src", "example-assets")
os.makedirs(OUT, exist_ok=True)

TAP_ICON = (
    '<g transform="translate({x},{y}) scale({s})" fill="none" stroke="{c}" '
    'stroke-width="5" stroke-linecap="round">'
    '<path d="M0,-34 A34,34 0 1,1 -24,24" opacity="0.45"/>'
    '<path d="M0,-22 A22,22 0 1,1 -15.5,15.5" opacity="0.7"/>'
    '<path d="M0,-10 A10,10 0 1,1 -7,7"/>'
    '<circle cx="0" cy="26" r="5" fill="{c}" stroke="none"/>'
    "</g>"
)


def design(bg, shape_clip, inner):
    if shape_clip == "round":
        clip = '<clipPath id="cut"><circle cx="53" cy="53" r="53"/></clipPath>'
    else:
        clip = '<clipPath id="cut"><rect x="0" y="0" width="106" height="106"/></clipPath>'
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="106mm" height="106mm" '
        'viewBox="0 0 106 106">'
        f"<defs>{clip}</defs>"
        f'<g clip-path="url(#cut)"><rect width="106" height="106" fill="{bg}"/>'
        f"{inner}</g></svg>"
    )


def text(x, y, s, size, fill, family="serif", weight="normal", spacing="0", anchor="middle"):
    return (
        f'<text x="{x}" y="{y}" font-family="{family}" font-size="{size}" '
        f'font-weight="{weight}" letter-spacing="{spacing}" fill="{fill}" '
        f'text-anchor="{anchor}">{html.escape(s)}</text>'
    )


def tap_line(y, fill):
    return text(53, y, "TAP HERE", 6.2, fill, family="sans-serif", weight="bold", spacing="2.4")


DESIGNS = {}

# 1. Classic navy, gold icon, round.
inner = (
    TAP_ICON.format(x=53, y=34, s=0.62, c="#d9a441")
    + text(53, 66, "YOUR NAME HERE", 8.6, "#ffffff", weight="bold", spacing="1.2")
    + tap_line(78, "#d9a441")
    + text(53, 88, "Tap to open our page", 4.6, "#cfd8e6", family="sans-serif")
)
DESIGNS["ex-navy-round"] = ("round", design("#16324f", "round", inner),
                            "Classic navy with a gold tap icon and a clean organization name")

# 2. Warm cream, serif, square.
inner = (
    '<rect x="7" y="7" width="92" height="92" fill="none" stroke="#8a6d3b" stroke-width="0.8"/>'
    + TAP_ICON.format(x=53, y=36, s=0.58, c="#8a6d3b")
    + text(53, 68, "New Life Fellowship", 8.2, "#4a3b26")
    + tap_line(80, "#8a6d3b")
    + text(53, 90, "All are welcome here", 4.4, "#7a6a52", family="sans-serif")
)
DESIGNS["ex-cream-square"] = ("square", design("#f5eddc", "square", inner),
                              "Warm cream with serif lettering and a centered tap icon")

# 3. Deep green, arched name, leaf accent, round.
inner = (
    '<path d="M20,24 A33,9 0 0,1 86,24" fill="none" stroke="#cfe3cf" stroke-width="0.7"/>'
    + text(53, 37, "THE OAKS", 8.8, "#ffffff", weight="bold", spacing="2")
    + text(53, 47, "COMMUNITY CENTER", 4.6, "#cfe3cf", family="sans-serif", spacing="2.6")
    + '<path d="M53,68 C53,60 46,58 42,58 C42,66 47,68 53,68 Z M53,68 C53,60 60,58 64,58 C64,66 59,68 53,68 Z" fill="#e8c766"/>'
    + tap_line(80, "#e8c766")
    + text(53, 90, "Tap to open our page", 4.6, "#cfe3cf", family="sans-serif")
)
DESIGNS["ex-forest-round"] = ("round", design("#1e4634", "round", inner),
                              "Deep green with an arched name and a small leaf accent")

# 4. Burgundy, gold frame, bold, square.
inner = (
    '<rect x="7" y="7" width="92" height="92" fill="none" stroke="#d9a441" stroke-width="1.1"/>'
    + text(53, 34, "REDEMPTION", 10.5, "#ffffff", family="sans-serif", weight="bold", spacing="1.6")
    + text(53, 44, "CITY KITCHEN", 6.4, "#e6c98a", family="sans-serif", spacing="3.4")
    + TAP_ICON.format(x=53, y=63, s=0.44, c="#d9a441")
    + tap_line(88, "#ffffff")
)
DESIGNS["ex-burgundy-square"] = ("square", design("#5e1f24", "square", inner),
                                 "Burgundy with a thin gold border frame and bold lettering")

# 5. Modern slate, minimal, round.
inner = (
    TAP_ICON.format(x=53, y=30, s=0.6, c="#ffffff")
    + text(53, 72, "harbor coffee", 8.4, "#ffffff", family="sans-serif", spacing="0.6")
    + tap_line(84, "#9fb4c8")
)
DESIGNS["ex-slate-round"] = ("round", design("#3d4c5c", "round", inner),
                             "Modern slate with minimal type and a large tap icon")

# 6. Soft sand, stacked name and tagline, square.
inner = (
    text(53, 30, "Cornerstone", 10.2, "#513f2a", weight="bold")
    + text(53, 40, "FELLOWSHIP", 5.2, "#8a7355", family="sans-serif", spacing="3.2")
    + '<line x1="33" y1="46" x2="73" y2="46" stroke="#b39b72" stroke-width="0.8"/>'
    + TAP_ICON.format(x=53, y=65, s=0.46, c="#513f2a")
    + tap_line(90, "#513f2a")
)
DESIGNS["ex-sand-square"] = ("square", design("#e9dfc9", "square", inner),
                             "Soft sand with a stacked name and tagline treatment")


def main():
    # Render with PyMuPDF (the artwork venv's fitz): ImageMagick's
    # internal MSVG renderer on this box mis-renders clip paths over
    # root-level rects (square designs came out blank), while MuPDF
    # renders the production-shaped SVGs faithfully.
    try:
        import pymupdf
    except ImportError:
        import fitz as pymupdf  # older venvs expose the fitz alias
    for ex_id, (shape, svg, _direction) in DESIGNS.items():
        svg_path = os.path.join(OUT, f"{ex_id}.svg")
        png_path = os.path.join(OUT, f"{ex_id}.png")
        with open(svg_path, "w", encoding="utf-8") as fh:
            fh.write(svg)
        doc = pymupdf.open(stream=svg.encode("utf-8"), filetype="svg")
        page = doc[0]
        zoom = 424 / page.rect.width
        pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=False)
        if shape == "round":
            # The disc is the 100 mm cut (radius 50 mm at centre), not
            # the square artboard: apply it as transparency outside
            # the circle so the render shows the actual round disc.
            mask_svg = (
                '<svg xmlns="http://www.w3.org/2000/svg" width="106mm" height="106mm" '
                'viewBox="0 0 106 106"><rect width="106" height="106" fill="black"/>'
                '<circle cx="53" cy="53" r="50" fill="white"/></svg>'
            )
            mdoc = pymupdf.open(stream=mask_svg.encode("utf-8"), filetype="svg")
            mpix = mdoc[0].get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=False, colorspace=pymupdf.csGRAY)
            mask = mpix
            pix = pymupdf.Pixmap(pix, mask)
        pix.save(png_path)
        print(f"{ex_id}: svg {os.path.getsize(svg_path)} png {os.path.getsize(png_path)} ({shape})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
