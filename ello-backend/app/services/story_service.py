# ==========================================================
# FILE: app/services/story_service.py
# MODULE: STORY SERVICE (IMAGES)
# RESPONSIBILITY:
# - Create story with image
# - Delete story
# - Get stories timeline
# ==========================================================

from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from fastapi import HTTPException
from pathlib import Path
import os
import subprocess
from app.models.story import Story
from app.models.follow import Follow
from app.models.like import Like
from sqlalchemy.orm import joinedload
from sqlalchemy import func


VIDEO_EXTENSIONS = {'.mp4', '.mov', '.m4v', '.webm', '.mkv', '.avi'}


def _extract_path_from_media_url(media_url: str) -> str:
    clean_url = media_url.split('?', 1)[0].split('#', 1)[0].strip()
    if clean_url.startswith('http://') or clean_url.startswith('https://'):
        clean_url = clean_url.split('://', 1)[1]
        slash_index = clean_url.find('/')
        clean_url = clean_url[slash_index:] if slash_index >= 0 else ''
    return clean_url


def _resolve_local_media_path(media_url: str) -> Path | None:
    path_part = _extract_path_from_media_url(media_url)
    if not path_part:
        return None

    if '/uploads/' in path_part:
        suffix = path_part.split('/uploads/', 1)[1].lstrip('/')
        return Path('/app/uploads') / suffix

    candidate = Path(path_part)
    if candidate.is_absolute():
        return candidate

    return None


def _is_video_story_media(media_url: str) -> bool:
    path_part = _extract_path_from_media_url(media_url).lower()
    if '/videos/' in path_part:
        return True
    extension = os.path.splitext(path_part)[1]
    return extension in VIDEO_EXTENSIONS


def _get_video_duration_seconds(file_path: Path) -> float:
    command = [
        'ffprobe',
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        str(file_path),
    ]
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        raise HTTPException(status_code=400, detail='Nao foi possivel validar o video do story')

    raw = (result.stdout or '').strip()
    try:
        return float(raw)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail='Nao foi possivel validar o video do story') from exc


def _validate_story_video_duration(media_url: str):
    if not _is_video_story_media(media_url):
        return

    local_path = _resolve_local_media_path(media_url)
    if not local_path or not local_path.exists() or not local_path.is_file():
        raise HTTPException(status_code=400, detail='Video do story invalido')

    duration = _get_video_duration_seconds(local_path)
    if duration > 30:
        raise HTTPException(status_code=400, detail='Videos de story podem ter no maximo 30 segundos')


def create_story(db: Session, current_user, media_url: str, text: str | None = None):
    """Create a new story (expires in 24h)"""

    _validate_story_video_duration(media_url)
    
    now = datetime.utcnow()
    expires_at = now + timedelta(hours=24)
    
    story = Story(
        user_id=current_user.id,
        media_url=media_url,
        text=text,
        expires_at=expires_at
    )
    
    db.add(story)
    db.commit()
    db.refresh(story)
    
    return story


def get_stories(db: Session, current_user):
    """Get active stories from users (24h expiration)"""
    
    now = datetime.utcnow()

    query = db.query(Story).options(joinedload(Story.author)).filter(
        Story.expires_at > now
    )

    # When authenticated, prioritize own + followed users stories.
    if current_user is not None:
        following_ids = db.query(Follow.following_id).filter(
            Follow.follower_id == current_user.id
        ).all()
        allowed_ids = {current_user.id, *[f[0] for f in following_ids]}
        query = query.filter(Story.user_id.in_(allowed_ids))

    stories = query.order_by(Story.created_at.desc()).all()
    story_ids = [story.id for story in stories]

    likes_count_map = {}
    liked_story_ids = set()

    if story_ids:
        rows = db.query(Like.content_id, func.count(Like.id)).filter(
            Like.content_type == 'story',
            Like.content_id.in_(story_ids)
        ).group_by(Like.content_id).all()
        likes_count_map = {content_id: count for content_id, count in rows}

        if current_user is not None:
            liked_rows = db.query(Like.content_id).filter(
                Like.content_type == 'story',
                Like.user_id == current_user.id,
                Like.content_id.in_(story_ids)
            ).all()
            liked_story_ids = {content_id for (content_id,) in liked_rows}

    result = []
    for story in stories:
        result.append({
            "id": story.id,
            "user_id": story.user_id,
            "media_url": story.media_url,
            "text": story.text,
            "created_at": story.created_at,
            "expires_at": story.expires_at,
            "author": {
                "id": story.author.id,
                "full_name": story.author.full_name,
                "username": story.author.username,
                "avatar_url": story.author.avatar_url,
                "mood": story.author.mood,
            } if story.author else None,
            "likes_count": likes_count_map.get(story.id, 0),
            "is_liked": story.id in liked_story_ids,
        })

    return result


def delete_story(db: Session, current_user, story_id: int):
    """Delete a story (only by owner)"""
    
    story = db.query(Story).filter(Story.id == story_id).first()
    
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")
    
    if story.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this story")
    
    db.delete(story)
    db.commit()
    
    return {"message": "Story deleted"}


def update_story_text(db: Session, current_user, story_id: int, text: str | None):
    story = db.query(Story).filter(Story.id == story_id).first()

    if not story:
        raise HTTPException(status_code=404, detail="Story not found")

    if story.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to edit this story")

    story.text = (text or '').strip() or None
    db.commit()
    db.refresh(story)

    return story
