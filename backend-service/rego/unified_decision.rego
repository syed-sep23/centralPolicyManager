package policy.decision

import rego.v1
import data.policy.masking
import data.policy.pbac
import data.policy.rbac
import data.policy.rls

# ==============================================================================
# CES-Grade Unified Governance Decision Engine
# Evaluates identity entitlements, dynamic ABAC attributes, contextual PBAC purposes,
# data masking, and row-level security into a single, high-performance decision.
# ==============================================================================

# ─── Default Decisions ────────────────────────────────────────────────────────
default allow             := false
default decision          := "DENY"
default mask_action       := null
default row_filter_clause := null

# ─── Master Authorization Rule ────────────────────────────────────────────────
allow if {
    rbac.allow
    pbac.purpose_permitted
    not rbac.deny
}

# ─── Decision Classification ──────────────────────────────────────────────────
decision := "PERMIT" if {
    allow
}

decision := "DENY" if {
    not allow
}

# ─── Masking Action Delegation ────────────────────────────────────────────────
mask_action := masking.mask_action if {
    allow
    masking.is_masked
}

# ─── Row Filter Clause Delegation ─────────────────────────────────────────────
row_filter_clause := rls.row_filter_clause if {
    allow
    rls.is_filtered
}

# ─── Decision Audit Trail & Reasons ───────────────────────────────────────────
audit_reasons contains "Access allowed by matching RBAC/ABAC policy rule." if {
    rbac.allow
}

audit_reasons contains "Access explicitly denied by matching DENY rule." if {
    rbac.deny
}

audit_reasons contains pbac.rejection_reason if {
    not pbac.purpose_permitted
    pbac.rejection_reason != null
}

audit_reasons contains sprintf("Column '%v' masked using transformation '%v'.", [input.resource.column, masking.mask_action]) if {
    masking.is_masked
}

audit_reasons contains sprintf("Row-level filtering enforced: %v", [rls.row_filter_clause]) if {
    rls.is_filtered
}

# ─── Full Governance Evaluation Result Payload ────────────────────────────────
evaluation_result := {
    "decision": decision,
    "allow": allow,
    "user": {
        "user_id": input.user.user_id,
        "username": input.user.username,
        "roles": input.user.roles,
    },
    "resource": {
        "table": input.resource.table,
        "column": input.resource.column,
        "tags": input.resource.tags,
    },
    "context": {
        "purpose": input.context.purpose,
        "purpose_permitted": pbac.purpose_permitted,
    },
    "governance": {
        "is_masked": masking.is_masked,
        "mask_action": mask_action,
        "is_filtered": rls.is_filtered,
        "row_filter_clause": row_filter_clause,
    },
    "audit_trail": [r | some r in audit_reasons],
}
