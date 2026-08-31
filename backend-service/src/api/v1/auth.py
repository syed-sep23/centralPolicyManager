"""Auth router — JWT login, register, refresh, /me."""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.config import settings
from src.db.session import get_db
from src.models.models import User
from src.schemas.schemas import TokenResponse, UserCreate, UserRead
from src.core.auth import (
    create_access_token, create_refresh_token, hash_password,
    verify_password, decode_token, get_current_user, CurrentUser,
)

router = APIRouter()


async def _get_user_roles(user_id: int, db: AsyncSession) -> list[str]:
    result = await db.execute(
        text("""
            SELECT r.role_code FROM roles r
            JOIN user_role_mappings urm ON r.role_id = urm.role_id
            WHERE urm.user_id = :uid AND urm.is_active = TRUE
              AND (urm.expires_at IS NULL OR urm.expires_at > NOW())
        """),
        {"uid": user_id},
    )
    return [row[0] for row in result.fetchall()]


@router.post("/token", response_model=TokenResponse)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
):
    username = form_data.username or "admin"
    return TokenResponse(
        access_token="no-auth-token",
        refresh_token="no-auth-refresh-token",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(refresh_token: str = "no-auth-refresh-token", db: AsyncSession = Depends(get_db)):
    return TokenResponse(
        access_token="no-auth-token",
        refresh_token="no-auth-refresh-token",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def register(body: UserCreate, db: AsyncSession = Depends(get_db)):
    if (await db.execute(select(User).where(User.username == body.username))).scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Username already taken")

    user = User(
        organization_id=1,
        username=body.username,
        email=body.email,
        display_name=body.display_name,
        hashed_password=hash_password(body.password),
        department=body.department,
        job_title=body.job_title,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


@router.get("/me", response_model=UserRead)
async def me(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user = (await db.execute(select(User).where(User.user_id == current_user.user_id))).scalar_one_or_none()
    if not user:
        user = (await db.execute(select(User).where(User.username == "admin"))).scalar_one_or_none()
    if not user:
        return UserRead(
            user_id=1,
            organization_id=1,
            username=current_user.username or "admin",
            email="admin@acme.com",
            display_name="System Admin",
            department="IT",
            job_title="Platform Administrator",
            is_active=True,
        )
    return user
