from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session
from datetime import datetime
from io import BytesIO
from PIL import Image, ImageFilter, ImageOps, UnidentifiedImageError
import base64
import os
import shutil
import subprocess
import tempfile
import zipfile

from app.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User

router = APIRouter(prefix="/upload", tags=["Upload"])


MAX_IMAGE_DIMENSION = 1920
MAX_VIDEO_WIDTH = 1280
IMAGE_WEBP_QUALITY = 82

MEDIA_PROFILE_SIZES: dict[str, tuple[int, int]] = {
    "moment": (1080, 1350),
    "story": (1080, 1920),
    "vibe": (1080, 1920),
}

MIME_TO_EXTENSION: dict[str, str] = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/bmp": "bmp",
    "image/heic": "heic",
    "image/heif": "heif",
    "image/avif": "avif",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/webm": "webm",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/aac": "aac",
}

IMAGE_EXTENSIONS = {
    "jpg", "jpeg", "png", "webp", "gif", "bmp", "heic", "heif", "avif",
}
VIDEO_EXTENSIONS = {
    "mp4", "mov", "webm", "avi", "mkv", "m4v", "3gp",
}
AUDIO_EXTENSIONS = {
    "mp3", "m4a", "aac", "wav", "ogg", "oga", "opus", "flac",
}
BASE64_TEXT_CHARS = set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=_- \r\n\t")


def _build_filename(media_type: str, user_id: int, original_name: str) -> str:
    safe_name = os.path.basename(original_name).replace(" ", "_")
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    return f"{media_type}_{user_id}_{timestamp}_{safe_name}"


def _extract_extension(original_name: str) -> str:
    return os.path.splitext(original_name or "")[1].lower().lstrip(".")


def _infer_media_type(mime: str, filename: str) -> str:
    if mime.startswith("image/"):
        return "image"
    if mime.startswith("video/"):
        return "video"
    if mime.startswith("audio/"):
        return "audio"

    ext = _extract_extension(filename)
    if ext in IMAGE_EXTENSIONS:
        return "image"
    if ext in VIDEO_EXTENSIONS:
        return "video"
    if ext in AUDIO_EXTENSIONS:
        return "audio"
    return "document"


def _resolve_extension(mime: str, original_name: str, fallback: str = "bin") -> str:
    if mime in MIME_TO_EXTENSION:
        return MIME_TO_EXTENSION[mime]

    ext = _extract_extension(original_name)
    if ext:
        return ext

    return fallback


def _is_generic_mime(mime: str) -> bool:
    normalized = (mime or "").strip().lower()
    return normalized in {
        "",
        "application/octet-stream",
        "binary/octet-stream",
        "text/plain",
    }


def _detect_mime_by_signature(file_bytes: bytes) -> str | None:
    if not file_bytes:
        return None

    head = file_bytes[:64]

    if head.startswith(b"\xFF\xD8\xFF"):
        return "image/jpeg"
    if head.startswith(b"\x89PNG\r\n\x1A\n"):
        return "image/png"
    if head.startswith((b"GIF87a", b"GIF89a")):
        return "image/gif"
    if head.startswith(b"BM"):
        return "image/bmp"
    if head.startswith(b"RIFF") and len(head) >= 12 and head[8:12] == b"WEBP":
        return "image/webp"

    if len(file_bytes) >= 12 and file_bytes[4:8] == b"ftyp":
        brand = file_bytes[8:12].decode("ascii", errors="ignore").lower()
        if brand in {"heic", "heix", "hevc", "hevx", "mif1", "msf1"}:
            return "image/heic"
        if brand in {"heif"}:
            return "image/heif"
        if brand in {"avif", "avis"}:
            return "image/avif"
        if brand in {"isom", "iso2", "mp41", "mp42", "3gp4", "3gp5", "qt  "}:
            return "video/mp4"
        if brand in {"m4a ", "m4b ", "m4p "}:
            return "audio/mp4"

    if head.startswith(b"\x1A\x45\xDF\xA3"):
        return "video/webm"
    if head.startswith(b"ID3"):
        return "audio/mpeg"
    if head.startswith(b"RIFF") and len(head) >= 12 and head[8:12] == b"WAVE":
        return "audio/wav"
    if head.startswith(b"OggS"):
        return "audio/ogg"

    return None


