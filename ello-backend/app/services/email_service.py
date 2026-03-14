from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage
from threading import Thread
from typing import Optional
from urllib.parse import quote

from app.core.config import (
    EMAIL_ENABLED,
    EMAIL_FROM_NOREPLY,
    EMAIL_FROM_SUPPORT,
    EMAIL_REPLY_TO_SUPPORT,
    EMAIL_SMTP_HOST,
    EMAIL_SMTP_PASSWORD,
    EMAIL_SMTP_PORT,
    EMAIL_SMTP_TIMEOUT_SECONDS,
    EMAIL_SMTP_USE_SSL,
    EMAIL_SMTP_USE_TLS,
    EMAIL_SMTP_USERNAME,
    FRONTEND_BASE_URL,
    PASSWORD_RESET_EXPIRE_MINUTES,
)

logger = logging.getLogger("app.email")


def _safe_display_name(name: Optional[str]) -> str:
    raw = (name or "").strip()
    if not raw:
        return "voce"
    return raw


def _build_reset_link(reset_token: str) -> str:
    token = quote(reset_token.strip())
    base = (FRONTEND_BASE_URL or "https://ellosocial.com").rstrip("/")
    return f"{base}/reset-password?token={token}"


def _send_email(
    *,
    to_email: str,
    subject: str,
    html_body: str,
    text_body: str,
    from_email: Optional[str] = None,
    reply_to: Optional[str] = None,
) -> bool:
    if not EMAIL_ENABLED:
        logger.info("Email disabled. Skipping email '%s' to %s", subject, to_email)
        return False

    if not EMAIL_SMTP_HOST:
        logger.warning("EMAIL_SMTP_HOST not configured. Skipping email '%s' to %s", subject, to_email)
        return False

    sender = (from_email or EMAIL_FROM_NOREPLY or EMAIL_SMTP_USERNAME or "").strip()
    if not sender:
        logger.warning("No sender configured. Skipping email '%s' to %s", subject, to_email)
        return False

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = sender
    message["To"] = to_email
    if reply_to:
        message["Reply-To"] = reply_to

    message.set_content(text_body)
    message.add_alternative(html_body, subtype="html")

    try:
        if EMAIL_SMTP_USE_SSL:
            with smtplib.SMTP_SSL(
                host=EMAIL_SMTP_HOST,
                port=EMAIL_SMTP_PORT,
                timeout=EMAIL_SMTP_TIMEOUT_SECONDS,
            ) as server:
                if EMAIL_SMTP_USERNAME and EMAIL_SMTP_PASSWORD:
                    server.login(EMAIL_SMTP_USERNAME, EMAIL_SMTP_PASSWORD)
                server.send_message(message)
        else:
            with smtplib.SMTP(
                host=EMAIL_SMTP_HOST,
                port=EMAIL_SMTP_PORT,
                timeout=EMAIL_SMTP_TIMEOUT_SECONDS,
            ) as server:
                server.ehlo()
                if EMAIL_SMTP_USE_TLS:
                    server.starttls()
                    server.ehlo()
                if EMAIL_SMTP_USERNAME and EMAIL_SMTP_PASSWORD:
                    server.login(EMAIL_SMTP_USERNAME, EMAIL_SMTP_PASSWORD)
                server.send_message(message)

        logger.info("Email '%s' sent to %s", subject, to_email)
        return True
    except Exception:
        logger.exception("Failed to send email '%s' to %s", subject, to_email)
        return False


def _send_email_async(**kwargs) -> None:
    def _runner() -> None:
        _send_email(**kwargs)

    Thread(target=_runner, daemon=True).start()


