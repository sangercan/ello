# ==========================================================
# FILE: app/core/websocket_manager.py
# MODULE: WEBSOCKET CONNECTION MANAGER
# RESPONSIBILITY:
# - Manage active connections
# - Real-time presence updates
# ==========================================================

from fastapi import WebSocket, WebSocketDisconnect
from typing import Dict


class WebSocketManager:

    def __init__(self):
        self.active_connections: Dict[int, WebSocket] = {}

    # ------------------------------------------------------
    # CONNECT USER
    # ------------------------------------------------------
    async def connect(self, user_id: int, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[user_id] = websocket

        # Broadcast updated online users
        await self.broadcast({
            "type": "presence_update",
            "online_users": self.get_online_users()
        })

    # ------------------------------------------------------
    # DISCONNECT USER
    # ------------------------------------------------------
    async def disconnect(self, user_id: int):
        self.active_connections.pop(user_id, None)

        # Broadcast updated online users
        await self.broadcast({
            "type": "presence_update",
            "online_users": self.get_online_users()
        })

    # ------------------------------------------------------
    # SEND MESSAGE TO SPECIFIC USER
    # ------------------------------------------------------
    async def send_to_user(self, user_id: int, message: dict):
        websocket = self.active_connections.get(user_id)

        if websocket:
            try:
                await websocket.send_json(message)
            except (WebSocketDisconnect, RuntimeError):
                await self.disconnect(user_id)

    # ------------------------------------------------------
    # BROADCAST
    # ------------------------------------------------------
    async def broadcast(self, message: dict):
        for user_id, websocket in list(self.active_connections.items()):
            try:
                await websocket.send_json(message)
            except (WebSocketDisconnect, RuntimeError):
                await self.disconnect(user_id)

    # ------------------------------------------------------
    # GET ONLINE USERS
    # ------------------------------------------------------
    def get_online_users(self):
        return list(self.active_connections.keys())


manager = WebSocketManager()