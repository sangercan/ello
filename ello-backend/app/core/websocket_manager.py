# ==========================================================
# FILE: app/core/websocket_manager.py
# MODULE: WEBSOCKET CONNECTION MANAGER
# RESPONSIBILITY:
# - Manage active connections
# - Real-time presence updates
# ==========================================================

import logging
from fastapi import WebSocket, WebSocketDisconnect
from typing import Dict

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


class WebSocketManager:

    def __init__(self):
        self.active_connections: Dict[int, WebSocket] = {}

    # ------------------------------------------------------
    # CONNECT USER
    # ------------------------------------------------------
    async def connect(self, user_id: int, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[user_id] = websocket
        logger.info("WebSocket conectado para o usuário %s (total %d)", user_id, len(self.active_connections))

        # Broadcast updated online users
        await self.broadcast({
            "type": "presence_update",
            "online_users": self.get_online_users()
        })

    # ------------------------------------------------------
    # DISCONNECT USER
    # ------------------------------------------------------
    async def disconnect(self, user_id: int):
        if user_id in self.active_connections:
            self.active_connections.pop(user_id, None)
            logger.info("WebSocket desconectado para o usuário %s (total %d)", user_id, len(self.active_connections))

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

        if not websocket:
            logger.warning(
                "Nenhuma conexão ativa para o usuário %s; mensagem %s não pôde ser entregue",
                user_id,
                message.get("type"),
            )
            return

        try:
            await websocket.send_json(message)
            logger.info(
                "Mensagem %s entregue para o usuário %s",
                message.get("type"),
                user_id,
            )
        except (WebSocketDisconnect, RuntimeError) as exc:
            logger.warning(
                "Erro ao enviar mensagem %s para o usuário %s: %s",
                message.get("type"),
                user_id,
                exc,
            )
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

    def is_user_connected(self, user_id: int) -> bool:
        return int(user_id) in self.active_connections


manager = WebSocketManager()
