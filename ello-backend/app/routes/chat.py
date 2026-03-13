# ==========================================================
# FILE: app/routes/chat.py
# MODULE: CHAT ROUTES
# RESPONSIBILITY:
# - Send message
# - Get conversation history
# - List user conversations
# - Mark message as delivered
# - Mark message as read
# - Add reaction
# ==========================================================

from fastapi import APIRouter, Depends, Query, Body, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, desc

from app.database import get_db
from app.core.dependencies import get_current_user, get_optional_current_user
from app.models.user import User
from app.models.conversation import Conversation
from app.models.message import Message
from app.models.music import Music
from typing import Optional
from app.schemas.message import MessageCreate, MessageResponse
from app.schemas.message import ForwardMessageRequest

from app.services.chat_service import (
    send_message,
    get_messages,
    list_user_conversations,
    mark_as_delivered,
    mark_as_read,
    mark_conversation_as_read,
    add_reaction,
    get_message_reactions,
    forward_message,
    get_conversation,
    search_messages,
    update_message_content,
    delete_message,
    has_block_between,
    block_user,
    list_blocked_users,
    unblock_user,
    delete_conversation_for_user,
)
from app.core.websocket_manager import manager
from app.services.notification_service import create_notification
from app.routes.upload import (
    _compress_audio_bytes,
    _compress_video_bytes,
    _compress_document_bytes,
    _detect_mime_by_signature,
    _infer_media_type,
    _optimize_image_bytes,
)

# ----------------------------------------------------------
# ROUTER CONFIG
# ----------------------------------------------------------

router = APIRouter(
    prefix="/chat",
    tags=["Chat"]
)


def _serialize_message(message: Message):
    return {
        "id": message.id,
        "sender_id": message.sender_id,
        "receiver_id": message.receiver_id,
        "content": message.content,
        "is_delivered": message.is_delivered,
        "is_read": message.is_read,
        "created_at": message.created_at.isoformat() if message.created_at else None,
        "audio_url": message.audio_url,
        "media_url": message.media_url,
    }


async def _notify_new_chat_message(db: Session, receiver_id: int, actor: User, message: Message):
    notification = create_notification(
        db,
        user_id=int(receiver_id),
        actor_id=actor.id,
        notif_type="message",
        reference_id=message.id,
        message="enviou uma mensagem no chat",
    )

    if notification is not None:
        await manager.send_to_user(int(receiver_id), {
            "type": "notification_created",
            "notification": {
                "id": notification.id,
                "user_id": notification.user_id,
                "actor_id": actor.id,
                "type": notification.type,
                "reference_id": notification.reference_id,
                "content": notification.message,
                "message": notification.message,
                "is_read": bool(notification.is_read),
                "created_at": notification.created_at.isoformat() if notification.created_at else None,
                "actor": {
                    "id": actor.id,
                    "username": actor.username,
                    "full_name": actor.full_name,
                    "avatar_url": actor.avatar_url,
                    "mood": actor.mood,
                },
            },
        })
    else:
        await manager.send_to_user(int(receiver_id), {
            "type": "notification_refresh",
            "reason": "message",
            "actor_id": actor.id,
        })

# ==========================================================
# SEND MESSAGE
# POST /chat/send
# ==========================================================

