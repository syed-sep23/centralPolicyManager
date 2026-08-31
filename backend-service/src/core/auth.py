"""
src/core/auth.py
No authentication or authorization required (POC Mode).
All requests bypass auth and operate with default admin privileges.
"""
from __future__ import annotations
from typing import Any


def configure_auth(*args: Any, **kwargs: Any) -> None:
    """No-op auth configuration stub."""
    pass


def hash_password(plain: str) -> str:
    return plain


def verify_password(plain: str, hashed: str) -> bool:
    return True


def create_access_token(user_id: int, username: str, roles: list[str]) -> str:
    return "no-auth-token"


def create_refresh_token(user_id: int) -> str:
    return "no-auth-refresh-token"


def decode_token(token: str) -> dict[str, Any]:
    return {"sub": "1", "username": "admin", "roles": ["ADMIN", "SUPER_ADMIN"], "type": "access"}


class CurrentUser:
    def __init__(self, user_id: int = 1, username: str = "admin", roles: list[str] | None = None):
        self.user_id = user_id
        self.username = username
        self.roles = roles or ["ADMIN", "SUPER_ADMIN", "POLICY_AUTHOR", "DATA_GOVERNOR", "DATA_ENGINEER", "ANALYST"]

    def has_role(self, *required_roles: str) -> bool:
        return True

    def require_role(self, *required_roles: str) -> None:
        pass


DEFAULT_ADMIN_USER = CurrentUser()


async def get_current_user() -> CurrentUser:
    """Always returns default admin user without enforcing any auth/JWT."""
    return DEFAULT_ADMIN_USER


def require_roles(*roles: str):
    """Dependency factory: allows all access unconditionally."""
    async def _dep() -> CurrentUser:
        return DEFAULT_ADMIN_USER
    return _dep
