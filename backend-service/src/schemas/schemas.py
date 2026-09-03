"""Pydantic V2 schemas for Core Backend Service."""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

# Types
PolicyStatus = Literal[
    "DRAFT", "VALIDATED", "FAILED_VALIDATION", "DEPLOYING", "ENFORCED", "DEPRECATED", "ROLLBACK"
]
EnforceMode = Literal["ADVISORY", "ENFORCED"]
RuleType = Literal["RBAC", "ABAC", "COMBINED"]
RuleEffect = Literal["ALLOW", "DENY"]
SubjectType = Literal["ROLE", "USER", "ABAC_GROUP", "ANY"]
ActionType = Literal[
    "GRANT_SELECT",
    "GRANT_INSERT",
    "GRANT_UPDATE",
    "DENY_ACCESS",
    "MASK_COLUMN",
    "FILTER_ROWS",
    "AUDIT_LOG",
]
MaskType = Literal["NULL_MASK", "HASH_SHA256", "PARTIAL_MASK", "EMAIL_MASK", "PHONE_MASK", "CUSTOM"]
AttributeType = Literal[
    "USER_ATTRIBUTE", "RESOURCE_ATTRIBUTE", "ENV_ATTRIBUTE", "SESSION_ATTRIBUTE"
]
Operator = Literal[
    "EQ",
    "NEQ",
    "IN",
    "NOT_IN",
    "GT",
    "LT",
    "GTE",
    "LTE",
    "CONTAINS",
    "REGEX",
    "IS_NULL",
    "IS_NOT_NULL",
]
ResourceScope = Literal["DATABASE", "SCHEMA", "TABLE", "COLUMN", "TAG"]


class ConditionCreate(BaseModel):
    condition_group: int = 1
    attribute_type: AttributeType = "USER_ATTRIBUTE"
    attribute_key: str = Field(..., max_length=100)
    operator: Operator = "EQ"
    compare_value_type: Optional[Literal["LITERAL", "ATTRIBUTE_REF"]] = "LITERAL"
    compare_value: Optional[str] = None
    is_negated: bool = False


class ConditionRead(ConditionCreate):
    model_config = ConfigDict(from_attributes=True)
    condition_id: int
    rule_id: int
    created_at: datetime


class ActionCreate(BaseModel):
    action_type: ActionType
    mask_type: Optional[MaskType] = None
    mask_expression: Optional[str] = None
    filter_column: Optional[str] = None
    filter_operator: Optional[str] = None
    filter_value_type: Optional[str] = None
    filter_value: Optional[str] = None


class ActionRead(ActionCreate):
    model_config = ConfigDict(from_attributes=True)
    action_id: int
    rule_id: int


class SubjectCreate(BaseModel):
    subject_type: SubjectType
    role_id: Optional[int] = None
    user_id: Optional[int] = None


class SubjectRead(SubjectCreate):
    model_config = ConfigDict(from_attributes=True)
    subject_id: int
    rule_id: int


class ResourceCreate(BaseModel):
    platform_id: int
    database_id: Optional[int] = None
    schema_id: Optional[int] = None
    table_id: Optional[int] = None
    resource_scope: ResourceScope


class ResourceRead(ResourceCreate):
    model_config = ConfigDict(from_attributes=True)
    resource_id: int
    rule_id: int


class RuleCreate(BaseModel):
    rule_name: str = Field(..., max_length=255)
    rule_description: Optional[str] = None
    rule_order: int = 0
    rule_type: RuleType
    effect: RuleEffect
    subjects: list[SubjectCreate] = []
    actions: list[ActionCreate] = []
    conditions: list[ConditionCreate] = []
    resources: list[ResourceCreate] = []


class RuleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    rule_id: int
    version_id: int
    rule_name: str
    rule_description: Optional[str]
    rule_order: int
    rule_type: str
    effect: str
    is_active: bool
    created_at: datetime
    subjects: list[SubjectRead] = []
    actions: list[ActionRead] = []
    conditions: list[ConditionRead] = []
    resources: list[ResourceRead] = []


class VersionTargetRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    platform_id: int
    platform_code: Optional[str] = None
    deployment_status: Optional[str] = None
    temporal_workflow_id: Optional[str] = None
    deployed_at: Optional[datetime] = None


class VersionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    version_id: int
    policy_id: int
    version_number: int
    version_label: Optional[str]
    is_current: bool
    authored_by_user_id: int
    status: str
    change_summary: Optional[str]
    created_at: datetime
    deployed_at: Optional[datetime]
    rules: list[RuleRead] = []
    targets: list[VersionTargetRead] = []


class PolicyCreate(BaseModel):
    policy_name: str = Field(..., max_length=255)
    policy_code: str = Field(..., max_length=100, pattern=r"^[A-Z0-9_\-]+$")
    description: Optional[str] = None
    domain_id: Optional[int] = None
    product_id: Optional[int] = None
    enforce_mode: EnforceMode = "ADVISORY"
    effective_date: Optional[date] = None
    expiry_date: Optional[date] = None
    rules: list[RuleCreate] = []
    target_platform_ids: list[int] = []


class PolicyUpdate(BaseModel):
    policy_name: Optional[str] = None
    description: Optional[str] = None
    domain_id: Optional[int] = None
    product_id: Optional[int] = None
    enforce_mode: Optional[EnforceMode] = None
    effective_date: Optional[date] = None
    expiry_date: Optional[date] = None
    rules: Optional[list[RuleCreate]] = None
    target_platform_ids: Optional[list[int]] = None


class PolicyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    policy_id: int
    organization_id: int
    policy_name: str
    policy_code: str
    description: Optional[str]
    domain_id: Optional[int]
    product_id: Optional[int]
    owner_user_id: int
    enforce_mode: str
    current_version_id: Optional[int]
    status: str
    opa_status: Optional[str] = None
    deployment_status: Optional[str] = None
    effective_date: Optional[date]
    expiry_date: Optional[date]
    created_at: datetime
    updated_at: datetime


class PolicyDetail(PolicyRead):
    current_version: Optional[VersionRead] = None
    versions: list[VersionRead] = []
    target_platform_ids: list[int] = []


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class LoginRequest(BaseModel):
    username: str
    password: str


class UserCreate(BaseModel):
    username: str = Field(..., max_length=255)
    email: str = Field(..., max_length=255)
    display_name: Optional[str] = None
    password: str = Field(..., min_length=8)
    department: Optional[str] = None
    job_title: Optional[str] = None


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    user_id: int
    username: str
    email: str
    display_name: Optional[str]
    department: Optional[str]
    is_active: bool


class PaginatedPolicies(BaseModel):
    total: int
    page: int
    size: int
    items: list[PolicyRead]
