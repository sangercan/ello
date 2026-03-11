# ==========================================================
# FILE: app/routes/groups.py
# RESPONSIBILITY:
# - Manage chat groups (create/list)
# - Only allow adding members that follow mutually with creator
# ==========================================================

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.core.dependencies import get_current_user
from app.schemas.group import GroupCreate, GroupResponse, GroupMessageCreate
from app.services.group_service import (
    create_group,
    list_groups_for_user,
    get_group,
    send_group_message,
    get_group_messages,
    update_group,
    delete_group,
    add_group_members,
    set_group_admin,
    leave_group,
    list_group_members,
    remove_group_member,
)

router = APIRouter(prefix="/chat/groups", tags=["Chat Groups"])


@router.post("/", response_model=GroupResponse)
def create_chat_group(
    data: GroupCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = create_group(db, current_user.id, data.name, data.member_ids or [], data.image_url)
    # Avisar via websocket no futuro se necessário
    return GroupResponse(
        id=result["id"],
        name=result["name"],
        member_ids=result["member_ids"],
    )


@router.get("/", response_model=list[GroupResponse])
def list_my_groups(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    groups = list_groups_for_user(db, current_user.id)
    return [GroupResponse(**g) for g in groups]


@router.get("/{group_id}", response_model=GroupResponse)
def get_group_detail(
    group_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = get_group(db, group_id, current_user.id)
    return GroupResponse(**result)


@router.patch("/{group_id}", response_model=GroupResponse)
def update_group_detail(
    group_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    name = payload.get("name")
    image_url = payload.get("image_url")
    result = update_group(db, group_id, current_user.id, name, image_url)
    return GroupResponse(**result)


@router.delete("/{group_id}")
def delete_group_route(
    group_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return delete_group(db, group_id, current_user.id)


@router.post("/{group_id}/members")
def add_members_route(
    group_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    member_ids = payload.get("member_ids", [])
    return add_group_members(db, group_id, current_user.id, member_ids)


@router.get("/{group_id}/members")
def list_members_route(
    group_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return list_group_members(db, group_id, current_user.id)


@router.delete("/{group_id}/members/{user_id}")
def remove_member_route(
    group_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return remove_group_member(db, group_id, current_user.id, user_id)


@router.post("/{group_id}/admins")
def set_admin_route(
    group_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    target_user_id = payload.get("user_id")
    is_admin = payload.get("is_admin", True)
    if not target_user_id:
        raise HTTPException(status_code=400, detail="user_id required")
    set_group_admin(db, group_id, current_user.id, int(target_user_id), bool(is_admin))
    return {"ok": True}


@router.post("/{group_id}/leave")
def leave_group_route(
    group_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return leave_group(db, group_id, current_user.id)


@router.post("/{group_id}/messages")
def send_message_to_group(
    group_id: int,
    payload: GroupMessageCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return send_group_message(
        db,
        group_id,
        current_user.id,
        content=payload.content or "",
        audio_url=payload.audio_url,
        media_url=payload.media_url,
        latitude=payload.latitude,
        longitude=payload.longitude,
    )


@router.get("/{group_id}/messages")
def list_group_messages(
    group_id: int,
    page: int = 1,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return get_group_messages(db, group_id, current_user.id, page, limit)