@router.post("/send")
async def send_message_route(
    data: MessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Send a message to a user (requires authentication)"""
    message = send_message(
        db=db,
        sender_id=current_user.id,
        receiver_id=data.receiver_id,
        content=data.content
    )
    payload = {
        "type": "new_message",
        "from_user_id": current_user.id,
        "to_user_id": data.receiver_id,
        "message": _serialize_message(message),
    }
    await manager.send_to_user(data.receiver_id, payload)
    await manager.send_to_user(current_user.id, payload)
    await _notify_new_chat_message(db, data.receiver_id, current_user, message)
    return message


# ==========================================================
# GET MESSAGES WITH A SPECIFIC USER
# GET /chat/messages/{user_id}
# ==========================================================

@router.get("/messages/{user_id}")
def get_messages_with_user(
    user_id: int,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get messages with a specific user"""

    if has_block_between(db, current_user.id, user_id):
        return {
            "data": [],
            "total": 0,
            "page": page,
            "limit": limit
        }
    
    # Find conversation between current user and user_id
    conversation = db.query(Conversation).filter(
        or_(
            and_(
                Conversation.user1_id == current_user.id,
                Conversation.user2_id == user_id
            ),
            and_(
                Conversation.user1_id == user_id,
                Conversation.user2_id == current_user.id
            )
        )
    ).first()
    
    if not conversation:
        # No conversation yet, return empty
        return {
            "data": [],
            "total": 0,
            "page": page,
            "limit": limit
        }
    
    # Get messages for this conversation with pagination
    skip = (page - 1) * limit
    messages = db.query(Message).filter(
        Message.conversation_id == conversation.id
    ).order_by(Message.created_at.asc()).offset(skip).limit(limit).all()
    
    total = db.query(Message).filter(
        Message.conversation_id == conversation.id
    ).count()
    
    serialized_messages = []
    for msg in messages:
        serialized_messages.append({
            "id": msg.id,
            "sender_id": msg.sender_id,
            "receiver_id": msg.receiver_id,
            "content": msg.content,
            "is_delivered": msg.is_delivered,
            "is_read": msg.is_read,
            "created_at": msg.created_at,
            "audio_url": msg.audio_url,
            "media_url": msg.media_url,
            "reactions": get_message_reactions(db, msg.id)
        })

    return {
        "data": serialized_messages,
        "total": total,
        "page": page,
        "limit": limit
    }


# ==========================================================

@router.get("/conversations")
def my_conversations(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user)
):
    """List conversations (optional authentication)"""
    if current_user:
        return list_user_conversations(
            db=db,
            user_id=current_user.id,
            page=page,
            limit=limit
        )
    # Return empty list if not authenticated
    return {"data": [], "total": 0, "page": page, "limit": limit}


# ==========================================================
# GET CONVERSATION HISTORY
# GET /chat/conversation/{conversation_id}
# ==========================================================

@router.get("/conversation/{conversation_id}")
def get_history(
    conversation_id: int,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user)
):
    """Get message history (optional authentication)"""
    if current_user:
        return get_messages(
            db=db,
            conversation_id=conversation_id,
            page=page,
            limit=limit,
            current_user_id=current_user.id
        )
    # Return empty list if not authenticated
    return {"data": [], "total": 0, "page": page, "limit": limit, "conversation_id": conversation_id}


# ==========================================================
# MARK MESSAGE AS DELIVERED
# POST /chat/message/{message_id}/delivered
# ==========================================================