def _decode_data_url_if_needed(file_bytes: bytes) -> tuple[bytes, str | None]:
    """Decode `data:*;base64,...` payloads sent as plain text by some webviews."""
    if not file_bytes:
        return file_bytes, None

    head = file_bytes[:256]
    if not head.startswith(b"data:") or b";base64," not in head:
        return file_bytes, None

    try:
        text = file_bytes.decode("utf-8", errors="strict")
        header, payload = text.split(",", 1)
        if ";base64" not in header:
            return file_bytes, None

        mime = header[5:].split(";")[0].strip().lower() or None
        decoded = base64.b64decode(payload, validate=True)
        return decoded, mime
    except Exception:
        return file_bytes, None


def _decode_raw_base64_if_needed(file_bytes: bytes) -> bytes:
    """Decode plain base64 payload (without data URL header) when detected."""
    if not file_bytes:
        return file_bytes

    sample = file_bytes[:4096]
    try:
        text_sample = sample.decode("ascii")
    except UnicodeDecodeError:
        return file_bytes

    if not text_sample:
        return file_bytes

    if any(ch not in BASE64_TEXT_CHARS for ch in text_sample):
        return file_bytes

    try:
        text = file_bytes.decode("ascii")
    except UnicodeDecodeError:
        return file_bytes

    compact = "".join(text.split())
    if len(compact) < 128:
        return file_bytes

    padded = compact + ("=" * ((4 - (len(compact) % 4)) % 4))
    try:
        decoded = base64.b64decode(padded, validate=True)
    except Exception:
        return file_bytes

    if not decoded:
        return file_bytes

    if _detect_mime_by_signature(decoded):
        return decoded

    return file_bytes


def _optimize_image_bytes(file_bytes: bytes, mime: str) -> tuple[bytes, str]:
    """Optimize image size while keeping visual quality high."""
    # Prefer libvips for speed/compression ratio. Keep Pillow as safe fallback.
    try:
        return _optimize_image_bytes_vips(file_bytes, mime)
    except Exception:
        return _optimize_image_bytes_pillow(file_bytes, mime)


def _optimize_image_bytes_vips(file_bytes: bytes, mime: str) -> tuple[bytes, str]:
    vipsthumbnail_bin = shutil.which("vipsthumbnail")
    if not vipsthumbnail_bin:
        raise RuntimeError("vipsthumbnail not found in runtime")

    ext_map = {
        "image/jpeg": ".jpg",
        "image/jpg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/gif": ".gif",
        "image/heic": ".heic",
        "image/heif": ".heif",
        "image/avif": ".avif",
    }
    in_ext = ext_map.get(mime, ".img")

    with tempfile.NamedTemporaryFile(delete=False, suffix=in_ext) as temp_in:
        temp_in.write(file_bytes)
        temp_in.flush()
        in_path = temp_in.name

    with tempfile.NamedTemporaryFile(delete=False, suffix=".webp") as temp_out:
        out_path = temp_out.name

    try:
        cmd = [
            vipsthumbnail_bin,
            in_path,
            "-s",
            str(MAX_IMAGE_DIMENSION),
            "-o",
            f"{out_path}[Q={IMAGE_WEBP_QUALITY},strip]",
        ]

        proc = subprocess.run(cmd, capture_output=True, check=False, timeout=180)
        if proc.returncode != 0:
            stderr = proc.stderr.decode("utf-8", errors="ignore")
            raise RuntimeError(f"libvips thumbnail failed: {stderr[:500]}")

        with open(out_path, "rb") as f:
            compressed = f.read()

        if not compressed:
            raise RuntimeError("libvips produced empty output")

        return compressed, "webp"
    finally:
        for path in (in_path, out_path):
            try:
                os.remove(path)
            except OSError:
                pass


def _optimize_image_bytes_pillow(file_bytes: bytes, mime: str) -> tuple[bytes, str]:
    """Pillow fallback optimizer when libvips is unavailable/fails."""
    with Image.open(BytesIO(file_bytes)) as img:
        img = ImageOps.exif_transpose(img)

        # Avoid huge uploads by bounding max side; keeps aspect ratio.
        if max(img.size) > MAX_IMAGE_DIMENSION:
            img.thumbnail((MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION), Image.Resampling.LANCZOS)

        output = BytesIO()
        has_alpha = "A" in img.getbands()

        # Preserve transparency with PNG, otherwise use high-quality JPEG.
        if mime == "image/png" or has_alpha:
            img.save(output, format="PNG", optimize=True, compress_level=6)
            extension = "png"
        else:
            if img.mode != "RGB":
                img = img.convert("RGB")
            img.save(
                output,
                format="JPEG",
                quality=92,
                optimize=True,
                progressive=True,
            )
            extension = "jpg"

        return output.getvalue(), extension


