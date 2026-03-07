# ==========================================================
# MUSIC ROUTES (Enhanced)
# ==========================================================

from fastapi import APIRouter, Depends, Body
from sqlalchemy.orm import Session
from app.database import get_db
from app.schemas.music import MusicCreate, MusicFavoriteAdd
from app.services.music_service import (
    upload_music,
    get_music_feed,
    add_favorite_music,
    remove_favorite_music,
    get_user_favorites,
    update_music,
    delete_music,
)
from app.core.dependencies import get_current_user

router = APIRouter(prefix="/music", tags=["Music"])


# ==========================================================
# UPLOAD MUSIC (User publishes a track)
# POST /music/
# ==========================================================

@router.post("/")
def upload(data: MusicCreate,
           db: Session = Depends(get_db),
           current_user=Depends(get_current_user)):
    """Upload a new music track"""
    return upload_music(db, current_user, data)


# ==========================================================
# GET MUSIC FEED (Discover)
# GET /music/
# ==========================================================

@router.get("/")
def list(page: int = 1,
         limit: int = 20,
         db: Session = Depends(get_db)):
    """Get all music tracks"""
    return get_music_feed(db, page, limit)


# ==========================================================
# ADD TO PLAYLIST (Favorite)
# POST /music/favorites/
# ==========================================================

@router.post("/favorites/")
def add_to_favorites(data: MusicFavoriteAdd,
                     db: Session = Depends(get_db),
                     current_user=Depends(get_current_user)):
    """Add music to user's playlist"""
    return add_favorite_music(db, current_user, data.music_id)


# ==========================================================
# REMOVE FROM PLAYLIST
# DELETE /music/favorites/{music_id}
# ==========================================================

@router.delete("/favorites/{music_id}")
def remove_from_favorites(music_id: int,
                          db: Session = Depends(get_db),
                          current_user=Depends(get_current_user)):
    """Remove music from user's playlist"""
    return remove_favorite_music(db, current_user, music_id)


# ==========================================================
# GET USER'S PLAYLIST
# GET /music/favorites/{user_id}
# ==========================================================

@router.get("/favorites/{user_id}")
def get_playlist(user_id: int,
                 db: Session = Depends(get_db)):
    """Get user's favorite music playlist"""
    return get_user_favorites(db, user_id)


@router.patch("/{music_id}")
def edit_music(music_id: int,
               data: dict = Body(...),
               db: Session = Depends(get_db),
               current_user=Depends(get_current_user)):
    return update_music(
        db,
        current_user,
        music_id,
        data.get("title"),
        data.get("artist"),
    )


@router.delete("/{music_id}")
def remove_music(music_id: int,
                 db: Session = Depends(get_db),
                 current_user=Depends(get_current_user)):
    return delete_music(db, current_user, music_id)
