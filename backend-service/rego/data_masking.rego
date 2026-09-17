package policy.masking

import rego.v1

# ==============================================================================
# CES-Grade Dynamic Data Masking Engine
# Evaluates column-level and tag-level masking policies with dynamic exemptions
# based on identity roles, ABAC attributes, and contextual PBAC purposes.
# ==============================================================================

# ─── Default Decisions ────────────────────────────────────────────────────────
default is_masked    := false
default mask_action  := null
default mask_applied := null

# ─── Evaluation against Single Target Column ──────────────────────────────────
# A column is masked if a matching policy rule has action MASK_COLUMN and the caller is not exempt.
is_masked if {
    mask_action != null
}

mask_action := action.mask_type if {
    some rule in input.policy.rules
    rule.is_active != false
    _resource_matches(rule)
    some action in rule.actions
    action.action_type == "MASK_COLUMN"
    not _is_caller_exempt(rule)
}

# ─── Resource Scoping Logic ───────────────────────────────────────────────────
# 1. Direct Column Targeting: Rule explicitly scopes to column name
_resource_matches(rule) if {
    some res in rule.resources
    res.resource_scope == "COLUMN"
    lower(res.column_name) == lower(input.resource.column)
}

# 2. Direct action filter_column match
_resource_matches(rule) if {
    some action in rule.actions
    action.filter_column != null
    lower(action.filter_column) == lower(input.resource.column)
}

# ─── Exemption Evaluation ─────────────────────────────────────────────────────
# Caller is exempt if:
# 1. Caller possesses super-admin / security-admin system privileges
_is_caller_exempt(rule) if {
    some admin_role in {"SUPER_ADMIN", "ACCOUNTADMIN", "SYSADMIN", "ROLE_SECURITY"}
    admin_role in input.user.roles
}

# 2. Caller matches an explicit exemption subject on the rule
_is_caller_exempt(rule) if {
    rule.effect == "ALLOW"
    some subject in rule.subjects
    subject.subject_type == "ROLE"
    subject.role_code in input.user.roles
    _all_conditions_pass(rule)
}

# ─── Condition Checking ───────────────────────────────────────────────────────
_all_conditions_pass(rule) if {
    count(rule.conditions) == 0
}

_all_conditions_pass(rule) if {
    count(rule.conditions) > 0
    every c in rule.conditions {
        _condition_passes(c)
    }
}

_condition_passes(c) if {
    input.user.attributes[c.attribute_key] == c.compare_value
}