def _compress_video_bytes(file_bytes: bytes) -> tuple[bytes, str]:
    """Transcode videos to H.264/AAC MP4 to reduce size while preserving quality."""
    ffmpeg_bin = shutil.which("ffmpeg")
    if not ffmpeg_bin:
        raise RuntimeError("ffmpeg not found in runtime")

    with tempfile.NamedTemporaryFile(delete=False, suffix=".input") as temp_in:
        temp_in.write(file_bytes)
        temp_in.flush()
        in_path = temp_in.name

    with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as temp_out:
        out_path = temp_out.name

    try:
        cmd = [
            ffmpeg_bin,
            "-y",
            "-i",
            in_path,
            "-vf",
            f"scale='min(iw,{MAX_VIDEO_WIDTH})':-2",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "28",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            "-movflags",
            "+faststart",
            out_path,
        ]

        proc = subprocess.run(cmd, capture_output=True, check=False)
        if proc.returncode != 0:
            stderr = proc.stderr.decode("utf-8", errors="ignore")
            raise RuntimeError(f"ffmpeg transcode failed: {stderr[:500]}")

        with open(out_path, "rb") as f:
            compressed = f.read()

        return compressed, "mp4"
    finally:
        for path in (in_path, out_path):
            try:
                os.remove(path)
            except OSError:
                pass


def _normalize_image_to_canvas(file_bytes: bytes, target_width: int, target_height: int) -> tuple[bytes, str]:
    """Create a standard canvas preserving full media content (no crop) with blurred fill."""
    with Image.open(BytesIO(file_bytes)) as img:
        img = ImageOps.exif_transpose(img)

        if img.mode != "RGB":
            img = img.convert("RGB")

        # Background covers full canvas, foreground contains full content without crop.
        background = ImageOps.fit(
            img,
            (target_width, target_height),
            method=Image.Resampling.LANCZOS,
            centering=(0.5, 0.5),
        ).filter(ImageFilter.GaussianBlur(radius=26))

        foreground = ImageOps.contain(
            img,
            (target_width, target_height),
            method=Image.Resampling.LANCZOS,
        )

        canvas = background.copy()
        paste_x = (target_width - foreground.width) // 2
        paste_y = (target_height - foreground.height) // 2
        canvas.paste(foreground, (paste_x, paste_y))

        output = BytesIO()
        # High-quality WebP keeps details while still reducing upload/storage size.
        canvas.save(
            output,
            format="WEBP",
            quality=95,
            method=6,
        )
        return output.getvalue(), "webp"


def _normalize_video_to_canvas(file_bytes: bytes, target_width: int, target_height: int) -> tuple[bytes, str]:
    """Normalize video to a standard canvas without cropping main content."""
    ffmpeg_bin = shutil.which("ffmpeg")
    if not ffmpeg_bin:
        raise RuntimeError("ffmpeg not found in runtime")

    with tempfile.NamedTemporaryFile(delete=False, suffix=".input") as temp_in:
        temp_in.write(file_bytes)
        temp_in.flush()
        in_path = temp_in.name

    with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as temp_out:
        out_path = temp_out.name

    try:
        filter_complex = (
            f"[0:v]scale={target_width}:{target_height}:force_original_aspect_ratio=increase,"
            f"crop={target_width}:{target_height}[bg];"
            f"[0:v]scale={target_width}:{target_height}:force_original_aspect_ratio=decrease[fg];"
            f"[bg][fg]overlay=(W-w)/2:(H-h)/2,format=yuv420p[v]"
        )

        cmd = [
            ffmpeg_bin,
            "-y",
            "-i",
            in_path,
            "-filter_complex",
            filter_complex,
            "-map",
            "[v]",
            "-map",
            "0:a?",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "24",
            "-c:a",
            "aac",
            "-b:a",
            "160k",
            "-movflags",
            "+faststart",
            out_path,
        ]

        proc = subprocess.run(cmd, capture_output=True, check=False, timeout=180)
        if proc.returncode != 0:
            stderr = proc.stderr.decode("utf-8", errors="ignore")
            raise RuntimeError(f"ffmpeg normalize failed: {stderr[:500]}")

        with open(out_path, "rb") as f:
            normalized = f.read()

        if not normalized:
            raise RuntimeError("ffmpeg normalize produced empty output")

        return normalized, "mp4"
    finally:
        for path in (in_path, out_path):
            try:
                os.remove(path)
            except OSError:
                pass


