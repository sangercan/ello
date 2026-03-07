from __future__ import annotations

from pathlib import Path
from urllib.parse import urlsplit

from app.database import SessionLocal
from app.models.moment import Moment
from app.models.story import Story
from app.models.vibe import Vibe
from app.routes.upload import MEDIA_PROFILE_SIZES, _normalize_image_to_canvas, _normalize_video_to_canvas

VIDEO_EXTENSIONS = {".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi", ".3gp", ".m3u8"}


def _strip_query_and_hash(url: str) -> str:
    return url.split("?", 1)[0].split("#", 1)[0].strip()


def _resolve_local_upload_path(url: str) -> Path | None:
    clean = _strip_query_and_hash(url)

    if clean.startswith("http://") or clean.startswith("https://"):
        parsed = urlsplit(clean)
        clean = parsed.path

    if "/uploads/" not in clean:
        return None

    suffix = clean.split("/uploads/", 1)[1].lstrip("/")
    if not suffix:
        return None

    path = Path("/app/uploads") / suffix
    return path


def _is_video_url(url: str) -> bool:
    clean = _strip_query_and_hash(url).lower()
    if "/videos/" in clean:
        return True
    return Path(clean).suffix.lower() in VIDEO_EXTENSIONS


def _build_normalized_path(current_path: Path, extension: str, profile: str) -> Path:
    suffix_token = f"_std_{profile}"
    stem = current_path.stem
    if not stem.endswith(suffix_token):
        stem = f"{stem}{suffix_token}"
    return current_path.with_name(f"{stem}.{extension}")


def _rebuild_url(original_url: str, new_local_path: Path) -> str:
    try:
        rel = str(new_local_path).replace("\\", "/")
        marker = "/uploads/"
        idx = rel.find(marker)
        if idx < 0:
            return original_url

        new_path = rel[idx:]
        if original_url.startswith("http://") or original_url.startswith("https://"):
            parsed = urlsplit(original_url)
            return f"{parsed.scheme}://{parsed.netloc}{new_path}"

        return new_path
    except Exception:
        return original_url


def _normalize_file_for_profile(media_url: str, profile: str) -> tuple[str, bool, str]:
    target = MEDIA_PROFILE_SIZES[profile]
    local_path = _resolve_local_upload_path(media_url)
    if not local_path or not local_path.exists() or not local_path.is_file():
        return media_url, False, "arquivo nao encontrado"

    original_bytes = local_path.read_bytes()

    if _is_video_url(media_url):
        payload, extension = _normalize_video_to_canvas(original_bytes, target[0], target[1])
    else:
        payload, extension = _normalize_image_to_canvas(original_bytes, target[0], target[1])

    new_path = _build_normalized_path(local_path, extension, profile)
    new_path.write_bytes(payload)

    if new_path != local_path:
        try:
            local_path.unlink(missing_ok=True)
        except Exception:
            pass

    new_url = _rebuild_url(media_url, new_path)
    return new_url, True, "ok"


def _process_moments(db) -> tuple[int, int]:
    total = 0
    changed = 0
    rows = db.query(Moment).filter(Moment.media_url.isnot(None)).all()

    for row in rows:
        total += 1
        try:
            new_url, processed, _ = _normalize_file_for_profile(str(row.media_url), "moment")
            if processed and new_url != row.media_url:
                row.media_url = new_url
                changed += 1
        except Exception as exc:
            print(f"[moments] erro id={row.id}: {exc}")

    return total, changed


def _process_stories(db) -> tuple[int, int]:
    total = 0
    changed = 0
    rows = db.query(Story).filter(Story.media_url.isnot(None)).all()

    for row in rows:
        total += 1
        try:
            new_url, processed, _ = _normalize_file_for_profile(str(row.media_url), "story")
            if processed and new_url != row.media_url:
                row.media_url = new_url
                changed += 1
        except Exception as exc:
            print(f"[stories] erro id={row.id}: {exc}")

    return total, changed


def _process_vibes(db) -> tuple[int, int]:
    total = 0
    changed = 0
    rows = db.query(Vibe).filter(Vibe.video_url.isnot(None)).all()

    for row in rows:
        total += 1
        try:
            new_url, processed, _ = _normalize_file_for_profile(str(row.video_url), "vibe")
            if processed and new_url != row.video_url:
                row.video_url = new_url
                changed += 1
        except Exception as exc:
            print(f"[vibes] erro id={row.id}: {exc}")

    return total, changed


def main() -> None:
    db = SessionLocal()
    try:
        print("Iniciando reprocessamento de midias antigas...")

        m_total, m_changed = _process_moments(db)
        s_total, s_changed = _process_stories(db)
        v_total, v_changed = _process_vibes(db)

        db.commit()

        print("Reprocessamento concluido")
        print(f"Moments: {m_changed}/{m_total} atualizados")
        print(f"Stories: {s_changed}/{s_total} atualizados")
        print(f"Vibes: {v_changed}/{v_total} atualizados")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