@router.post("/message/{message_id}/delivered")
def mark_delivered(
    message_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Mark message as delivered (requires authentication)"""
    return mark_as_delivered(db, message_id)


# ==========================================================
# MARK MESSAGE AS READ
# POST /chat/messages/{message_id}/read
# ==========================================================

@router.post("/messages/{message_id}/read")
def mark_message_read(
    message_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Mark message as read (requires authentication)"""
    return mark_as_read(db, message_id)


# ==========================================================
# SEND AUDIO
# POST /chat/audio
# ==========================================================

@router.post("/audio")
async def send_audio(
    data: dict = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Send audio message (requires authentication)"""
    import base64
    import os
    from datetime import datetime
    
    try:
        audio_blob = data.get('audio_blob')
        receiver_id = int(data.get('receiver_id')) if data.get('receiver_id') is not None else None
        duration = data.get('duration', 0)

        if not audio_blob or not receiver_id:
            return {
                "error": "Missing audio_blob or receiver_id",
                "status": 400
            }

        if has_block_between(db, current_user.id, receiver_id):
            return {
                "error": "Message blocked due to privacy settings",
                "status": 403
            }

        # Decode base64 audio
        if audio_blob.startswith('data:audio'):
            audio_data = audio_blob.split(',')[1]
        else:
            audio_data = audio_blob

        try:
            audio_bytes = base64.b64decode(audio_data)
        except Exception as decode_error:
            return {
                "error": f"Base64 decode error: {str(decode_error)}",
                "status": 400
            }

        # Create uploads directory if it doesn't exist
        uploads_dir = '/app/uploads/audio'
        os.makedirs(uploads_dir, exist_ok=True)

        try:
            payload, extension = _compress_audio_bytes(audio_bytes)
        except Exception as compression_error:
            return {
                "error": f"Audio compression error: {str(compression_error)}",
                "status": 422
            }

        # Generate unique filename
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"audio_{current_user.id}_{timestamp}.{extension}"
        filepath = os.path.join(uploads_dir, filename)

        # Save audio file
        try:
            with open(filepath, 'wb') as f:
                f.write(payload)
        except Exception as save_error:
            return {
                "error": f"File save error: {str(save_error)}",
                "status": 500
            }

        # Create message with audio reference
        message = Message(
            sender_id=current_user.id,
            receiver_id=receiver_id,
            content=f"🎤 Áudio ({duration}s)",
            is_delivered=True,
            is_read=False,
            audio_url=f"/uploads/audio/{filename}"
        )

        # Find or create conversation
        conversation = db.query(Conversation).filter(
            or_(
                and_(
                    Conversation.user1_id == current_user.id,
                    Conversation.user2_id == receiver_id
                ),
                and_(
                    Conversation.user1_id == receiver_id,
                    Conversation.user2_id == current_user.id
                )
            )
        ).first()

        if not conversation:
            conversation = Conversation(
                user1_id=current_user.id,
                user2_id=receiver_id
            )
            db.add(conversation)
            db.flush()

        message.conversation_id = conversation.id
        db.add(message)
        db.commit()
        db.refresh(message)

        payload = {
            "type": "new_message",
            "from_user_id": current_user.id,
            "to_user_id": receiver_id,
            "message": _serialize_message(message),
        }
        await manager.send_to_user(receiver_id, payload)
        await manager.send_to_user(current_user.id, payload)
        await _notify_new_chat_message(db, int(receiver_id), current_user, message)

        return {
            "status": 200,
            "message": _serialize_message(message),
            "audio_id": message.id,
            "url": f"/uploads/audio/{filename}"
        }
    
    except Exception as e:
        db.rollback()
        return {
            "error": str(e),
            "status": 500
        }


# ==========================================================
# MARK CONVERSATION AS READ
# POST /chat/conversation/{conversation_id}/read
# ==========================================================

@router.post("/conversation/{conversation_id}/read")
def mark_conv_read(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Mark all messages in conversation as read (requires authentication)"""
    return mark_conversation_as_read(
        db=db,
        conversation_id=conversation_id,
        user_id=current_user.id
    )


# ==========================================================
# ADD REACTION TO MESSAGE
# POST /chat/message/{message_id}/reaction
# ==========================================================

@router.post("/message/{message_id}/reaction")
def react_to_message(
    message_id: int,
    reaction: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Add emoji reaction to message (requires authentication)"""
    return add_reaction(
        db=db,
        user_id=current_user.id,
        message_id=message_id,
        reaction=reaction
    )


@router.get("/message/{message_id}/reactions")
def list_message_reactions(
    message_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return {"data": get_message_reactions(db, message_id)}


@router.post("/message/{message_id}/forward")
async def forward_message_route(
    message_id: int,
    data: ForwardMessageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    forwarded = forward_message(
        db=db,
        sender_id=current_user.id,
        message_id=message_id,
        receiver_id=data.receiver_id
    )
    payload = {
        "type": "new_message",
        "from_user_id": current_user.id,
        "to_user_id": data.receiver_id,
        "message": _serialize_message(forwarded),
    }
    await manager.send_to_user(data.receiver_id, payload)
    await manager.send_to_user(current_user.id, payload)
    await _notify_new_chat_message(db, data.receiver_id, current_user, forwarded)

    return {
        "message": "Forwarded",
        "data": {
            "id": forwarded.id,
            "sender_id": forwarded.sender_id,
            "receiver_id": forwarded.receiver_id,
            "content": forwarded.content,
            "is_delivered": forwarded.is_delivered,
            "is_read": forwarded.is_read,
            "created_at": forwarded.created_at,
            "audio_url": forwarded.audio_url,
            "media_url": forwarded.media_url
        }
    }


@router.patch("/message/{message_id}")
async def edit_message_route(
    message_id: int,
    data: dict = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    updated = update_message_content(
        db=db,
        user_id=current_user.id,
        message_id=message_id,
        new_content=data.get('content') or '',
    )

    payload = {
        "type": "message_updated",
        "message": _serialize_message(updated),
    }
    await manager.send_to_user(updated.sender_id, payload)
    if updated.receiver_id:
        await manager.send_to_user(updated.receiver_id, payload)

    return _serialize_message(updated)


@router.delete("/message/{message_id}")
async def delete_message_route(
    message_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    deleted = delete_message(
        db=db,
        user_id=current_user.id,
        message_id=message_id,
    )

    payload = {
        "type": "message_deleted",
        "message_id": deleted['id'],
        "conversation_id": deleted['conversation_id'],
    }
    await manager.send_to_user(deleted['sender_id'], payload)
    if deleted.get('receiver_id'):
        await manager.send_to_user(deleted['receiver_id'], payload)

    return {"message": "Message deleted", **deleted}


# ==========================================================
# GET CONVERSATION
# GET /chat/conversation/{conversation_id}/details
# ==========================================================

@router.get("/conversation/{conversation_id}/details")
def get_conv_details(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user)
):
    """Get conversation details (optional authentication)"""
    if current_user:
        return get_conversation(
            db=db,
            conversation_id=conversation_id,
            current_user_id=current_user.id
        )
    return {"data": {}, "message": "Not authenticated"}


# ==========================================================
# SEARCH MESSAGES IN CONVERSATION
# GET /chat/conversation/{conversation_id}/search
# ==========================================================

@router.get("/conversation/{conversation_id}/search")
def search_conv_messages(
    conversation_id: int,
    q: str = Query(...),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user)
):
    """Search messages in a conversation (optional authentication)"""
    if current_user:
        return search_messages(
            db=db,
            conversation_id=conversation_id,
            query=q,
            current_user_id=current_user.id
        )
    return {"data": [], "message": "Not authenticated"}


# ==========================================================
# SEND MEDIA
# POST /chat/media
# ==========================================================

@router.post("/media")
async def send_media(
    data: dict = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Send media message (image, video, document)"""
    import base64
    import os
    from datetime import datetime
    
    try:
        media_blob = data.get('media_blob')
        receiver_id = int(data.get('receiver_id')) if data.get('receiver_id') is not None else None
        media_type = str(data.get('media_type', 'image')).strip().lower()
        filename = str(data.get('filename', f"media_{datetime.now().timestamp()}"))
        caption = str(data.get('caption') or '').strip()

        if not media_blob or not receiver_id:
            return {
                "error": "Missing media_blob or receiver_id",
                "status": 400
            }

        if has_block_between(db, current_user.id, receiver_id):
            return {
                "error": "Message blocked due to privacy settings",
                "status": 403
            }

        inferred_mime = ''

        # Decode base64 media
        if media_blob.startswith('data:'):
            header = media_blob.split(',', 1)[0]
            media_data = media_blob.split(',')[1]
            if ';' in header:
                inferred_mime = header[5:].split(';', 1)[0].lower()
        else:
            media_data = media_blob

        media_bytes = base64.b64decode(media_data)
        sniffed_mime = _detect_mime_by_signature(media_bytes)
        if sniffed_mime and not inferred_mime:
            inferred_mime = sniffed_mime

        if media_type not in {'image', 'video', 'audio', 'document'}:
            media_type = 'document'

        if sniffed_mime:
            sniffed_media_type = _infer_media_type(sniffed_mime, filename)
            if media_type == 'document' or sniffed_media_type != media_type:
                media_type = sniffed_media_type

        try:
            if media_type == 'image':
                payload, extension = _optimize_image_bytes(media_bytes, inferred_mime or 'image/jpeg')
            elif media_type == 'video':
                payload, extension = _compress_video_bytes(media_bytes)
            elif media_type == 'audio':
                payload, extension = _compress_audio_bytes(media_bytes)
            else:
                payload, extension = _compress_document_bytes(media_bytes, filename)
        except Exception as compression_error:
            return {
                "error": f"Media compression error: {str(compression_error)}",
                "status": 422
            }

        # Create uploads directory based on media type
        folder_by_media_type = {
            'image': 'images',
            'video': 'videos',
            'audio': 'audio',
            'document': 'documents',
        }
        uploads_subdir = folder_by_media_type[media_type]
        uploads_dir = f'/app/uploads/{uploads_subdir}'
        os.makedirs(uploads_dir, exist_ok=True)

        # Generate unique filename
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        base_name = os.path.splitext(os.path.basename(filename).replace(' ', '_'))[0]
        unique_filename = f"{media_type}_{current_user.id}_{timestamp}_{base_name}.{extension}"
        filepath = os.path.join(uploads_dir, unique_filename)

        # Save media file
        with open(filepath, 'wb') as f:
            f.write(payload)

        # Create message with media reference
        message = Message(
            sender_id=current_user.id,
            receiver_id=receiver_id,
            content=caption or f"📎 {media_type.capitalize()}: {filename}",
            is_delivered=True,
            is_read=False,
            media_url=f"/uploads/{uploads_subdir}/{unique_filename}"
        )

        # Find or create conversation
        conversation = db.query(Conversation).filter(
            or_(
                and_(
                    Conversation.user1_id == current_user.id,
                    Conversation.user2_id == receiver_id
                ),
                and_(
                    Conversation.user1_id == receiver_id,
                    Conversation.user2_id == current_user.id
                )
            )
        ).first()

        if not conversation:
            conversation = Conversation(
                user1_id=current_user.id,
                user2_id=receiver_id
            )
            db.add(conversation)
            db.flush()

        message.conversation_id = conversation.id
        db.add(message)
        db.commit()
        db.refresh(message)

        payload = {
            "type": "new_message",
            "from_user_id": current_user.id,
            "to_user_id": receiver_id,
            "message": _serialize_message(message),
        }
        await manager.send_to_user(receiver_id, payload)
        await manager.send_to_user(current_user.id, payload)
        await _notify_new_chat_message(db, int(receiver_id), current_user, message)

        return {
            "status": 200,
            "message": _serialize_message(message),
            "media_id": message.id,
            "url": f"/uploads/{uploads_subdir}/{unique_filename}"
        }
    
    except Exception as e:
        db.rollback()
        return {
            "error": str(e),
            "status": 500
        }


# ==========================================================
# SEND LOCATION
# POST /chat/location
# ==========================================================

@router.post("/location")
async def send_location(
    data: dict = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Send location message"""
    try:
        receiver_id = data.get('receiver_id')
        latitude = data.get('latitude')
        longitude = data.get('longitude')
        location_name = data.get('location_name', 'Localização compartilhada')
        
        if not receiver_id or latitude is None or longitude is None:
            return {
                "error": "Missing receiver_id, latitude, or longitude",
                "status": 400
            }

        if has_block_between(db, current_user.id, int(receiver_id)):
            return {
                "error": "Message blocked due to privacy settings",
                "status": 403
            }
        
        # Create message with location data
        message = Message(
            sender_id=current_user.id,
            receiver_id=receiver_id,
            content=f"{location_name}\nLat: {latitude}, Lng: {longitude}",
            is_delivered=True,
            is_read=False
        )
        
        # Find or create conversation
        conversation = db.query(Conversation).filter(
            or_(
                and_(
                    Conversation.user1_id == current_user.id,
                    Conversation.user2_id == receiver_id
                ),
                and_(
                    Conversation.user1_id == receiver_id,
                    Conversation.user2_id == current_user.id
                )
            )
        ).first()
        
        if not conversation:
            conversation = Conversation(
                user1_id=current_user.id,
                user2_id=receiver_id
            )
            db.add(conversation)
            db.flush()
        
        message.conversation_id = conversation.id
        db.add(message)
        db.commit()
        db.refresh(message)
        
        payload = {
            "type": "new_message",
            "from_user_id": current_user.id,
            "to_user_id": receiver_id,
            "message": _serialize_message(message),
        }
        await manager.send_to_user(receiver_id, payload)
        await manager.send_to_user(current_user.id, payload)
        await _notify_new_chat_message(db, int(receiver_id), current_user, message)

        return {
            "status": 200,
            "message": _serialize_message(message),
            "location_id": message.id
        }
    
    except Exception as e:
        db.rollback()
        return {
            "error": str(e),
            "status": 500
        }


@router.post("/share-music")
async def share_music_message(
    data: dict = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Share a music track in chat by reusing existing audio URL (mirror mode)."""
    try:
        receiver_id = data.get('receiver_id')
        music_id = data.get('music_id')

        if not receiver_id or not music_id:
            return {"error": "Missing receiver_id or music_id", "status": 400}

        if has_block_between(db, current_user.id, int(receiver_id)):
            return {"error": "Message blocked due to privacy settings", "status": 403}

        music = db.query(Music).filter(Music.id == int(music_id)).first()
        if not music:
            return {"error": "Music not found", "status": 404}

        conversation = db.query(Conversation).filter(
            or_(
                and_(Conversation.user1_id == current_user.id, Conversation.user2_id == receiver_id),
                and_(Conversation.user1_id == receiver_id, Conversation.user2_id == current_user.id),
            )
        ).first()

        if not conversation:
            conversation = Conversation(user1_id=current_user.id, user2_id=receiver_id)
            db.add(conversation)
            db.flush()

        message = Message(
            sender_id=current_user.id,
            receiver_id=receiver_id,
            conversation_id=conversation.id,
            content=f"🎵 {music.title} - {music.artist}",
            audio_url=music.audio_url,
            is_delivered=True,
            is_read=False,
        )

        db.add(message)
        db.commit()
        db.refresh(message)

        payload = {
            "type": "new_message",
            "from_user_id": current_user.id,
            "to_user_id": receiver_id,
            "message": _serialize_message(message),
        }
        await manager.send_to_user(receiver_id, payload)
        await manager.send_to_user(current_user.id, payload)
        await _notify_new_chat_message(db, int(receiver_id), current_user, message)

        return {"status": 200, "message": _serialize_message(message)}

    except Exception as e:
        db.rollback()
        return {"error": str(e), "status": 500}


@router.delete("/conversation/{conversation_id}")
def delete_conversation_route(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = delete_conversation_for_user(
        db=db,
        current_user_id=current_user.id,
        conversation_id=conversation_id,
    )
    return {"message": "Conversation deleted", **result}


@router.post("/block/{user_id}")
def block_user_route(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    row = block_user(db=db, blocker_id=current_user.id, blocked_id=user_id)
    return {
        "message": "User blocked",
        "id": row.id,
        "blocker_id": row.blocker_id,
        "blocked_id": row.blocked_id,
    }


@router.get("/blocked-users")
def list_blocked_users_route(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    data = list_blocked_users(db=db, blocker_id=current_user.id)
    return {
        "data": data,
        "total": len(data),
    }


@router.delete("/block/{user_id}")
def unblock_user_route(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    removed = unblock_user(db=db, blocker_id=current_user.id, blocked_id=user_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Block relation not found")

    return {
        "message": "User unblocked",
        "blocked_id": user_id,
    }
