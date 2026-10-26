"""Publishes a game build: a GitHub release with both installers, and the site's release.json pointing at it.

    python -X utf8 tools/release.py [--dist D:/Dev/tower-foundry/builds/dist] [--repo mazamaka/ember-foundry-game] [--publish]

Without --publish it only checks the installers against the game's builds/dist/release.json (size, SHA-256)
and writes release.json for the site. With --publish it also creates the release v<version> (if missing) and
uploads the installers that are not there yet; the token comes from the GITHUB_TOKEN environment variable.
Commit and push release.json afterwards: the site reads it to fill the download buttons.
"""
import argparse
import hashlib
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from loguru import logger

SITE = Path(__file__).resolve().parents[1]
API = "https://api.github.com"
PLATFORMS = ("windows", "macos")

NOTES = """**Ember Foundry {version}** — ранняя версия · early build ({date}).

Построй фабрику. Удержи ночную осаду. · Build a factory. Hold the night siege.

| | Файл · File | SHA-256 |
|---|---|---|
| Windows 10/11 (64-bit) | `{win_name}` | `{win_sha}` |
| macOS 13+ (Apple Silicon) / 11+ (Intel) | `{mac_name}` | `{mac_sha}` |

**Windows:** если SmartScreen покажет «Система Windows защитила ваш компьютер» — «Подробнее» → «Выполнить в любом случае».
If SmartScreen says “Windows protected your PC”, click *More info* → *Run anyway* (the installer is not code-signed yet).

**macOS:** перетащите игру в «Программы»; первый запуск — «Системные настройки → Конфиденциальность и безопасность →
Открыть всё равно» (macOS 15+) или Control-клик → «Открыть» (macOS 13–14). The app is not notarized: allow the first
launch in *System Settings → Privacy & Security → Open Anyway*, or Control-click → *Open*.

Сохранения переживают обновление · Saves survive updates. Игра на русском языке · The game is in Russian.
Сайт · Site: {site}
"""


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def api(method: str, url: str, token: str, body: dict | None = None, data=None, headers: dict | None = None):
    request = urllib.request.Request(url, method=method, data=data if data is not None else (json.dumps(body).encode() if body else None))
    request.add_header("Authorization", f"Bearer {token}")
    request.add_header("Accept", "application/vnd.github+json")
    request.add_header("X-GitHub-Api-Version", "2022-11-28")
    if body is not None:
        request.add_header("Content-Type", "application/json")
    for key, value in (headers or {}).items():
        request.add_header(key, value)
    try:
        with urllib.request.urlopen(request, timeout=3600) as response:
            text = response.read().decode()
            return response.status, (json.loads(text) if text else {})
    except urllib.error.HTTPError as error:
        return error.code, json.loads(error.read().decode() or "{}")


def load_build(dist: Path) -> dict:
    data = json.loads((dist / "release.json").read_text(encoding="utf-8"))
    full = data["version"]
    version = full.split("-")[0]
    stamp = re.search(r"\.(\d{4})(\d{2})(\d{2})\.", full)
    date = f"{stamp[1]}-{stamp[2]}-{stamp[3]}" if stamp else None
    assets = {}
    for os_name in PLATFORMS:
        info = data[os_name]
        path = dist / info["file"]
        size = path.stat().st_size
        if size != info["bytes"]:
            sys.exit(f"{path.name}: {size} bytes on disk, {info['bytes']} in release.json")
        digest = sha256(path)
        if digest != info["sha256"]:
            sys.exit(f"{path.name}: SHA-256 {digest} differs from release.json")
        assets[os_name] = {"path": path, "name": path.name, "bytes": size, "sha256": digest}
        logger.info("{}: {} ({} MB) verified", os_name, path.name, size // 1048576)
    return {"full": full, "version": version, "date": date, "assets": assets}


def site_url() -> str:
    match = re.search(r'<link rel="canonical" href="([^"]+)"', (SITE / "index.html").read_text(encoding="utf-8"))
    return match[1] if match else ""


def write_site_json(build: dict, repo: str) -> None:
    tag = f"v{build['version']}"
    out = {
        "version": build["version"],
        "build": build["full"],
        "date": build["date"],
        "tag": tag,
        "releases_url": f"https://github.com/{repo}/releases",
        "notes_url": f"https://github.com/{repo}/releases/tag/{tag}",
        "assets": {
            os_name: {
                "name": a["name"],
                "url": f"https://github.com/{repo}/releases/download/{tag}/{urllib.parse.quote(a['name'])}",
                "bytes": a["bytes"],
                "sha256": a["sha256"],
            }
            for os_name, a in build["assets"].items()
        },
    }
    (SITE / "release.json").write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    logger.info("release.json written for {} ({})", tag, build["date"])


def publish(build: dict, repo: str, token: str) -> None:
    tag = f"v{build['version']}"
    status, release = api("GET", f"{API}/repos/{repo}/releases/tags/{tag}", token)
    if status == 404:
        a = build["assets"]
        body = NOTES.format(version=build["version"], date=build["date"], site=site_url(),
                            win_name=a["windows"]["name"], win_sha=a["windows"]["sha256"],
                            mac_name=a["macos"]["name"], mac_sha=a["macos"]["sha256"])
        status, release = api("POST", f"{API}/repos/{repo}/releases", token,
                              {"tag_name": tag, "target_commitish": "main", "name": f"Ember Foundry {build['version']}",
                               "body": body, "make_latest": "true"})
        if status != 201:
            sys.exit(f"create release {tag}: HTTP {status} {release}")
        logger.info("release {} created: {}", tag, release["html_url"])
    elif status != 200:
        sys.exit(f"read release {tag}: HTTP {status} {release}")
    else:
        logger.info("release {} exists: {}", tag, release["html_url"])
    present = {asset["name"]: asset for asset in release.get("assets", [])}
    upload = release["upload_url"].split("{")[0]
    for os_name, a in build["assets"].items():
        old = present.get(a["name"])
        if old and old["size"] == a["bytes"] and old.get("state") == "uploaded":
            logger.info("{}: {} already uploaded", os_name, a["name"])
            continue
        if old:
            api("DELETE", old["url"], token)
            logger.info("{}: removed the incomplete {}", os_name, a["name"])
        logger.info("{}: uploading {} ({} MB)...", os_name, a["name"], a["bytes"] // 1048576)
        with a["path"].open("rb") as f:
            status, asset = api("POST", f"{upload}?name={urllib.parse.quote(a['name'])}", token, data=f,
                                headers={"Content-Type": "application/octet-stream", "Content-Length": str(a["bytes"])})
        if status != 201:
            sys.exit(f"upload {a['name']}: HTTP {status} {asset}")
        logger.info("{}: uploaded {}", os_name, asset["browser_download_url"])


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dist", type=Path, default=Path("D:/Dev/tower-foundry/builds/dist"))
    parser.add_argument("--repo", default="mazamaka/ember-foundry-game")
    parser.add_argument("--publish", action="store_true")
    args = parser.parse_args()
    logger.info("release: dist {}, repo {}, publish {}", args.dist, args.repo, args.publish)
    build = load_build(args.dist)
    if args.publish:
        token = os.environ.get("GITHUB_TOKEN")
        if not token:
            sys.exit("GITHUB_TOKEN is not set")
        publish(build, args.repo, token)
    write_site_json(build, args.repo)


if __name__ == "__main__":
    main()