def send_welcome_email_async(*, to_email: str, full_name: Optional[str]) -> None:
    name = _safe_display_name(full_name)
    subject = "Bem-vindo ao Ello Social"
    text_body = (
        f"Oi {name},\n\n"
        "Sua conta foi criada com sucesso no Ello Social.\n"
        "Estamos felizes em ter voce por aqui.\n\n"
        "Acesse: https://ellosocial.com\n\n"
        "Equipe Ello Social"
    )
    html_body = f"""
<html>
  <body style="font-family: Arial, sans-serif; background:#070b17; color:#e6ecff; padding:24px;">
    <div style="max-width:640px; margin:auto; background:#0f172a; border:1px solid #243044; border-radius:16px; padding:24px;">
      <h2 style="margin:0 0 12px 0; color:#8ab4ff;">Bem-vindo ao Ello Social</h2>
      <p style="margin:0 0 12px 0;">Oi <strong>{name}</strong>, sua conta foi criada com sucesso.</p>
      <p style="margin:0 0 20px 0;">Estamos felizes em ter voce por aqui.</p>
      <a href="https://ellosocial.com" style="display:inline-block; padding:10px 16px; border-radius:10px; background:#3b82f6; color:#fff; text-decoration:none;">
        Entrar no Ello Social
      </a>
      <p style="margin:20px 0 0 0; color:#93a4bf; font-size:12px;">Equipe Ello Social</p>
    </div>
  </body>
</html>
"""
    _send_email_async(
        to_email=to_email,
        subject=subject,
        html_body=html_body,
        text_body=text_body,
        from_email=EMAIL_FROM_NOREPLY,
        reply_to=EMAIL_REPLY_TO_SUPPORT,
    )


def send_password_reset_email_async(*, to_email: str, full_name: Optional[str], reset_token: str) -> None:
    name = _safe_display_name(full_name)
    reset_link = _build_reset_link(reset_token)
    subject = "Redefinicao de senha - Ello Social"
    text_body = (
        f"Oi {name},\n\n"
        "Recebemos um pedido para redefinir sua senha.\n"
        f"Use este link (valido por {PASSWORD_RESET_EXPIRE_MINUTES} minutos):\n"
        f"{reset_link}\n\n"
        "Se voce nao solicitou, pode ignorar este email.\n\n"
        "Equipe Ello Social"
    )
    html_body = f"""
<html>
  <body style="font-family: Arial, sans-serif; background:#070b17; color:#e6ecff; padding:24px;">
    <div style="max-width:640px; margin:auto; background:#0f172a; border:1px solid #243044; border-radius:16px; padding:24px;">
      <h2 style="margin:0 0 12px 0; color:#8ab4ff;">Redefinicao de senha</h2>
      <p style="margin:0 0 12px 0;">Oi <strong>{name}</strong>, recebemos um pedido para redefinir sua senha.</p>
      <p style="margin:0 0 20px 0;">Este link expira em {PASSWORD_RESET_EXPIRE_MINUTES} minutos.</p>
      <a href="{reset_link}" style="display:inline-block; padding:10px 16px; border-radius:10px; background:#3b82f6; color:#fff; text-decoration:none;">
        Redefinir senha
      </a>
      <p style="margin:20px 0 0 0; color:#93a4bf; font-size:12px;">Se voce nao solicitou, ignore este email.</p>
    </div>
  </body>
</html>
"""
    _send_email_async(
        to_email=to_email,
        subject=subject,
        html_body=html_body,
        text_body=text_body,
        from_email=EMAIL_FROM_SUPPORT,
        reply_to=EMAIL_REPLY_TO_SUPPORT,
    )


def send_account_deleted_email_async(*, to_email: str, full_name: Optional[str]) -> None:
    name = _safe_display_name(full_name)
    subject = "Sentiremos sua ausencia no Ello Social"
    text_body = (
        f"Oi {name},\n\n"
        "Sua conta foi excluida conforme solicitado.\n"
        "Lamentamos e sentiremos a sua ausencia no Ello Social.\n\n"
        "Se quiser voltar no futuro, sera um prazer ter voce novamente.\n\n"
        "Equipe Ello Social"
    )
    html_body = f"""
<html>
  <body style="font-family: Arial, sans-serif; background:#070b17; color:#e6ecff; padding:24px;">
    <div style="max-width:640px; margin:auto; background:#0f172a; border:1px solid #243044; border-radius:16px; padding:24px;">
      <h2 style="margin:0 0 12px 0; color:#8ab4ff;">Conta excluida</h2>
      <p style="margin:0 0 12px 0;">Oi <strong>{name}</strong>, sua conta foi excluida conforme solicitado.</p>
      <p style="margin:0 0 12px 0;">Lamentamos e sentiremos a sua ausencia no Ello Social.</p>
      <p style="margin:0; color:#93a4bf; font-size:12px;">Se quiser voltar no futuro, sera um prazer ter voce novamente.</p>
    </div>
  </body>
</html>
"""
    _send_email_async(
        to_email=to_email,
        subject=subject,
        html_body=html_body,
        text_body=text_body,
        from_email=EMAIL_FROM_NOREPLY,
        reply_to=EMAIL_REPLY_TO_SUPPORT,
    )
