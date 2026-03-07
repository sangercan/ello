# ==========================================================
# FILE: app/services/chat_service.py
# MODULE: CHAT SERVICE
# RESPONSIBILITY:
# - Send message
# - Get conversation history
# - List conversations
# - Mark as delivered/read
# - Get last message per conversation
# ==========================================================

from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_, or_, desc
from fastapi import HTTPException
from datetime import datetime, timezone, timedelta

from app.models.message import Message
from app.models.conversation import Conversation
from app.models.user import User
from app.models.message_reaction import MessageReaction
from app.models.user_block import UserBlock


# ==========================================================
# SEND MESSAGE
# ==========================================================

def send_message(
    db: Session,
    sender_id: int,
    receiver_id: int,
    content: str
):
    """Send a message and create or get conversation"""

    if sender_id == receiver_id:
        raise HTTPException(status_code=400, detail="Cannot message yourself")

    if has_block_between(db, sender_id, receiver_id):
        raise HTTPException(status_code=403, detail="Message blocked due to privacy settings")

    if not content.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    # Find or create conversation
    conversation = db.query(Conversation).filter(
        or_(
            and_(
                Conversation.user1_id == sender_id,
                Conversation.user2_id == receiver_id
            ),
            and_(
                Conversation.user1_id == receiver_id,
                Conversation.user2_id == sender_id
            )
        )
    ).first()

    if not conversation:
        conversation = Conversation(
            user1_id=min(sender_id, receiver_id),
            user2_id=max(sender_id, receiver_id)
        )
        db.add(conversation)
        db.commit()
        db.refresh(conversation)

    # Create message
    message = Message(
        conversation_id=conversation.id,
        sender_id=sender_id,
        receiver_id=receiver_id,
        content=content,
        is_delivered=True,
        is_read=False
    )

    db.add(message)
    db.commit()
    db.refresh(message)

    # Eager load sender
    message = db.query(Message).options(
        joinedload(Message.sender)
    ).filter(Message.id == message.id).first()

    return message


# ==========================================================
# GET CONVERSATION MESSAGES
# ==========================================================

def get_messages(
    db: Session,
    conversation_id: int,
    page: int = 1,
    limit: int = 50,
    current_user_id: int = None
):
    """Get messages from a conversation with pagination"""

    conversation = db.query(Conversation).filter(
        Conversation.id == conversation_id
    ).first()

    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Verify user is part of conversation
    if current_user_id and current_user_id not in [conversation.user1_id, conversation.user2_id]:
        raise HTTPException(status_code=403, detail="Not authorized")

    offset = (page - 1) * limit

    # Get total count
    total = db.query(Message).filter(
        Message.conversation_id == conversation_id
    ).count()

    # Get messages with eager loading
    messages = db.query(Message).options(
        joinedload(Message.sender),
        joinedload(Message.receiver)
    ).filter(
        Message.conversation_id == conversation_id
    ).order_by(
        desc(Message.created_at)
    ).offset(offset).limit(limit).all()

    # Reverse to show oldest first
    messages.reverse()

    return {
        "data": messages,
        "total": total,
        "page": page,
        "limit": limit,
        "conversation_id": conversation_id
    }


# ==========================================================
# LIST USER CONVERSATIONS
# ==========================================================

def list_user_conversations(
    db: Session,
    user_id: int,
    page: int = 1,
    limit: int = 20
):
    """List all conversations for a user with last message preview"""

    offset = (page - 1) * limit

    # Get conversations where user is participant
    conversations = db.query(Conversation).filter(
        or_(
            Conversation.user1_id == user_id,
            Conversation.user2_id == user_id
        )
    ).options(
        joinedload(Conversation.user1),
        joinedload(Conversation.user2)
    ).order_by(
        desc(Conversation.created_at)
    ).offset(offset).limit(limit).all()

    result = []

    for conv in conversations:
        # Get other user
        other_user_id = conv.user2_id if conv.user1_id == user_id else conv.user1_id
        other_user = conv.user2 if conv.user1_id == user_id else conv.user1

        if has_block_between(db, user_id, other_user_id):
            continue

        # Get last message
        last_msg = db.query(Message).filter(
            Message.conversation_id == conv.id
        ).order_by(desc(Message.created_at)).first()

        # Count unread messages for current user
        unread_count = db.query(Message).filter(
            Message.conversation_id == conv.id,
            Message.receiver_id == user_id,
            Message.is_read == False
        ).count()

        result.append({
            "id": conv.id,
            "other_user": {
                "id": other_user.id,
                "full_name": other_user.full_name,
                "username": other_user.username,
                "avatar_url": other_user.avatar_url,
                "is_online": bool(
                    other_user.is_online and
                    other_user.last_activity_at and
                    other_user.last_activity_at >= (datetime.now(timezone.utc) - timedelta(minutes=20))
                ),
                "last_seen_at": other_user.last_seen_at,
            },
            "last_message": last_msg.content if last_msg else None,
            "last_message_time": last_msg.created_at if last_msg else None,
            "is_read": not (last_msg and last_msg.receiver_id == user_id and not last_msg.is_read),
            "unread_count": unread_count,
        })

    total = db.query(Conversation).filter(
        or_(
            Conversation.user1_id == user_id,
            Conversation.user2_id == user_id
        )
    ).count()

    return {
        "data": result,
        "total": total,
        "page": page,
        "limit": limit
    }


