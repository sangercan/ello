# ==========================================================
# FILE: app/services/group_service.py
# RESPONSIBILITY:
# - Manage groups: create/list/get/update/delete
# - Send/list group messages
# - Enforce: criação exige seguidores mútuos; convites posteriores não exigem
# ==========================================================

import asyncio
from datetime import datetime, timedelta
from sqlalchemy.orm import Session, joinedload
from fastapi import HTTPException

from app.models.group import Group
from app.models.group_member import GroupMember
from app.models.follow import Follow
from app.models.message import Message
from app.models.message_reaction import MessageReaction
from app.models.user import User
from app.core.websocket_manager import manager


def _mutual_follow_ids(db: Session, user_id: int) -> set[int]:
    followers = {
        row.follower_id
        for row in db.query(Follow.follower_id).filter(Follow.following_id == user_id).all()
    }
    following = {
        row.following_id
        for row in db.query(Follow.following_id).filter(Follow.follower_id == user_id).all()
    }
    return followers.intersection(following)


def create_group(db: Session, creator_id: int, name: str, member_ids: list[int], image_url: str | None = None):
    if not name or not name.strip():
        raise HTTPException(status_code=400, detail="Nome do grupo é obrigatório")

    unique_members = {mid for mid in member_ids if mid != creator_id}
    allowed = _mutual_follow_ids(db, creator_id)
    invalid = unique_members.difference(allowed)
    valid_members = unique_members.intersection(allowed)

    group = Group(name=name.strip(), creator_id=creator_id, image_url=image_url)
    db.add(group)
    db.commit()
    db.refresh(group)

    members_to_add = {creator_id, *valid_members}
    for uid in members_to_add:
        db.add(GroupMember(group_id=group.id, user_id=uid, is_admin=(uid == creator_id)))

    db.commit()

    return {
        "id": group.id,
        "name": group.name,
        "member_ids": list(members_to_add),
        "skipped_member_ids": list(invalid),
        "creator_id": group.creator_id,
        "image_url": group.image_url,
    }


def list_groups_for_user(db: Session, user_id: int):
    group_ids = [
        row.group_id
        for row in db.query(GroupMember.group_id).filter(GroupMember.user_id == user_id).all()
    ]
    if not group_ids:
        return []

    groups = db.query(Group).filter(Group.id.in_(group_ids)).all()
    members_by_group: dict[int, list[int]] = {}
    rows = db.query(GroupMember).filter(GroupMember.group_id.in_(group_ids)).all()
    for row in rows:
        members_by_group.setdefault(row.group_id, []).append(row.user_id)

    return [
        {
            "id": g.id,
            "name": g.name,
            "member_ids": members_by_group.get(g.id, []),
            "creator_id": g.creator_id,
            "image_url": g.image_url,
        }
        for g in groups
    ]


def _ensure_member(db: Session, group_id: int, user_id: int):
    membership = (
        db.query(GroupMember)
        .filter(GroupMember.group_id == group_id, GroupMember.user_id == user_id)
        .first()
    )
    if not membership:
        raise HTTPException(status_code=403, detail="Not authorized")


def get_group(db: Session, group_id: int, current_user_id: int):
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    _ensure_member(db, group_id, current_user_id)
    member_ids = sorted({
        row.user_id for row in db.query(GroupMember.user_id).filter(GroupMember.group_id == group_id).all()
    })
    return {
        "id": group.id,
        "name": group.name,
        "member_ids": member_ids,
        "creator_id": group.creator_id,
        "image_url": group.image_url,
    }


def update_group(db: Session, group_id: int, current_user_id: int, name: str | None, image_url: str | None):
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    if group.creator_id and group.creator_id != current_user_id:
        raise HTTPException(status_code=403, detail="Only creator can edit")
    if name and name.strip():
        group.name = name.strip()
    if image_url is not None:
        group.image_url = image_url.strip() or None
    db.commit()
    return get_group(db, group_id, current_user_id)


