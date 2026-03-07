# ==========================================================
# FILE: app/services/music_service.py
# MODULE: MUSIC SERVICE
# RESPONSIBILITY:
# - Upload music
# - Get music feed
# - Add/remove favorite music (playlist)
# ==========================================================

from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.models.music import Music
from app.models.music_favorite import MusicFavorite


def upload_music(db: Session, current_user, data):
    """Upload a new music track"""
    
    music = Music(
        title=data.title,
        artist=data.artist,
        audio_url=data.audio_url,
        album_cover=data.album_cover,
        uploaded_by=current_user.id
    )

    db.add(music)
    db.commit()
    db.refresh(music)

    return music


def get_music_feed(db: Session, page, limit):
    """Get all music tracks with pagination"""
    
    offset = (page - 1) * limit

    return db.query(Music) \
        .order_by(Music.created_at.desc()) \
        .offset(offset) \
        .limit(limit) \
        .all()


def add_favorite_music(db: Session, current_user, music_id: int):
    """Add music to user's playlist (favorites)"""
    
    # Check if music exists
    music = db.query(Music).filter(Music.id == music_id).first()
    if not music:
        raise HTTPException(status_code=404, detail="Music not found")
    
    # Check if already favorited
    existing = db.query(MusicFavorite).filter(
        MusicFavorite.user_id == current_user.id,
        MusicFavorite.music_id == music_id
    ).first()
    
    if existing:
        raise HTTPException(status_code=400, detail="Music already in playlist")
    
    favorite = MusicFavorite(
        user_id=current_user.id,
        music_id=music_id
    )
    
    db.add(favorite)
    db.commit()
    db.refresh(favorite)
    
    return favorite


def remove_favorite_music(db: Session, current_user, music_id: int):
    """Remove music from user's playlist"""
    
    favorite = db.query(MusicFavorite).filter(
        MusicFavorite.user_id == current_user.id,
        MusicFavorite.music_id == music_id
    ).first()
    
    if not favorite:
        raise HTTPException(status_code=404, detail="Music not in playlist")
    
    db.delete(favorite)
    db.commit()
    
    return {"message": "Music removed from playlist"}


def get_user_favorites(db: Session, user_id: int):
    """Get user's favorite music playlist"""
    
    favorites = db.query(MusicFavorite).filter(
        MusicFavorite.user_id == user_id
    ).order_by(MusicFavorite.created_at.desc()).all()
    
    # Join with Music table to get full details
    music_list = []
    for fav in favorites:
        music = db.query(Music).filter(Music.id == fav.music_id).first()
        if music:
            music_list.append(music)
    
    return music_list


def update_music(db: Session, current_user, music_id: int, title: str | None, artist: str | None):
    music = db.query(Music).filter(Music.id == music_id).first()
    if not music:
        raise HTTPException(status_code=404, detail="Music not found")

    if music.uploaded_by != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    next_title = (title or '').strip()
    next_artist = (artist or '').strip()

    if not next_title:
        raise HTTPException(status_code=400, detail="Title is required")

    if not next_artist:
        raise HTTPException(status_code=400, detail="Artist is required")

    music.title = next_title
    music.artist = next_artist
    db.commit()
    db.refresh(music)
    return music


def delete_music(db: Session, current_user, music_id: int):
    music = db.query(Music).filter(Music.id == music_id).first()
    if not music:
        raise HTTPException(status_code=404, detail="Music not found")

    if music.uploaded_by != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    db.query(MusicFavorite).filter(MusicFavorite.music_id == music_id).delete(synchronize_session=False)
    db.delete(music)
    db.commit()
    return {"message": "Music deleted", "music_id": music_id}
