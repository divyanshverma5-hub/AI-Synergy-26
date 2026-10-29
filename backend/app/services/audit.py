"""Audit logging.

Append-only. Every reviewer action and every automated state change writes a row
recording what changed, why, and by whom, so historical decisions are preserved
rather than overwritten.
"""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

from ..models import AuditLog


def record(
    session: Session,
    *,
    action: str,
    entity_type: str,
    entity_id: str,
    actor: str = "system",
    previous_value: Any = None,
    new_value: Any = None,
    reason: str | None = None,
    context: dict[str, Any] | None = None,
) -> AuditLog:
    entry = AuditLog(
        actor=actor or "system",
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        previous_value=_stringify(previous_value),
        new_value=_stringify(new_value),
        reason=reason or None,
        context=json.dumps(context or {}, default=str),
    )
    session.add(entry)
    session.flush()
    return entry


def _stringify(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    return json.dumps(value, default=str)
