"""Builds the site's assets from the game's own files and press shots.

    python -X utf8 tools/build_assets.py [--game D:/Dev/tower-foundry] [--press <dir>] [--only fonts,images,icons,og,video]

- fonts: the game's Alegreya TTFs subset to Latin + Cyrillic, WOFF2 (assets/fonts).
- images: every shot in SHOTS at 640/1280/1920 px, AVIF + WebP, plus a 1280 px JPEG fallback (assets/img).
- icons: favicon.ico / apple-touch-icon / manifest icons from the game's Windows icon, favicon.svg = icon.svg.
- og: the 1200x630 link preview (night shot + the game's logo lockup).
- video: CLIPS cut from the movie writer's AVIs to H.264 MP4 (VP9 came out larger at the same look), with a poster frame.

Masters (press shots, clips) stay in the game repo's artifacts and are never published themselves.
"""
import argparse
import re
import shutil
import subprocess
from pathlib import Path

from fontTools import subset
from loguru import logger
from PIL import Image, ImageDraw, ImageFilter, ImageFont

SITE = Path(__file__).resolve().parents[1]
WIDTHS = (640, 1280, 1920)

# site name -> press shot (artifacts/press-<date>/shots); the site's <picture> elements use these names.
SHOTS = {
    "night-hero": "shots/night_hero_nohud.png",
    "day-mid": "shots/day_mid_nohud.png",
    "night-mid": "shots/night_mid_nohud.png",
    "factory-night": "shots/factory_night_close_nohud.png",
    "factory-day": "shots/factory_day_close_nohud.png",
    "factory-day-wide": "shots/factory_day_nohud.png",
    "factory-night-wide": "shots/factory_night_nohud.png",
    "battle-tower": "shots/battle_tower_hud.png",
    "battle-night": "shots/battle_night_nohud.png",
    "grove-start": "shots/grove_start_nohud.png",
    "grove-hud": "shots/grove_start_hud.png",
    "night-wide": "shots/night_wide_nohud.png",
    "day-wide": "shots/day_wide_nohud.png",
    "play-day": "shots/play_day_hud.png",
    "play-night": "shots/play_night_hud.png",
    "menu": "shots/menu.png",
    "regions": "shots/menu_regions.png",
    "shop": "shots/shop.png",
    "upgrades": "shots/upgrades.png",
    "boss": "stills/boss_2_stand.png",
    "fortress": "stills/4-assault.png",
}

# site name -> (clip AVI, log with the CLIP start/end frames, seconds kept from the clip's start or None, width, x264 crf).
# The hero loop sits under a dark gradient, so it takes a lower quality than the showreel.
CLIPS = {
    "hero": ("clips/hero.avi", "logs/clip-hero.log", None, 1280, 28),
    "dusk": ("clips/dusk.avi", "logs/clip-dusk.log", None, 1280, 24),
}

FONTS = {
    "alegreya-sc-800": "AlegreyaSC-ExtraBold.ttf",
    "alegreya-sans-400": "AlegreyaSans-Regular.ttf",
    "alegreya-sans-500": "AlegreyaSans-Medium.ttf",
    "alegreya-sans-700": "AlegreyaSans-Bold.ttf",
}
# Basic Latin, Latin-1, general punctuation, arrows, ₽/€/№/™, Cyrillic (Russian, Ukrainian, Belarusian).
UNICODES = "U+0000-00FF,U+0131,U+0152-0153,U+02C6,U+02DA,U+02DC,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2000-206F,U+20AC,U+20BD,U+2116,U+2122,U+2190-2199,U+2212,U+2215,U+25B8,U+2713"