# ==========================================================
# MARK MESSAGE AS DELIVERED
# ==========================================================

def mark_as_delivered(db: Session, message_id: int):
    """Mark message as delivered"""

    message = db.query(Message).filter(Message.id == message_id).first()

    if not message:
        raise HTTPException(status_code=404, detail="Message not found")

    message.is_delivered = True
    db.commit()
    db.refresh(message)

    return message


# ==========================================================
# MARK MESSAGE AS READ
# ==========================================================

def mark_as_read(db: Session, message_id: int):
    """Mark message as read"""

    message = db.query(Message).filter(Message.id == message_id).first()

    if not message:
        raise HTTPException(status_code=404, detail="Message not found")

    message.is_read = True
    db.commit()
    db.refresh(message)

    return message


# ==========================================================
# MARK ALL MESSAGES AS READ IN CONVERSATION
# ==========================================================

def mark_conversation_as_read(
    db: Session,
    conversation_id: int,
    user_id: int
):
    """Mark all messages in conversation as read for user"""

    messages = db.query(Message).filter(
        Message.conversation_id == conversation_id,
        Message.receiver_id == user_id,
        Message.is_read == False
    ).all()

    for msg in messages:
        msg.is_read = True

    db.commit()

    return {"message": f"Marked {len(messages)} messages as read"}


# ==========================================================
# ADD REACTION TO MESSAGE
# ==========================================================

def add_reaction(
    db: Session,
    user_id: int,
    message_id: int,
    reaction: str
):
    """Add emoji reaction to message"""

    message = db.query(Message).filter(Message.id == message_id).first()

    if not message:
        raise HTTPException(status_code=404, detail="Message not found")

    existing = db.query(MessageReaction).filter(
        MessageReaction.message_id == message_id,
        MessageReaction.user_id == user_id
    ).first()

    if existing and existing.reaction == reaction:
        db.delete(existing)
        db.commit()
        return {"message": "Reaction removed", "reaction": reaction, "active": False}

    if existing:
        existing.reaction = reaction
    else:
        db.add(MessageReaction(
            message_id=message_id,
            user_id=user_id,
            reaction=reaction
        ))

    db.commit()

    return {"message": "Reaction updated", "reaction": reaction, "active": True}


def get_message_reactions(db: Session, message_id: int):
    """Get aggregated reactions for one message."""
    rows = db.query(MessageReaction).filter(
        MessageReaction.message_id == message_id
    ).all()

    grouped = {}
    for row in rows:
        if row.reaction not in grouped:
            grouped[row.reaction] = {
                "reaction": row.reaction,
                "count": 0,
                "user_ids": []
            }
        grouped[row.reaction]["count"] += 1
        grouped[row.reaction]["user_ids"].append(row.user_id)

    return list(grouped.values())


def forward_message(
    db: Session,
    sender_id: int,
    message_id: int,
    receiver_id: int
):
    """Forward an existing message to another user."""
    original = db.query(Message).filter(Message.id == message_id).first()
    if not original:
        raise HTTPException(status_code=404, detail="Original message not found")

    if sender_id == receiver_id:
        raise HTTPException(status_code=400, detail="Cannot forward to yourself")

    if has_block_between(db, sender_id, receiver_id):
        raise HTTPException(status_code=403, detail="Forward blocked due to privacy settings")

    conversation = db.query(Conversation).filter(
        or_(
            and_(
                Conversation.user1_id == sender_id,
                Conversation.user2_id == receiver_id
            ),
            and_(
                Conversation.user1_id == receiver_id,
                Conversation.user2_id == sender_id
            )
        )
    ).first()

    if not conversation:
        conversation = Conversation(
            user1_id=min(sender_id, receiver_id),
            user2_id=max(sender_id, receiver_id)
        )
        db.add(conversation)
        db.commit()
        db.refresh(conversation)

    forwarded = Message(
        conversation_id=conversation.id,
        sender_id=sender_id,
        receiver_id=receiver_id,
        content=f"Encaminhada: {original.content}",
        is_delivered=True,
        is_read=False,
        media_url=original.media_url,
        audio_url=original.audio_url
    )
    db.add(forwarded)
    db.commit()
    db.refresh(forwarded)
    return forwarded