def delete_group(db: Session, group_id: int, current_user_id: int):
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    if group.creator_id and group.creator_id != current_user_id:
        raise HTTPException(status_code=403, detail="Only creator can delete")

    message_ids = [row.id for row in db.query(Message.id).filter(Message.group_id == group_id).all()]
    if message_ids:
        db.query(MessageReaction).filter(MessageReaction.message_id.in_(message_ids)).delete(synchronize_session=False)
        db.query(Message).filter(Message.id.in_(message_ids)).delete(synchronize_session=False)
    db.query(GroupMember).filter(GroupMember.group_id == group_id).delete(synchronize_session=False)
    db.delete(group)
    db.commit()
    return {"deleted": True}


def add_group_members(db: Session, group_id: int, current_user_id: int, member_ids: list[int]):
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    requester = db.query(GroupMember).filter(GroupMember.group_id == group_id, GroupMember.user_id == current_user_id).first()
    if not requester or not requester.is_admin:
        raise HTTPException(status_code=403, detail="Only creator can invite")
    existing = {
        row.user_id for row in db.query(GroupMember.user_id).filter(GroupMember.group_id == group_id).all()
    }
    to_add = {mid for mid in member_ids if mid not in existing}
    for uid in to_add:
        db.add(GroupMember(group_id=group_id, user_id=uid))
    db.commit()
    return get_group(db, group_id, current_user_id)


def set_group_admin(db: Session, group_id: int, current_user_id: int, target_user_id: int, is_admin: bool):
    requester = db.query(GroupMember).filter(
        GroupMember.group_id == group_id, GroupMember.user_id == current_user_id
    ).first()
    if not requester or not requester.is_admin:
        raise HTTPException(status_code=403, detail="Only admins can change roles")
    target = db.query(GroupMember).filter(
        GroupMember.group_id == group_id, GroupMember.user_id == target_user_id
    ).first()
    if not target:
        raise HTTPException(status_code=404, detail="Member not found")
    target.is_admin = bool(is_admin)
    db.commit()
    return True


def remove_group_member(db: Session, group_id: int, current_user_id: int, target_user_id: int):
    requester = db.query(GroupMember).filter(
        GroupMember.group_id == group_id, GroupMember.user_id == current_user_id
    ).first()
    if not requester or not requester.is_admin:
        raise HTTPException(status_code=403, detail="Only admins can remove members")

    target = db.query(GroupMember).filter(
        GroupMember.group_id == group_id, GroupMember.user_id == target_user_id
    ).first()
    if not target:
        raise HTTPException(status_code=404, detail="Member not found")

    if target.user_id == current_user_id:
        raise HTTPException(status_code=400, detail="Use leave to exit the group")

    group = db.query(Group).filter(Group.id == group_id).first()
    if group and group.creator_id == target.user_id:
        raise HTTPException(status_code=400, detail="Cannot remove the group creator")

    db.delete(target)
    db.commit()
    return {"removed": True}


def leave_group(db: Session, group_id: int, current_user_id: int):
    membership = db.query(GroupMember).filter(
        GroupMember.group_id == group_id, GroupMember.user_id == current_user_id
    ).first()
    if not membership:
        raise HTTPException(status_code=404, detail="Not a member")

    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    db.delete(membership)
    db.commit()

    # If creator left, reassign to another admin/member or delete if empty.
    remaining = db.query(GroupMember).filter(GroupMember.group_id == group_id).all()
    if not remaining:
        db.delete(group)
        db.commit()
        return {"left": True, "deleted": True}

    if group.creator_id == current_user_id:
        new_creator = next((m for m in remaining if m.is_admin), None) or remaining[0]
        group.creator_id = new_creator.user_id
        db.commit()

    return {"left": True, "deleted": False}


def list_group_members(db: Session, group_id: int, current_user_id: int):
    _ensure_member(db, group_id, current_user_id)
    rows = db.query(GroupMember).filter(GroupMember.group_id == group_id).all()
    user_ids = [r.user_id for r in rows]
    users = db.query(User).filter(User.id.in_(user_ids)).all()
    user_map = {u.id: u for u in users}
    return [
        {
            "id": r.user_id,
            "is_admin": r.is_admin,
            "username": user_map.get(r.user_id).username if user_map.get(r.user_id) else "",
            "full_name": user_map.get(r.user_id).full_name if user_map.get(r.user_id) else None,
            "avatar_url": user_map.get(r.user_id).avatar_url if user_map.get(r.user_id) else None,
            "mood": user_map.get(r.user_id).mood if user_map.get(r.user_id) else None,
        }
        for r in rows
    ]


