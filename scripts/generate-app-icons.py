#!/usr/bin/env python3
"""Generate Subtitle App icons — bold 字 on stage with ember cue underline.

Black-weight Noto Sans CJK SC on the warm stage palette. Glyph sized to leave
room for a proportional ember bar (not a hairline under a huge character).
"""

from __future__ import annotations

import math
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public'
FONT_TTC = Path('/usr/share/fonts/google-noto-sans-cjk-vf-fonts/NotoSansCJK-VF.ttc')
# Noto Sans CJK SC in the VF collection
FONT_INDEX_SC = 2
WEIGHT_BLACK = 900

STAGE = (16, 12, 11)
LIFT = (46, 30, 24)
PAPER = (244, 236, 228)
EMBER = (232, 108, 48)


def paint_stage(size: int) -> Image.Image:
	img = Image.new('RGBA', (size, size), (*STAGE, 255))
	px = img.load()
	for y in range(size):
		for x in range(size):
			dx = (x - size * 0.42) / size
			dy = (y - size * 0.38) / size
			d = math.hypot(dx, dy)
			t = max(0.0, 1.0 - d / 0.9) ** 2
			c = tuple(int(STAGE[i] + (LIFT[i] - STAGE[i]) * t) for i in range(3))
			px[x, y] = (*c, 255)
	return img


def load_font(px: int) -> ImageFont.FreeTypeFont:
	font = ImageFont.truetype(str(FONT_TTC), size=px, index=FONT_INDEX_SC)
	font.set_variation_by_axes([WEIGHT_BLACK])
	return font


def layout_for(size: int) -> dict[str, float | int]:
	"""Compact bold glyph + chunky ember bar snug underneath."""
	if size <= 16:
		return {
			'font_px': 8,
			'glyph_cy': size * 0.36,
			'bar_h': 3,
			'bar_w_ratio': 1.05,
			'bar_w_min': 10,
			'gap_after_glyph': 1,
		}
	if size <= 48:
		# Integer-friendly mid sizes (incl. 32 + 48 ICO frames)
		return {
			'font_px': max(12, int(size * 0.42)),
			'glyph_cy': size * 0.36,
			'bar_h': max(4, int(size * 0.14)),
			'bar_w_ratio': 1.05,
			'bar_w_min': max(14, int(size * 0.55)),
			'gap_after_glyph': max(1, int(size * 0.05)),
		}
	# Large (≥180): glyph ~32% canvas; bar ~12% tall, slightly wider than glyph
	return {
		'font_px': int(size * 0.32),
		'glyph_cy': size * 0.40,
		'bar_h': max(28, int(size * 0.12)) if size >= 256 else max(16, int(size * 0.12)),
		'bar_w_ratio': 1.08,
		'bar_w_min': int(size * 0.42),
		'gap_after_glyph': size * 0.045,
	}


def render(size: int) -> Image.Image:
	img = paint_stage(size)
	draw = ImageDraw.Draw(img)
	layout = layout_for(size)

	font = load_font(int(layout['font_px']))
	text = '字'
	bbox = draw.textbbox((0, 0), text, font=font)
	tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
	tx = (size - tw) / 2 - bbox[0]
	ty = float(layout['glyph_cy']) - th / 2 - bbox[1]

	if size >= 96:
		shadow = Image.new('RGBA', (size, size), (0, 0, 0, 0))
		sd = ImageDraw.Draw(shadow)
		sd.text((tx, ty + size * 0.008), text, font=font, fill=(0, 0, 0, 100))
		shadow = shadow.filter(ImageFilter.GaussianBlur(radius=max(1, size // 90)))
		img = Image.alpha_composite(img, shadow)
		draw = ImageDraw.Draw(img)

	draw.text((tx, ty), text, font=font, fill=(*PAPER, 255))

	bar_h = int(layout['bar_h'])
	bar_w = max(int(layout['bar_w_min']), int(tw * float(layout['bar_w_ratio'])))
	bar_w = min(bar_w, int(size * 0.78))
	x0 = (size - bar_w) / 2
	glyph_bottom = ty + bbox[3]
	y0 = glyph_bottom + float(layout['gap_after_glyph'])
	# Keep bottom safe margin for maskable crop
	max_y0 = size - size * 0.12 - bar_h
	if y0 > max_y0:
		y0 = max_y0

	draw.rounded_rectangle(
		[x0, y0, x0 + bar_w, y0 + bar_h],
		radius=bar_h / 2,
		fill=(*EMBER, 255),
	)

	return img.convert('RGBA')


def write_svg() -> None:
	"""Embed Black-weight 字 from a cached path (instancing the CJK VF is slow)."""
	path_file = ROOT / 'scripts' / 'zi-black.path.txt'
	bounds_file = ROOT / 'scripts' / 'zi-black.bounds.txt'
	if not path_file.exists() or not bounds_file.exists():
		print('skip SVG path update (cache missing); PNGs still written')
		return

	raw = path_file.read_text(encoding='utf-8').strip()
	x_min, y_min, x_max, y_max, units = (
		float(x) for x in bounds_file.read_text(encoding='utf-8').strip().split(',')
	)
	target = 512 * 0.32
	scale = target / units
	cx = (x_min + x_max) / 2
	cy = (y_min + y_max) / 2
	tx = 256 - cx * scale
	ty = 512 * 0.40 + cy * scale

	gw = (x_max - x_min) * scale
	gh = (y_max - y_min) * scale
	bar_w = max(512 * 0.42, gw * 1.08)
	bar_h = 512 * 0.12
	bar_x = (512 - bar_w) / 2
	# Approximate glyph bottom in SVG after flip: ty is baseline-ish center
	bar_y = 512 * 0.40 + gh / 2 + 512 * 0.045

	svg = f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" role="img" aria-label="Subtitle App">
  <defs>
    <radialGradient id="stage" cx="42%" cy="38%" r="78%" gradientUnits="objectBoundingBox">
      <stop offset="0%" stop-color="#2E1E18"/>
      <stop offset="100%" stop-color="#100C0B"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" fill="url(#stage)"/>
  <path fill="#F4ECE4" transform="translate({tx:.3f} {ty:.3f}) scale({scale:.6f} {-scale:.6f})" d="{raw}"/>
  <rect x="{bar_x:.1f}" y="{bar_y:.1f}" width="{bar_w:.1f}" height="{bar_h:.1f}" rx="{bar_h / 2:.1f}" fill="#E86C30"/>
</svg>
'''
	(OUT / 'icon.svg').write_text(svg, encoding='utf-8')


def main() -> None:
	write_svg()
	targets = [
		('android-chrome-512x512.png', 512),
		('android-chrome-192x192.png', 192),
		('apple-touch-icon.png', 180),
		('favicon-32x32.png', 32),
		('favicon-16x16.png', 16),
	]
	for name, size in targets:
		path = OUT / name
		render(size).save(path, format='PNG', optimize=True)
		print(f'wrote {path.relative_to(ROOT)} ({size}x{size})')

	tmp = Path('/tmp')
	for s in (16, 32, 48):
		render(s).save(tmp / f'subtitle-favicon-{s}.png')
	subprocess.check_call(
		[
			'magick',
			str(tmp / 'subtitle-favicon-16.png'),
			str(tmp / 'subtitle-favicon-32.png'),
			str(tmp / 'subtitle-favicon-48.png'),
			str(OUT / 'favicon.ico'),
		]
	)
	print(f'wrote {(OUT / "favicon.ico").relative_to(ROOT)}')


if __name__ == '__main__':
	main()
