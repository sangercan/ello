# ==========================================================
# FILE: app/schemas/message.py
# MODULE: MESSAGE SCHEMAS
# RESPONSIBILITY:
# - Message creation
# - Message response
# - Conversation response
# ==========================================================

from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Optional


# ----------------------------------------------------------
# USER BASIC (for nested responses)
# ----------------------------------------------------------

class UserBasic(BaseModel):
    id: int
    full_name: str
    username: str
    avatar_url: Optional[str] = None
    mood: Optional[str] = None
    is_online: Optional[bool] = False
    last_seen_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


# ----------------------------------------------------------
# MESSAGE CREATE
# ----------------------------------------------------------

class MessageCreate(BaseModel):
    content: str
    receiver_id: int


# ----------------------------------------------------------
# MESSAGE RESPONSE
# ----------------------------------------------------------

class MessageResponse(BaseModel):
    id: int
    sender_id: int
    receiver_id: Optional[int] = None
    content: str
    is_delivered: bool
    is_read: bool
    created_at: datetime
    audio_url: Optional[str] = None
    media_url: Optional[str] = None
    sender: Optional[UserBasic] = None
    receiver: Optional[UserBasic] = None

    model_config = ConfigDict(from_attributes=True)


# ----------------------------------------------------------
# CONVERSATION RESPONSE
# ----------------------------------------------------------

class ConversationResponse(BaseModel):
    id: int
    user1_id: int
    user2_id: int
    user1: Optional[UserBasic] = None
    user2: Optional[UserBasic] = None
    last_message: Optional[MessageResponse] = None
    unread_count: int = 0
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ----------------------------------------------------------
# CONVERSATION LIST RESPONSE (simplified)
# ----------------------------------------------------------

class ConversationListItem(BaseModel):
    id: int
    other_user: UserBasic  # The user we're chatting with
    last_message: Optional[str] = None  # Preview
    last_message_time: Optional[datetime] = None
    is_read: bool = True
    unread_count: int = 0

    model_config = ConfigDict(from_attributes=True)


# ----------------------------------------------------------
# MESSAGE DELIVERY UPDATE
# ----------------------------------------------------------

class MessageDeliveryUpdate(BaseModel):
    message_id: int
    is_delivered: bool


# ----------------------------------------------------------
# MESSAGE READ UPDATE
# ----------------------------------------------------------

class MessageReadUpdate(BaseModel):
    message_id: int
    is_read: bool


# ----------------------------------------------------------
# MESSAGE REACTION
# ----------------------------------------------------------

class MessageReaction(BaseModel):
    message_id: int
    reaction: str  # emoji


class ForwardMessageRequest(BaseModel):
    receiver_id: int