def send_group_message(
    db: Session,
    group_id: int,
    sender_id: int,
    content: str,
    audio_url: str | None = None,
    media_url: str | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
):
    if not any([content and content.strip(), audio_url, media_url, latitude, longitude]):
        raise HTTPException(status_code=400, detail="Mensagem vazia")

    _ensure_member(db, group_id, sender_id)

    location_payload = None
    if latitude is not None and longitude is not None:
        location_payload = f"Lat: {latitude}, Lng: {longitude}"
    normalized_content = (location_payload or content or "").strip()

    # Evita duplicatas causadas por reenvio imediato do mesmo payload (double tap/retry).
    duplicate_window_start = datetime.utcnow() - timedelta(seconds=2)
    duplicate = (
        db.query(Message)
        .filter(
            Message.group_id == group_id,
            Message.sender_id == sender_id,
            Message.content == normalized_content,
            Message.audio_url == audio_url,
            Message.media_url == media_url,
            Message.created_at >= duplicate_window_start,
        )
        .order_by(Message.id.desc())
        .first()
    )
    if duplicate:
        msg = duplicate
    else:
        msg = Message(
            conversation_id=None,
            group_id=group_id,
            sender_id=sender_id,
            receiver_id=None,
            content=normalized_content,
            is_delivered=True,
            is_read=False,
            created_at=datetime.utcnow(),
            audio_url=audio_url,
            media_url=media_url,
        )
        db.add(msg)
        db.commit()
        db.refresh(msg)

    serialized = {
        "id": msg.id,
        "sender_id": msg.sender_id,
        "group_id": msg.group_id,
        "content": msg.content,
        "is_delivered": msg.is_delivered,
        "is_read": msg.is_read,
        "created_at": msg.created_at.isoformat() if msg.created_at else None,
        "audio_url": msg.audio_url,
        "media_url": msg.media_url,
        "sender": None,
    }
    sender = db.query(User).filter(User.id == sender_id).first()
    if sender:
        serialized["sender"] = {
            "id": sender.id,
            "username": sender.username,
            "full_name": sender.full_name,
            "avatar_url": sender.avatar_url,
            "mood": sender.mood,
        }

    member_ids = sorted({
        row.user_id for row in db.query(GroupMember.user_id).filter(GroupMember.group_id == group_id).all()
    })
    for uid in member_ids:
        try:
            asyncio.get_running_loop()
            asyncio.create_task(manager.send_to_user(uid, {
                "type": "new_message",
                "group_id": group_id,
                "message": serialized,
            }))
        except RuntimeError:
            # sync context (threadpool)
            loop = asyncio.new_event_loop()
            loop.run_until_complete(manager.send_to_user(uid, {
                "type": "new_message",
                "group_id": group_id,
                "message": serialized,
            }))
            loop.close()

    return serialized


def get_group_messages(db: Session, group_id: int, current_user_id: int, page: int = 1, limit: int = 50):
    _ensure_member(db, group_id, current_user_id)

    offset = (page - 1) * limit
    msgs = (
        db.query(Message)
        .options(joinedload(Message.sender))
        .filter(Message.group_id == group_id)
        .order_by(Message.created_at.asc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    serialized = []
    for msg in msgs:
        serialized.append({
          "id": msg.id,
          "sender_id": msg.sender_id,
          "group_id": msg.group_id,
          "content": msg.content,
          "is_delivered": msg.is_delivered,
          "is_read": msg.is_read,
          "created_at": msg.created_at.isoformat() if msg.created_at else None,
          "audio_url": msg.audio_url,
          "media_url": msg.media_url,
          "sender": {
              "id": msg.sender.id,
              "username": msg.sender.username,
              "full_name": msg.sender.full_name,
              "avatar_url": msg.sender.avatar_url,
              "mood": msg.sender.mood,
          } if msg.sender else None,
        })
    total = db.query(Message).filter(Message.group_id == group_id).count()
    return {"data": serialized, "total": total, "page": page, "limit": limit}