def has_block_between(db: Session, user_a_id: int, user_b_id: int) -> bool:
    if user_a_id == user_b_id:
        return False

    blocked = db.query(UserBlock).filter(
        or_(
            and_(UserBlock.blocker_id == user_a_id, UserBlock.blocked_id == user_b_id),
            and_(UserBlock.blocker_id == user_b_id, UserBlock.blocked_id == user_a_id),
        )
    ).first()
    return blocked is not None


def block_user(db: Session, blocker_id: int, blocked_id: int):
    if blocker_id == blocked_id:
        raise HTTPException(status_code=400, detail="Cannot block yourself")

    existing = db.query(UserBlock).filter(
        UserBlock.blocker_id == blocker_id,
        UserBlock.blocked_id == blocked_id,
    ).first()
    if existing:
        return existing

    row = UserBlock(blocker_id=blocker_id, blocked_id=blocked_id)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def delete_conversation_for_user(db: Session, current_user_id: int, conversation_id: int):
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    if current_user_id not in [conversation.user1_id, conversation.user2_id]:
        raise HTTPException(status_code=403, detail="Not authorized")

    db.query(Message).filter(Message.conversation_id == conversation.id).delete(synchronize_session=False)
    db.delete(conversation)
    db.commit()
    return {"conversation_id": conversation_id}


# ==========================================================
# GET CONVERSATION BY ID
# ==========================================================

def get_conversation(
    db: Session,
    conversation_id: int,
    current_user_id: int
):
    """Get conversation details"""

    conversation = db.query(Conversation).options(
        joinedload(Conversation.user1),
        joinedload(Conversation.user2)
    ).filter(
        Conversation.id == conversation_id
    ).first()

    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Verify user is part of conversation
    if current_user_id not in [conversation.user1_id, conversation.user2_id]:
        raise HTTPException(status_code=403, detail="Not authorized")

    return conversation


# ==========================================================
# SEARCH MESSAGES
# ==========================================================

def search_messages(
    db: Session,
    conversation_id: int,
    query: str,
    current_user_id: int
):
    """Search messages in a conversation"""

    conversation = db.query(Conversation).filter(
        Conversation.id == conversation_id
    ).first()

    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    if current_user_id not in [conversation.user1_id, conversation.user2_id]:
        raise HTTPException(status_code=403, detail="Not authorized")

    messages = db.query(Message).options(
        joinedload(Message.sender)
    ).filter(
        Message.conversation_id == conversation_id,
        Message.content.ilike(f"%{query}%")
    ).order_by(
        desc(Message.created_at)
    ).all()

    return messages


def _looks_like_location_content(content: str | None) -> bool:
    text = (content or "")
    if not text:
        return False
    return ('Lat:' in text and 'Lng:' in text) or ('Localiza' in text)


def update_message_content(
    db: Session,
    user_id: int,
    message_id: int,
    new_content: str,
):
    message = db.query(Message).filter(Message.id == message_id).first()

    if not message:
        raise HTTPException(status_code=404, detail="Message not found")

    if message.sender_id != user_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    if message.media_url or message.audio_url or _looks_like_location_content(message.content):
        raise HTTPException(status_code=400, detail="This message type cannot be edited")

    sanitized = (new_content or "").strip()
    if not sanitized:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    message.content = sanitized
    db.commit()
    db.refresh(message)
    return message


def delete_message(
    db: Session,
    user_id: int,
    message_id: int,
):
    message = db.query(Message).filter(Message.id == message_id).first()

    if not message:
        raise HTTPException(status_code=404, detail="Message not found")

    if message.sender_id != user_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    payload = {
        "id": message.id,
        "sender_id": message.sender_id,
        "receiver_id": message.receiver_id,
        "conversation_id": message.conversation_id,
    }

    db.delete(message)
    db.commit()

    return payload
