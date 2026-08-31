"""SQLAlchemy ORM models — Core Backend Service."""
from __future__ import annotations
from datetime import date, datetime
from typing import Optional

from sqlalchemy import (
    Boolean, BigInteger, Date, DateTime, ForeignKey,
    Integer, String, Text, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.db.session import Base


# ─── Organization ─────────────────────────────────────────────────────────────
class Organization(Base):
    __tablename__ = "organizations"

    organization_id: Mapped[int]  = mapped_column(Integer, primary_key=True)
    org_name:        Mapped[str]  = mapped_column(String(255), nullable=False, unique=True)
    org_code:        Mapped[str]  = mapped_column(String(50),  nullable=False, unique=True)
    description:     Mapped[Optional[str]] = mapped_column(Text)
    created_at:      Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at:      Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


# ─── Data Domain ──────────────────────────────────────────────────────────────
class DataDomain(Base):
    __tablename__ = "data_domains"

    domain_id:       Mapped[int]  = mapped_column(Integer, primary_key=True)
    organization_id: Mapped[int]  = mapped_column(ForeignKey("organizations.organization_id"), nullable=False)
    domain_name:     Mapped[str]  = mapped_column(String(255), nullable=False)
    domain_code:     Mapped[str]  = mapped_column(String(50),  nullable=False)
    description:     Mapped[Optional[str]] = mapped_column(Text)
    is_active:       Mapped[bool] = mapped_column(Boolean, default=True)
    created_at:      Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ─── Data Product ─────────────────────────────────────────────────────────────
class DataProduct(Base):
    __tablename__ = "data_products"

    product_id:        Mapped[int] = mapped_column(Integer, primary_key=True)
    domain_id:         Mapped[int] = mapped_column(ForeignKey("data_domains.domain_id"), nullable=False)
    product_name:      Mapped[str] = mapped_column(String(255), nullable=False)
    product_code:      Mapped[str] = mapped_column(String(50),  nullable=False)
    description:       Mapped[Optional[str]] = mapped_column(Text)
    sensitivity_level: Mapped[str] = mapped_column(String(50), default="INTERNAL")
    is_active:         Mapped[bool] = mapped_column(Boolean, default=True)
    created_at:        Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ─── User ─────────────────────────────────────────────────────────────────────
class User(Base):
    __tablename__ = "users"

    user_id:         Mapped[int]  = mapped_column(Integer, primary_key=True)
    organization_id: Mapped[int]  = mapped_column(ForeignKey("organizations.organization_id"), nullable=False)
    username:        Mapped[str]  = mapped_column(String(255), nullable=False)
    email:           Mapped[str]  = mapped_column(String(255), nullable=False)
    display_name:    Mapped[Optional[str]] = mapped_column(String(255))
    department:      Mapped[Optional[str]] = mapped_column(String(255))
    job_title:       Mapped[Optional[str]] = mapped_column(String(255))
    is_active:       Mapped[bool] = mapped_column(Boolean, default=True)
    created_at:      Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    role_mappings: Mapped[list[UserRoleMapping]] = relationship("UserRoleMapping", back_populates="user")


# ─── Role ─────────────────────────────────────────────────────────────────────
class Role(Base):
    __tablename__ = "roles"

    role_id:         Mapped[int]  = mapped_column(Integer, primary_key=True)
    organization_id: Mapped[int]  = mapped_column(ForeignKey("organizations.organization_id"), nullable=False)
    role_name:       Mapped[str]  = mapped_column(String(255), nullable=False)
    role_code:       Mapped[str]  = mapped_column(String(100), nullable=False)
    parent_role_id:  Mapped[Optional[int]] = mapped_column(ForeignKey("roles.role_id"))
    is_active:       Mapped[bool] = mapped_column(Boolean, default=True)


# ─── User Role Mapping ────────────────────────────────────────────────────────
class UserRoleMapping(Base):
    __tablename__ = "user_role_mappings"

    mapping_id:  Mapped[int]  = mapped_column(Integer, primary_key=True)
    user_id:     Mapped[int]  = mapped_column(ForeignKey("users.user_id"), nullable=False)
    role_id:     Mapped[int]  = mapped_column(ForeignKey("roles.role_id"), nullable=False)
    is_active:   Mapped[bool] = mapped_column(Boolean, default=True)
    expires_at:  Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    user: Mapped[User] = relationship("User", back_populates="role_mappings")
    role: Mapped[Role] = relationship("Role")


# ─── Policy ───────────────────────────────────────────────────────────────────
class Policy(Base):
    __tablename__ = "policies"

    policy_id:          Mapped[int]  = mapped_column(Integer, primary_key=True)
    organization_id:    Mapped[int]  = mapped_column(ForeignKey("organizations.organization_id"), nullable=False)
    policy_name:        Mapped[str]  = mapped_column(String(255), nullable=False)
    policy_code:        Mapped[str]  = mapped_column(String(100), nullable=False)
    description:        Mapped[Optional[str]] = mapped_column(Text)
    domain_id:          Mapped[Optional[int]] = mapped_column(ForeignKey("data_domains.domain_id"))
    product_id:         Mapped[Optional[int]] = mapped_column(ForeignKey("data_products.product_id"))
    owner_user_id:      Mapped[int]  = mapped_column(ForeignKey("users.user_id"), nullable=False)
    enforce_mode:       Mapped[str]  = mapped_column(String(20), default="ADVISORY")
    current_version_id: Mapped[Optional[int]] = mapped_column(Integer)
    status:             Mapped[str]  = mapped_column(String(30), default="DRAFT")
    effective_date:     Mapped[Optional[date]] = mapped_column(Date)
    expiry_date:        Mapped[Optional[date]] = mapped_column(Date)
    created_at:         Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at:         Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    versions: Mapped[list[PolicyVersion]] = relationship("PolicyVersion", back_populates="policy", foreign_keys="PolicyVersion.policy_id")


# ─── Policy Version ───────────────────────────────────────────────────────────
class PolicyVersion(Base):
    __tablename__ = "policy_versions"

    version_id:          Mapped[int]  = mapped_column(Integer, primary_key=True)
    policy_id:           Mapped[int]  = mapped_column(ForeignKey("policies.policy_id"), nullable=False)
    version_number:      Mapped[int]  = mapped_column(Integer, nullable=False)
    version_label:       Mapped[Optional[str]] = mapped_column(String(50))
    is_current:          Mapped[bool] = mapped_column(Boolean, default=False)
    authored_by_user_id: Mapped[int]  = mapped_column(ForeignKey("users.user_id"), nullable=False)
    status:              Mapped[str]  = mapped_column(String(30), default="DRAFT")
    change_summary:      Mapped[Optional[str]] = mapped_column(Text)
    opa_rego_hash:       Mapped[Optional[str]] = mapped_column(String(64))
    created_at:          Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    deployed_at:         Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    policy: Mapped[Policy] = relationship("Policy", back_populates="versions", foreign_keys=[policy_id])
    rules:  Mapped[list[PolicyRule]] = relationship("PolicyRule", back_populates="version")


# ─── Policy Rule ──────────────────────────────────────────────────────────────
class PolicyRule(Base):
    __tablename__ = "policy_rules"

    rule_id:          Mapped[int]  = mapped_column(Integer, primary_key=True)
    version_id:       Mapped[int]  = mapped_column(ForeignKey("policy_versions.version_id"), nullable=False)
    rule_name:        Mapped[str]  = mapped_column(String(255), nullable=False)
    rule_description: Mapped[Optional[str]] = mapped_column(Text)
    rule_order:       Mapped[int]  = mapped_column(Integer, default=0)
    rule_type:        Mapped[str]  = mapped_column(String(50), nullable=False)
    effect:           Mapped[str]  = mapped_column(String(10), nullable=False)
    is_active:        Mapped[bool] = mapped_column(Boolean, default=True)
    created_at:       Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    version:    Mapped[PolicyVersion] = relationship("PolicyVersion", back_populates="rules")
    subjects:   Mapped[list[PolicyRuleSubject]]   = relationship("PolicyRuleSubject",   back_populates="rule")
    actions:    Mapped[list[PolicyRuleAction]]    = relationship("PolicyRuleAction",    back_populates="rule")
    conditions: Mapped[list[PolicyRuleCondition]] = relationship("PolicyRuleCondition", back_populates="rule")
    resources:  Mapped[list[PolicyRuleResource]]  = relationship("PolicyRuleResource",  back_populates="rule")


# ─── Rule Subject ─────────────────────────────────────────────────────────────
class PolicyRuleSubject(Base):
    __tablename__ = "policy_rule_subjects"

    subject_id:   Mapped[int]  = mapped_column(Integer, primary_key=True)
    rule_id:      Mapped[int]  = mapped_column(ForeignKey("policy_rules.rule_id"), nullable=False)
    subject_type: Mapped[str]  = mapped_column(String(30), nullable=False)
    role_id:      Mapped[Optional[int]] = mapped_column(ForeignKey("roles.role_id"))
    user_id:      Mapped[Optional[int]] = mapped_column(ForeignKey("users.user_id"))

    rule: Mapped[PolicyRule] = relationship("PolicyRule", back_populates="subjects")


# ─── Rule Action ──────────────────────────────────────────────────────────────
class PolicyRuleAction(Base):
    __tablename__ = "policy_rule_actions"

    action_id:        Mapped[int]  = mapped_column(Integer, primary_key=True)
    rule_id:          Mapped[int]  = mapped_column(ForeignKey("policy_rules.rule_id"), nullable=False)
    action_type:      Mapped[str]  = mapped_column(String(50), nullable=False)
    mask_type:        Mapped[Optional[str]] = mapped_column(String(50))
    mask_expression:  Mapped[Optional[str]] = mapped_column(Text)
    filter_column:    Mapped[Optional[str]] = mapped_column(String(255))
    filter_operator:  Mapped[Optional[str]] = mapped_column(String(20))
    filter_value_type:Mapped[Optional[str]] = mapped_column(String(30))
    filter_value:     Mapped[Optional[str]] = mapped_column(String(255))
    created_at:       Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    rule: Mapped[PolicyRule] = relationship("PolicyRule", back_populates="actions")


# ─── Rule Condition ───────────────────────────────────────────────────────────
class PolicyRuleCondition(Base):
    __tablename__ = "policy_rule_conditions"

    condition_id:      Mapped[int] = mapped_column(Integer, primary_key=True)
    rule_id:           Mapped[int] = mapped_column(ForeignKey("policy_rules.rule_id"), nullable=False)
    condition_group:   Mapped[int] = mapped_column(Integer, default=1)
    attribute_type:    Mapped[str] = mapped_column(String(30), nullable=False)
    attribute_key:     Mapped[str] = mapped_column(String(100), nullable=False)
    operator:          Mapped[str] = mapped_column(String(30), nullable=False)
    compare_value_type:Mapped[str] = mapped_column(String(30), nullable=False)
    compare_value:     Mapped[Optional[str]] = mapped_column(String(500))
    is_negated:        Mapped[bool] = mapped_column(Boolean, default=False)
    created_at:        Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    rule: Mapped[PolicyRule] = relationship("PolicyRule", back_populates="conditions")


# ─── Rule Resource ────────────────────────────────────────────────────────────
class PolicyRuleResource(Base):
    __tablename__ = "policy_rule_resources"

    resource_id:    Mapped[int] = mapped_column(Integer, primary_key=True)
    rule_id:        Mapped[int] = mapped_column(ForeignKey("policy_rules.rule_id"), nullable=False)
    platform_id:    Mapped[int] = mapped_column(Integer, nullable=False)
    database_id:    Mapped[Optional[int]] = mapped_column(Integer)
    schema_id:      Mapped[Optional[int]] = mapped_column(Integer)
    table_id:       Mapped[Optional[int]] = mapped_column(Integer)
    resource_scope: Mapped[str] = mapped_column(String(30), nullable=False)

    rule: Mapped[PolicyRule] = relationship("PolicyRule", back_populates="resources")