def build_fonts(game: Path) -> None:
    out = SITE / "assets/fonts"
    out.mkdir(parents=True, exist_ok=True)
    for name, ttf in FONTS.items():
        options = subset.Options()
        options.flavor = "woff2"
        options.layout_features = ["kern", "liga", "lnum", "pnum", "tnum", "smcp", "c2sc", "case"]
        options.name_IDs = ["*"]
        font = subset.load_font(str(game / "assets/fonts" / ttf), options)
        subsetter = subset.Subsetter(options)
        subsetter.populate(unicodes=subset.parse_unicodes(UNICODES))
        subsetter.subset(font)
        target = out / f"{name}.woff2"
        subset.save_font(font, str(target), options)
        logger.info("font {} <- {}: {} KB", target.name, ttf, target.stat().st_size // 1024)
    shutil.copy(game / "assets/fonts/AlegreyaSans-OFL.txt", out / "OFL.txt")


def save_variants(img: Image.Image, name: str) -> None:
    out = SITE / "assets/img"
    out.mkdir(parents=True, exist_ok=True)
    for width in WIDTHS:
        if width > img.width:
            continue
        frame = img.resize((width, round(img.height * width / img.width)), Image.LANCZOS)
        frame.save(out / f"{name}-{width}.avif", "AVIF", quality=58, speed=4)
        frame.save(out / f"{name}-{width}.webp", "WEBP", quality=80, method=6)
        if width == 1280:
            frame.save(out / f"{name}-{width}.jpg", "JPEG", quality=82, optimize=True, progressive=True)
    sizes = {p.suffix: p.stat().st_size // 1024 for p in out.glob(f"{name}-1280.*")}
    logger.info("image {} {}x{}: 1280 px {}", name, img.width, img.height, sizes)


def build_images(press: Path) -> None:
    for name, rel in SHOTS.items():
        src = press / rel
        if not src.exists():
            logger.warning("image {}: missing master {}", name, src)
            continue
        save_variants(Image.open(src).convert("RGB"), name)


def build_icons(game: Path) -> None:
    out = SITE / "assets/img"
    out.mkdir(parents=True, exist_ok=True)
    ico = Image.open(game / "assets/app/ember-foundry.ico")
    ico.size = (256, 256)
    big = ico.convert("RGBA")
    big.resize((180, 180), Image.LANCZOS).save(out / "apple-touch-icon.png")
    big.resize((192, 192), Image.LANCZOS).save(out / "icon-192.png")
    big.save(out / "icon-512.png") if big.width >= 512 else big.resize((512, 512), Image.LANCZOS).save(out / "icon-512.png")
    big.save(SITE / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    shutil.copy(game / "icon.svg", SITE / "favicon.svg")
    logger.info("icons: favicon.ico, favicon.svg, apple-touch-icon, icon-192/512")


def build_og(game: Path, press: Path) -> None:
    """1200x630 link preview: the night shot darkened to the left, the logo lockup as the game draws it."""
    # Zoomed so the castle and its beam stand right of centre, the text on the dark left.
    shot = Image.open(press / SHOTS["night-hero"]).convert("RGB")
    shot = shot.resize((1600, 900), Image.LANCZOS)
    card = shot.crop((0, 200, 1200, 830)).convert("RGBA")
    shade = Image.new("RGBA", card.size)
    draw = ImageDraw.Draw(shade)
    for x in range(1200):
        alpha = int(240 * max(0.0, 1 - x / 820) ** 1.25)
        draw.line([(x, 0), (x, 630)], fill=(7, 10, 20, alpha))
    card = Image.alpha_composite(card, shade)
    draw = ImageDraw.Draw(card)
    fonts = game / "assets/fonts"
    gold, cream = (244, 198, 110), (247, 241, 232)
    word = ImageFont.truetype(str(fonts / "AlegreyaSans-Bold.ttf"), 64)
    motto = ImageFont.truetype(str(fonts / "AlegreyaSans-Bold.ttf"), 24)
    line = ImageFont.truetype(str(fonts / "AlegreyaSans-Medium.ttf"), 34)
    # The emblem: a gold octagon with the beacon (ui_theme.gd logo()).
    x0, y0, side = 72, 214, 104
    cut = side * 0.29
    octagon = [(x0 + cut, y0), (x0 + side - cut, y0), (x0 + side, y0 + cut), (x0 + side, y0 + side - cut),
               (x0 + side - cut, y0 + side), (x0 + cut, y0 + side), (x0, y0 + side - cut), (x0, y0 + cut)]
    glow = Image.new("RGBA", card.size)
    ImageDraw.Draw(glow).polygon(octagon, fill=gold + (90,))
    card = Image.alpha_composite(card, glow.filter(ImageFilter.GaussianBlur(14)))
    draw = ImageDraw.Draw(card)
    draw.polygon(octagon, fill=(36, 26, 14, 235), outline=gold, width=3)
    s = side / 24 * 0.62
    ox, oy = x0 + side / 2 - 12 * s, y0 + side / 2 - 12 * s
    def p(x, y):
        return (ox + x * s, oy + y * s)
    draw.polygon([p(9.2, 21.5), p(14.8, 21.5), p(13.7, 11), p(10.3, 11)], outline=gold, width=3)
    draw.rectangle([p(10.2, 8.2), p(13.8, 11)], outline=gold, width=3)
    for a, b in [((12, 5.5), (12, 3)), ((4.5, 6.5), (7.5, 8.5)), ((19.5, 6.5), (16.5, 8.5)), ((3.5, 11.5), (7, 11.5)), ((20.5, 11.5), (17, 11.5))]:
        draw.line([p(*a), p(*b)], fill=gold, width=3)
    def tracked(x, y, text, font, fill, tracking):
        """Capitals with air between the letters, as the game's logo font variation draws them."""
        for char in text:
            draw.text((x, y), char, font=font, fill=fill)
            x += draw.textlength(char, font=font) + tracking
        return x - tracking

    tx = x0 + side + 34
    tracked(tx, y0 + 6, "EMBER FOUNDRY", word, cream, 15)
    end = tracked(tx + 2, y0 + 80, "ХРАНИТЕЛИ ЛЕСА", motto, gold, 9)
    for i in range(200):
        draw.point((end + 18 + i, y0 + 95), fill=gold + (int(170 * (1 - i / 200)),))
    draw.text((72, 380), "Построй фабрику. Удержи ночную осаду.", font=line, fill=cream)
    draw.text((72, 428), "Windows · macOS · бесплатно", font=motto, fill=(195, 191, 220))
    out = SITE / "assets/img/og.jpg"
    card.convert("RGB").save(out, "JPEG", quality=86, optimize=True, progressive=True)
    logger.info("og image {}: {} KB", out.name, out.stat().st_size // 1024)
    # GitHub's social preview wants 1280x640 (2:1): the same card on a slightly wider night.
    social = Image.new("RGB", (1280, 640), (7, 10, 20))
    social.paste(card.convert("RGB").resize((1219, 640), Image.LANCZOS), (61, 0))
    edge = Image.new("RGBA", (1280, 640))
    ImageDraw.Draw(edge).rectangle([0, 0, 61, 640], fill=(7, 10, 20, 255))
    social = Image.alpha_composite(social.convert("RGBA"), edge).convert("RGB")
    out = SITE / "assets/img/social-1280x640.jpg"
    social.save(out, "JPEG", quality=86, optimize=True, progressive=True)
    logger.info("social preview {}: {} KB", out.name, out.stat().st_size // 1024)


def clip_range(log: Path) -> tuple[int, int]:
    text = log.read_text(encoding="utf-8", errors="replace")
    return int(re.search(r"CLIP start frame (\d+)", text).group(1)), int(re.search(r"CLIP end frame (\d+)", text).group(1))


def build_video(press: Path) -> None:
    out = SITE / "assets/video"
    out.mkdir(parents=True, exist_ok=True)
    for name, (avi, log, keep, width, crf) in CLIPS.items():
        src, log_path = press / avi, press / log
        if not src.exists() or not log_path.exists():
            logger.warning("video {}: missing {} or {}", name, src, log_path)
            continue
        start, end = clip_range(log_path)
        if keep:
            end = min(end, start + int(keep * 60))
        cut = f"trim=start_frame={start}:end_frame={end},setpts=PTS-STARTPTS,fps=30,scale={width}:-2:flags=lanczos"
        logger.info("video {} <- {} frames {}..{} at {} px", name, src.name, start, end, width)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-vf", cut, "-an", "-c:v", "libx264", "-preset", "slow",
                        "-crf", str(crf), "-profile:v", "high", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(out / f"{name}.mp4")], check=True)
        frame = out / f"{name}-poster.png"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(out / f"{name}.mp4"), "-frames:v", "1", str(frame)], check=True)
        poster = Image.open(frame).convert("RGB")
        poster.save(out / f"{name}-poster.webp", "WEBP", quality=78, method=6)
        poster.save(out / f"{name}-poster.jpg", "JPEG", quality=80, optimize=True, progressive=True)
        frame.unlink()
        sizes = {p.name: p.stat().st_size // 1024 for p in out.glob(f"{name}*")}
        logger.info("video {}: {}", name, sizes)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--game", type=Path, default=Path("D:/Dev/tower-foundry"))
    parser.add_argument("--press", type=Path, default=Path("D:/Dev/tower-foundry/artifacts/press-20261026"))
    parser.add_argument("--only", default="fonts,images,icons,og,video")
    args = parser.parse_args()
    steps = set(args.only.split(","))
    logger.info("build assets: game {}, press {}, steps {}", args.game, args.press, sorted(steps))
    if "fonts" in steps:
        build_fonts(args.game)
    if "images" in steps:
        build_images(args.press)
    if "icons" in steps:
        build_icons(args.game)
    if "og" in steps:
        build_og(args.game, args.press)
    if "video" in steps:
        build_video(args.press)
    logger.info("done")


if __name__ == "__main__":
    main()