def _compress_document_bytes(file_bytes: bytes, original_name: str) -> tuple[bytes, str]:
    """Compress documents into ZIP to reduce storage usage safely."""
    output = BytesIO()
    entry_name = os.path.basename(original_name) or "document"

    with zipfile.ZipFile(output, mode="w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        zf.writestr(entry_name, file_bytes)

    zipped = output.getvalue()
    return zipped, "zip"


def _compress_audio_bytes(file_bytes: bytes) -> tuple[bytes, str]:
    """Transcode audio to AAC in M4A container to reduce size while keeping good quality."""
    ffmpeg_bin = shutil.which("ffmpeg")
    if not ffmpeg_bin:
        raise RuntimeError("ffmpeg not found in runtime")

    with tempfile.NamedTemporaryFile(delete=False, suffix=".input") as temp_in:
        temp_in.write(file_bytes)
        temp_in.flush()
        in_path = temp_in.name

    with tempfile.NamedTemporaryFile(delete=False, suffix=".m4a") as temp_out:
        out_path = temp_out.name

    try:
        cmd = [
            ffmpeg_bin,
            "-y",
            "-i",
            in_path,
            "-vn",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            "-movflags",
            "+faststart",
            out_path,
        ]

        proc = subprocess.run(cmd, capture_output=True, check=False)
        if proc.returncode != 0:
            stderr = proc.stderr.decode("utf-8", errors="ignore")
            raise RuntimeError(f"ffmpeg audio transcode failed: {stderr[:500]}")

        with open(out_path, "rb") as f:
            compressed = f.read()

        if not compressed:
            raise RuntimeError("ffmpeg audio transcode produced empty output")

        return compressed, "m4a"
    finally:
        for path in (in_path, out_path):
            try:
                os.remove(path)
            except OSError:
                pass


@router.post("/")
def upload_file(
    file: UploadFile = File(...),
    context: str | None = Form(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload image/video/document and return public URL under /uploads."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="Invalid file")

    mime = (file.content_type or "").lower()
    media_type = _infer_media_type(mime, file.filename)

    folder_by_media_type = {
        "image": "images",
        "video": "videos",
        "audio": "audio",
        "document": "documents",
    }

    file_bytes = file.file.read()
    file_bytes, decoded_mime = _decode_data_url_if_needed(file_bytes)
    if decoded_mime:
        mime = decoded_mime

    if _is_generic_mime(mime) or mime.startswith("text/"):
        file_bytes = _decode_raw_base64_if_needed(file_bytes)

    sniffed_mime = _detect_mime_by_signature(file_bytes)
    if sniffed_mime:
        sniffed_media_type = _infer_media_type(sniffed_mime, file.filename)
        if _is_generic_mime(mime) or sniffed_media_type != media_type:
            mime = sniffed_mime
            media_type = sniffed_media_type

    if not file_bytes:
        raise HTTPException(status_code=400, detail="Arquivo vazio ou invalido")

    uploads_subdir = folder_by_media_type.get(media_type, "documents")
    uploads_dir = f"/app/uploads/{uploads_subdir}"
    os.makedirs(uploads_dir, exist_ok=True)

    unique_filename = _build_filename(media_type, current_user.id, file.filename)

    normalized_context = (context or "").strip().lower()
    target_size = MEDIA_PROFILE_SIZES.get(normalized_context)

    try:
        if media_type == "image":
            try:
                if target_size:
                    payload, extension = _normalize_image_to_canvas(file_bytes, target_size[0], target_size[1])
                else:
                    payload, extension = _optimize_image_bytes(file_bytes, mime)
            except (UnidentifiedImageError, OSError, ValueError):
                # Fallback for unsupported decoders (e.g. HEIC/HEIF/AVIF on some runtimes).
                payload = file_bytes
                extension = _resolve_extension(mime, file.filename, fallback="jpg")
        elif media_type == "video":
            if target_size:
                payload, extension = _normalize_video_to_canvas(file_bytes, target_size[0], target_size[1])
            else:
                payload, extension = _compress_video_bytes(file_bytes)
        elif media_type == "audio":
            payload, extension = _compress_audio_bytes(file_bytes)
        else:
            payload, extension = _compress_document_bytes(file_bytes, file.filename)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Falha ao comprimir arquivo: {exc}") from exc

    unique_filename = os.path.splitext(unique_filename)[0] + f".{extension}"

    filepath = os.path.join(uploads_dir, unique_filename)
    with open(filepath, "wb") as out:
        out.write(payload)

    return {
        "success": True,
        "media_type": media_type,
        "filename": unique_filename,
        "url": f"/uploads/{uploads_subdir}/{unique_filename}",
    }


@router.post("")
def upload_file_no_slash(
    file: UploadFile = File(...),
    context: str | None = Form(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Alias route to accept POST /upload without trailing slash."""
    return upload_file(file=file, context=context, db=db, current_user=current_user)
