from fastapi import APIRouter, Body, Depends
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.database import get_db
from app.schemas.push import (
    PushDeviceDeleteRequest,
    PushDeviceResponse,
    PushDeviceUpsertRequest,
    PushPreferencesUpdateRequest,
)
from app.services.push_service import (
    list_push_devices,
    register_push_device,
    unregister_push_device,
    update_push_preferences,
)

router = APIRouter(prefix="/push", tags=["Push"])


@router.get("/devices", response_model=list[PushDeviceResponse])
def get_devices(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return list_push_devices(db, user_id=current_user.id)


@router.post("/devices", response_model=PushDeviceResponse)
def upsert_device(
    data: PushDeviceUpsertRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return register_push_device(db, user_id=current_user.id, payload=data)


@router.delete("/devices")
def delete_device(
    data: PushDeviceDeleteRequest | None = Body(default=None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    payload = data or PushDeviceDeleteRequest()
    return unregister_push_device(
        db,
        user_id=current_user.id,
        token=payload.token,
        device_id=payload.device_id,
    )


@router.put("/preferences")
def set_preferences(
    data: PushPreferencesUpdateRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return update_push_preferences(db, user_id=current_user.id, payload=data)
