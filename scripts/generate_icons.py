"""Generate the LLMPulse application and tray icons.

Run from the project root:
    python scripts/generate_icons.py
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / "build"
SIZE = 1024
MARGIN = 42
RADIUS = 226
PULSE_POINTS = [
    (3.6, 12.5),
    (7.3, 12.5),
    (9.35, 6.4),
    (12.75, 18.55),
    (15.1, 11.75),
    (20.4, 11.75),
]


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def hex_to_rgb(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


def diagonal_gradient(size: int, start: str, middle: str, end: str) -> Image.Image:
    top = np.array(hex_to_rgb(start), dtype=np.float32)
    mid = np.array(hex_to_rgb(middle), dtype=np.float32)
    bottom = np.array(hex_to_rgb(end), dtype=np.float32)
    yy, xx = np.mgrid[0:size, 0:size]
    t = np.clip((xx * 0.32 + yy * 0.68) / max(size - 1, 1), 0.0, 1.0)

    early = t < 0.52
    local_early = np.clip(t / 0.52, 0.0, 1.0)[..., None]
    local_late = np.clip((t - 0.52) / 0.48, 0.0, 1.0)
    eased = (1.0 - np.power(1.0 - local_late, 1.8))[..., None]
    early_colors = top + (mid - top) * local_early
    late_colors = mid + (bottom - mid) * eased
    pixels = np.where(early[..., None], early_colors, late_colors)
    return Image.fromarray(np.clip(pixels, 0, 255).astype(np.uint8), mode="RGB")


def make_icon() -> Image.Image:
    scale = 3
    canvas_size = SIZE * scale
    image = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))

    # Soft colored halo.
    halo = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    halo_draw = ImageDraw.Draw(halo)
    halo_draw.rounded_rectangle(
        (MARGIN * scale, MARGIN * scale + 18 * scale, canvas_size - MARGIN * scale, canvas_size - MARGIN * scale + 30 * scale),
        radius=RADIUS * scale,
        fill=(45, 212, 191, 95),
    )
    halo = halo.filter(ImageFilter.GaussianBlur(26 * scale))
    image.alpha_composite(halo)

    # Rounded square face.
    gradient = diagonal_gradient(canvas_size, "#a8fff3", "#5eead4", "#17a895").convert("RGBA")
    mask = Image.new("L", (canvas_size, canvas_size), 0)
    mask_draw = ImageDraw.Draw(mask)
    inset = MARGIN * scale
    mask_draw.rounded_rectangle(
        (inset, inset, canvas_size - inset, canvas_size - inset),
        radius=RADIUS * scale,
        fill=255,
    )
    face = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    face.paste(gradient, (0, 0), mask)
    image.alpha_composite(face)

    # Inner top highlight.
    highlight = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    highlight_draw = ImageDraw.Draw(highlight)
    highlight_draw.rounded_rectangle(
        (inset + 14 * scale, inset + 12 * scale, canvas_size - inset - 14 * scale, canvas_size - inset - 14 * scale),
        radius=(RADIUS - 12) * scale,
        outline=(255, 255, 255, 86),
        width=4 * scale,
    )
    highlight = highlight.filter(ImageFilter.GaussianBlur(1.2 * scale))
    image.alpha_composite(highlight)

    # Pulse waveform.
    stroke = 74 * scale
    points = [
        (round(inset + x / 24 * (SIZE - MARGIN * 2) * scale), round(inset + y / 24 * (SIZE - MARGIN * 2) * scale))
        for x, y in PULSE_POINTS
    ]
    pulse = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    pulse_draw = ImageDraw.Draw(pulse)
    pulse_draw.line(points, fill=(3, 43, 37, 255), width=stroke, joint="curve")
    for point in (points[0], points[-1]):
        radius = stroke // 2
        pulse_draw.ellipse(
            (point[0] - radius, point[1] - radius, point[0] + radius, point[1] + radius),
            fill=(3, 43, 37, 255),
        )
    image.alpha_composite(pulse)

    # Small terminal node, like the dot after a healthy check.
    node_x = inset + 20.0 / 24 * (SIZE - MARGIN * 2) * scale
    node_y = inset + 11.75 / 24 * (SIZE - MARGIN * 2) * scale
    node_radius = 19 * scale
    node = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    node_draw = ImageDraw.Draw(node)
    node_draw.ellipse(
        (
            node_x - node_radius,
            node_y - node_radius,
            node_x + node_radius,
            node_y + node_radius,
        ),
        fill=(255, 255, 255, 255),
    )
    image.alpha_composite(node)

    # Crisp outer rim.
    rim = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    rim_draw = ImageDraw.Draw(rim)
    rim_draw.rounded_rectangle(
        (inset, inset, canvas_size - inset, canvas_size - inset),
        radius=RADIUS * scale,
        outline=(240, 255, 252, 110),
        width=5 * scale,
    )
    image.alpha_composite(rim)

    return image.resize((SIZE, SIZE), Image.Resampling.LANCZOS)


def main() -> None:
    BUILD.mkdir(parents=True, exist_ok=True)
    icon = make_icon()
    icon.save(BUILD / "icon.png")
    icon.save(
        BUILD / "icon.ico",
        format="ICO",
        sizes=[(16, 16), (20, 20), (24, 24), (32, 32), (40, 40), (48, 48), (64, 64), (128, 128), (256, 256)],
    )
    icon.save(
        BUILD / "tray.ico",
        format="ICO",
        sizes=[(16, 16), (20, 20), (24, 24), (32, 32), (40, 40), (48, 48)],
    )
    # A 256px PNG is useful in docs and for the README.
    icon.resize((256, 256), Image.Resampling.LANCZOS).save(BUILD / "icon-256.png")
    print(f"Wrote icons to {BUILD}")


if __name__ == "__main__":
    main()
