"""WebSocket endpoint for real-time network topology streaming (Master Plan §4.5)."""

import asyncio
import contextlib
import json
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from appflow.config import Settings
from appflow.logging import get_logger
from appflow.streaming.hub import ClientSession, StreamHub
from appflow.streaming.protocol import (
    ClientPauseMessage,
    ClientPingMessage,
    ClientResumeMessage,
    ClientResyncMessage,
    ClientSubscribeMessage,
    ClientUpdateFiltersMessage,
    ErrorPayload,
    HelloPayload,
    ServerErrorMessage,
    ServerHelloMessage,
    parse_client_message,
)

_log = get_logger(__name__)

router = APIRouter(tags=["streaming"])

MAX_INBOUND_FRAME_BYTES = 4096
MAX_PROTOCOL_ERRORS = 3


def _is_origin_allowed(origin: str | None, allowed_origins: list[str]) -> bool:
    """Validate WebSocket origin against configured allowed origins."""
    if not origin:
        return True
    clean_origin = origin.rstrip("/")
    return any(allowed == "*" or allowed.rstrip("/") == clean_origin for allowed in allowed_origins)


@router.websocket("/ws/v1/topology")
async def websocket_topology(websocket: WebSocket) -> None:
    """Real-time bi-directional topology stream over WebSocket."""
    raw_settings = getattr(websocket.app.state, "settings", None)
    raw_hub = getattr(websocket.app.state, "hub", None)

    if not isinstance(raw_settings, Settings) or not isinstance(raw_hub, StreamHub):
        await websocket.close(code=1011, reason="Stream hub not initialized")
        return

    settings = raw_settings
    hub = raw_hub

    # 1. Validate Origin header
    origin_header = websocket.headers.get("origin")
    if not _is_origin_allowed(origin_header, settings.allowed_origins):
        _log.warning("ws_rejected_disallowed_origin", origin=origin_header)
        await websocket.close(code=1008, reason="Origin not permitted")
        return

    # 2. Enforce active client connection cap
    if hub.active_client_count >= settings.max_ws_clients:
        _log.warning(
            "ws_rejected_client_cap_reached",
            active=hub.active_client_count,
            limit=settings.max_ws_clients,
        )
        await websocket.close(code=1013, reason="Maximum active WebSocket client capacity reached")
        return

    # 3. Accept connection and perform greeting handshake
    await websocket.accept()

    hello_msg = ServerHelloMessage(
        payload=HelloPayload(meta=hub.get_meta(), server_time=datetime.now(UTC))
    )
    await websocket.send_text(hello_msg.model_dump_json(by_alias=True))

    session = ClientSession(client_id=str(uuid.uuid4()))
    await hub.register_client(session)

    writer_task: asyncio.Task[None] | None = None

    async def _writer_loop() -> None:
        try:
            while True:
                msg = await session.queue.get()
                await websocket.send_text(msg.model_dump_json(by_alias=True))
                session.queue.task_done()
        except asyncio.CancelledError:
            pass
        except Exception as err:
            _log.debug("ws_writer_loop_terminated", client_id=session.client_id, error=str(err))

    protocol_error_count = 0
    writer_task = asyncio.create_task(_writer_loop(), name=f"ws-writer-{session.client_id}")

    try:
        while True:
            raw_text = await websocket.receive_text()

            # Enforce inbound frame length limit
            if len(raw_text.encode("utf-8")) > MAX_INBOUND_FRAME_BYTES:
                protocol_error_count += 1
                err_msg = ServerErrorMessage(
                    payload=ErrorPayload(
                        code="FRAME_TOO_LARGE",
                        title="Frame size limit exceeded",
                        detail=f"Inbound frame exceeds {MAX_INBOUND_FRAME_BYTES} bytes limit",
                    )
                )
                with contextlib.suppress(asyncio.QueueFull):
                    session.queue.put_nowait(err_msg)

                if protocol_error_count >= MAX_PROTOCOL_ERRORS:
                    await websocket.close(code=1008, reason="Too many protocol errors")
                    break
                continue

            try:
                raw_json = json.loads(raw_text)
                client_msg = parse_client_message(raw_json)
            except Exception as parse_err:
                protocol_error_count += 1
                err_msg = ServerErrorMessage(
                    payload=ErrorPayload(
                        code="INVALID_PROTOCOL_MESSAGE",
                        title="Message validation failed",
                        detail=str(parse_err),
                    )
                )
                with contextlib.suppress(asyncio.QueueFull):
                    session.queue.put_nowait(err_msg)

                if protocol_error_count >= MAX_PROTOCOL_ERRORS:
                    await websocket.close(code=1008, reason="Too many protocol errors")
                    break
                continue

            # Dispatch valid client messages to hub
            if isinstance(client_msg, ClientSubscribeMessage):
                hub.handle_subscribe(session.client_id, client_msg.payload)
            elif isinstance(client_msg, ClientUpdateFiltersMessage):
                hub.handle_update_filters(session.client_id, client_msg.payload)
            elif isinstance(client_msg, ClientPauseMessage):
                hub.handle_pause(session.client_id)
            elif isinstance(client_msg, ClientResumeMessage):
                hub.handle_resume(session.client_id)
            elif isinstance(client_msg, ClientResyncMessage):
                hub.handle_resync(session.client_id, client_msg.payload)
            elif isinstance(client_msg, ClientPingMessage):
                hub.handle_ping(session.client_id)

    except WebSocketDisconnect:
        _log.info("ws_client_disconnected", client_id=session.client_id)
    except asyncio.CancelledError:
        pass
    except Exception as err:
        _log.warning("ws_connection_error", client_id=session.client_id, error=str(err))
    finally:
        if writer_task and not writer_task.done():
            writer_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await writer_task
        await hub.unregister_client(session.client_id)
