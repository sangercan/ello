# ==========================================================
# FILE: app/services/nearby_service.py
# MODULE: REAL GEO NEARBY SERVICE (PRODUCTION READY)
# ==========================================================

from sqlalchemy.orm import Session
from app.models.user import User
from app.models.nearby_favorite import NearbyFavorite
from app.models.user_block import UserBlock
from app.models.moment import Moment
from app.models.vibe import Vibe
from math import radians, cos, sin, asin, sqrt
from datetime import datetime, timezone, timedelta


# ----------------------------------------------------------
# HAVERSINE DISTANCE (KM)
# ----------------------------------------------------------

def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371  # Earth radius in km

    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)

    a = (
        sin(dlat / 2) ** 2
        + cos(radians(lat1))
        * cos(radians(lat2))
        * sin(dlon / 2) ** 2
    )

    c = 2 * asin(sqrt(a))

    return R * c


# ----------------------------------------------------------
# GET NEARBY USERS
# ----------------------------------------------------------

def get_nearby_users(
    db: Session,
    current_user: User,
    radius_km: float = 5
):

    cutoff = datetime.now(timezone.utc) - timedelta(minutes=20)

    # Do not auto-hide on inactivity. Visibility changes only on explicit toggle/logout/app close.
    if not current_user.is_online:
        return []

    # 🚨 Garantir que o usuário tenha localização válida
    if current_user.latitude is None or current_user.longitude is None:
        return []

    # � IMPORTANTE: Se o usuário NÃO está visível, ele não vê ninguém
    # (privacidade mútua - se você não quer ser visto, você não vê)
    if not current_user.is_visible_nearby:
        return []

    # �🔍 Buscar apenas usuários visíveis + online + com localização
    users = db.query(User).filter(
        User.id != current_user.id,
        User.latitude.isnot(None),
        User.longitude.isnot(None),
        User.is_online == True,
        User.is_visible_nearby == True,
    ).all()

    blocked_ids = {
        row.blocked_id
        for row in db.query(UserBlock).filter(UserBlock.blocker_id == current_user.id).all()
    }
    blocked_by_ids = {
        row.blocker_id
        for row in db.query(UserBlock).filter(UserBlock.blocked_id == current_user.id).all()
    }
    hidden_ids = blocked_ids.union(blocked_by_ids)

    favorite_ids = {
        row.favorite_user_id
        for row in db.query(NearbyFavorite).filter(
            NearbyFavorite.user_id == current_user.id
        ).all()
    }

    nearby = []

    for user in users:
        if user.id in hidden_ids:
            continue

        if user.last_activity_at is None or user.last_activity_at < cutoff:
            # Keep visibility as-is; just skip stale users.
            continue

        distance = haversine(
            current_user.latitude,
            current_user.longitude,
            user.latitude,
            user.longitude
        )

        if distance <= radius_km:
            nearby.append({
                "id": user.id,
                "username": user.username,
                "avatar_url": user.avatar_url,
                "mood": user.mood,
                "distance_km": round(distance, 2),
                "is_online": user.is_online,
                "is_favorite": user.id in favorite_ids,
            })

    if db.dirty:
        db.commit()

    # 📏 Ordenar por proximidade
    return sorted(nearby, key=lambda x: x["distance_km"])


def list_nearby_favorites(db: Session, current_user: User):
    rows = db.query(NearbyFavorite).filter(
        NearbyFavorite.user_id == current_user.id
    ).all()
    favorite_ids = [row.favorite_user_id for row in rows]
    if not favorite_ids:
        return []

    users = db.query(User).filter(User.id.in_(favorite_ids)).all()

    blocked_ids = {
        row.blocked_id
        for row in db.query(UserBlock).filter(UserBlock.blocker_id == current_user.id).all()
    }
    blocked_by_ids = {
        row.blocker_id
        for row in db.query(UserBlock).filter(UserBlock.blocked_id == current_user.id).all()
    }
    hidden_ids = blocked_ids.union(blocked_by_ids)

    mapped = []
    for user in users:
        if user.id in hidden_ids:
            continue
        if user.latitude is None or user.longitude is None or current_user.latitude is None or current_user.longitude is None:
            continue
        mapped.append({
            "id": user.id,
            "username": user.username,
            "avatar_url": user.avatar_url,
            "mood": user.mood,
            "distance_km": round(haversine(current_user.latitude, current_user.longitude, user.latitude, user.longitude), 2),
            "is_online": bool(
                user.is_online and user.last_activity_at and user.last_activity_at >= (datetime.now(timezone.utc) - timedelta(minutes=20))
            ),
            "is_favorite": True,
        })

    return sorted(mapped, key=lambda x: x["distance_km"])


def add_nearby_favorite(db: Session, current_user: User, favorite_user_id: int):
    if current_user.id == favorite_user_id:
        return {"success": False, "message": "Nao pode favoritar a si mesmo"}

    exists = db.query(NearbyFavorite).filter(
        NearbyFavorite.user_id == current_user.id,
        NearbyFavorite.favorite_user_id == favorite_user_id
    ).first()
    if exists:
        return {"success": True, "message": "Ja favoritado"}

    db.add(NearbyFavorite(user_id=current_user.id, favorite_user_id=favorite_user_id))
    db.commit()
    return {"success": True}


