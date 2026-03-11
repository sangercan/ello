# ==========================================================
# FILE: app/routes/ws.py
# MODULE: WEBSOCKET ROUTES (PRODUCTION READY)
# ==========================================================

import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from datetime import datetime, timezone
from app.core.websocket_manager import manager
from app.database import SessionLocal
from app.models.user import User
from app.core.presence import set_user_online
from app.core.presence import set_user_offline
from app.services.notification_service import create_notifications_for_followers

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
router = APIRouter()


@router.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: int):

    logger.info("WebSocket handshake para o usuário %s iniciado (remote=%s)", user_id, websocket.client)
    # Connect user
    await manager.connect(user_id, websocket)
    set_user_online(user_id)

    db = SessionLocal()

    # Persist online state as soon as socket connects
    user = db.query(User).filter(User.id == user_id).first()
    if user:
        user.is_online = True
        user.last_seen_at = None
        user.last_activity_at = datetime.now(timezone.utc)
        db.commit()

        follower_notifications = create_notifications_for_followers(
            db,
            actor_id=user_id,
            notif_type="following_online",
            reference_id=user_id,
            message="acabou de entrar online",
            dedupe_minutes=20,
        )

        for row in follower_notifications:
            await manager.send_to_user(row.user_id, {
                "type": "notification_created",
                "notification": {
                    "id": row.id,
                    "user_id": row.user_id,
                    "actor_id": row.actor_id,
                    "type": row.type,
                    "reference_id": row.reference_id,
                    "content": row.message,
                    "message": row.message,
                    "is_read": bool(row.is_read),
                    "created_at": row.created_at.isoformat() if row.created_at else None,
                    "actor": {
                        "id": user.id,
                        "username": user.username,
                        "full_name": user.full_name,
                        "avatar_url": user.avatar_url,
                    },
                },
            })

    try:
        while True:

            data = await websocket.receive_json()
            event_type = data.get("type")

            user = db.query(User).filter(User.id == user_id).first()
            if user:
                user.last_activity_at = datetime.now(timezone.utc)
                user.is_online = True
                user.last_seen_at = None
                db.commit()

            # --------------------------------------------------
            # HEARTBEAT
            # --------------------------------------------------

            if event_type == "ping":
                try:
                    await websocket.send_json({"type": "pong"})
                except Exception:
                    pass

            # --------------------------------------------------
            # GEO LOCATION UPDATE (REAL-TIME NEARBY)
            # --------------------------------------------------

            if event_type == "location_update":

                user = db.query(User).filter(User.id == user_id).first()

                if user:
                    user.latitude = data.get("latitude")
                    user.longitude = data.get("longitude")
                    db.commit()

            # --------------------------------------------------
            # TYPING INDICATOR
            # --------------------------------------------------

            if event_type == "typing":
                await manager.send_to_user(
                    data["to_user_id"],
                    {
                        "type": "typing",
                        "from_user_id": user_id
                    }
                )

            # --------------------------------------------------
            # MESSAGE DELIVERED
            # --------------------------------------------------

            if event_type == "delivered":
                await manager.send_to_user(
                    data["to_user_id"],
                    {
                        "type": "delivered",
                        "message_id": data["message_id"]
                    }
                )

            # --------------------------------------------------
            # MESSAGE READ
            # --------------------------------------------------

            if event_type == "read":
                await manager.send_to_user(
                    data["to_user_id"],
                    {
                        "type": "read",
                        "message_id": data["message_id"]
                    }
                )

            # --------------------------------------------------
            # CALL SIGNALING (WEBRTC)
            # --------------------------------------------------

            if event_type == "call_signal":
                signal = data.get("signal") or {}
                signal_type = signal.get("type")
                call_id = signal.get("call_id")
                to_user_id = data.get("to_user_id")

                sdp = None
                if signal_type == "offer":
                    sdp = (signal.get("offer") or {}).get("sdp")
                elif signal_type == "answer":
                    sdp = (signal.get("answer") or {}).get("sdp")

                if sdp:
                    logger.info(
                        "call_signal type=%s call_id=%s from=%s to=%s sdp_flags(sendrecv=%s recvonly=%s sendonly=%s inactive=%s)",
                        signal_type,
                        call_id,
                        user_id,
                        to_user_id,
                        "a=sendrecv" in sdp,
                        "a=recvonly" in sdp,
                        "a=sendonly" in sdp,
                        "a=inactive" in sdp,
                    )
                else:
                    logger.info(
                        "call_signal type=%s call_id=%s from=%s to=%s",
                        signal_type,
                        call_id,
                        user_id,
                        to_user_id,
                    )

                await manager.send_to_user(
                    to_user_id,
                    {
                        "type": "call_signal",
                        "signal": signal,
                        "from_user_id": user_id
                    }
                )

    except WebSocketDisconnect:
        logger.info("WebSocket desconectado por WebSocketDisconnect (user %s)", user_id)
        await manager.disconnect(user_id)
        set_user_offline(user_id)
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            user.is_online = False
            user.last_seen_at = datetime.now(timezone.utc)
            user.last_activity_at = None
            db.commit()
    except Exception as e:
        logger.error(f"WebSocket error for user {user_id}: {str(e)}")
        await manager.disconnect(user_id)
        set_user_offline(user_id)
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            user.is_online = False
            user.last_seen_at = datetime.now(timezone.utc)
            user.last_activity_at = None
            db.commit()
    finally:
        db.close()