def remove_nearby_favorite(db: Session, current_user: User, favorite_user_id: int):
    row = db.query(NearbyFavorite).filter(
        NearbyFavorite.user_id == current_user.id,
        NearbyFavorite.favorite_user_id == favorite_user_id
    ).first()
    if row:
        db.delete(row)
        db.commit()
    return {"success": True}


def get_nearby_places(db: Session, current_user: User, radius_km: float = 5):
    """
    Return geotagged places from Moments and Vibes only.
    Stories are intentionally excluded from places mirror.
    """
    if current_user.latitude is None or current_user.longitude is None:
        return []

    safe_radius = max(0.1, float(radius_km))
    lat_delta = safe_radius / 111.0
    cos_lat = abs(cos(radians(current_user.latitude)))
    lon_delta = safe_radius / (111.0 * cos_lat) if cos_lat > 1e-6 else 180.0

    min_lat = current_user.latitude - lat_delta
    max_lat = current_user.latitude + lat_delta
    min_lon = current_user.longitude - lon_delta
    max_lon = current_user.longitude + lon_delta

    moments = db.query(Moment).filter(
        Moment.latitude.isnot(None),
        Moment.longitude.isnot(None),
        Moment.media_url.isnot(None),
        Moment.latitude >= min_lat,
        Moment.latitude <= max_lat,
        Moment.longitude >= min_lon,
        Moment.longitude <= max_lon,
    ).all()

    vibes = db.query(Vibe).filter(
        Vibe.latitude.isnot(None),
        Vibe.longitude.isnot(None),
        Vibe.video_url.isnot(None),
        Vibe.latitude >= min_lat,
        Vibe.latitude <= max_lat,
        Vibe.longitude >= min_lon,
        Vibe.longitude <= max_lon,
    ).all()

    grouped: dict[str, dict] = {}

    def group_key(location_label: str | None, latitude: float, longitude: float) -> str:
        # Group by locality name first (city/label), regardless of author or content kind.
        normalized_label = (location_label or '').strip().lower()
        if normalized_label:
            return f"label:{normalized_label}"
        return f"coords:{round(latitude, 3)}:{round(longitude, 3)}"

    for moment in moments:
        distance = haversine(
            current_user.latitude,
            current_user.longitude,
            moment.latitude,
            moment.longitude,
        )
        if distance > radius_km:
            continue

        key = group_key(moment.location_label, moment.latitude, moment.longitude)
        if key not in grouped:
            grouped[key] = {
                "location_label": moment.location_label or "Local sem nome",
                "latitude": moment.latitude,
                "longitude": moment.longitude,
                "distance_km": round(distance, 2),
                "posts_count": 0,
                "latest_created_at": moment.created_at,
                "posts": [],
            }
        elif distance < grouped[key]["distance_km"]:
            grouped[key]["distance_km"] = round(distance, 2)

        grouped[key]["posts_count"] += 1
        if moment.created_at and grouped[key]["latest_created_at"] and moment.created_at > grouped[key]["latest_created_at"]:
            grouped[key]["latest_created_at"] = moment.created_at

        grouped[key]["posts"].append({
            "kind": "moment",
            "id": moment.id,
            "media_url": moment.media_url,
            "content": moment.content,
            "created_at": moment.created_at,
            "user_id": moment.user_id,
        })

    for vibe in vibes:
        distance = haversine(
            current_user.latitude,
            current_user.longitude,
            vibe.latitude,
            vibe.longitude,
        )
        if distance > radius_km:
            continue

        key = group_key(vibe.location_label, vibe.latitude, vibe.longitude)
        if key not in grouped:
            grouped[key] = {
                "location_label": vibe.location_label or "Local sem nome",
                "latitude": vibe.latitude,
                "longitude": vibe.longitude,
                "distance_km": round(distance, 2),
                "posts_count": 0,
                "latest_created_at": vibe.created_at,
                "posts": [],
            }
        elif distance < grouped[key]["distance_km"]:
            grouped[key]["distance_km"] = round(distance, 2)

        grouped[key]["posts_count"] += 1
        if vibe.created_at and grouped[key]["latest_created_at"] and vibe.created_at > grouped[key]["latest_created_at"]:
            grouped[key]["latest_created_at"] = vibe.created_at

        grouped[key]["posts"].append({
            "kind": "vibe",
            "id": vibe.id,
            "media_url": vibe.video_url,
            "content": vibe.caption,
            "created_at": vibe.created_at,
            "user_id": vibe.user_id,
        })

    places = list(grouped.values())
    for place in places:
        place["posts"].sort(
            key=lambda post: post.get("created_at") or datetime(1970, 1, 1, tzinfo=timezone.utc),
            reverse=True,
        )
    places.sort(key=lambda x: x["distance_km"])
    return places
