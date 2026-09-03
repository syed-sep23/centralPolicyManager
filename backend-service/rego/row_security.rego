package policy.rls

import rego.v1

# ==============================================================================
# CES-Grade Row-Level Security (RLS) & Row Filtering Engine
# Evaluates row filtering rules, tenant isolation, and attribute-driven SQL predicates
# pushed down into user query WHERE clauses.
# ==============================================================================

# ─── Default Decisions ────────────────────────────────────────────────────────
default is_filtered         := false
default unrestricted        := false
default row_filter_clause   := null

# ─── Unrestricted Privileged Bypass ───────────────────────────────────────────
unrestricted if {
    some role in {"ACCOUNTADMIN", "SUPER_ADMIN", "SYSADMIN"}
    role in input.user.roles
}

# ─── Filter Status ────────────────────────────────────────────────────────────
is_filtered if {
    not unrestricted
    count(active_predicates) > 0
}

# ─── Combined Row Filter Clause ───────────────────────────────────────────────
row_filter_clause := concat(" AND ", [p | some p in active_predicates]) if {
    is_filtered
}

# ─── Active Predicates Collection ─────────────────────────────────────────────
active_predicates contains pred if {
    some rule in input.policy.rules
    rule.is_active != false
    _applies_to_table(rule)
    _subject_matches(rule)
    some action in rule.actions
    action.action_type == "FILTER_ROWS"
    pred := _generate_predicate(action)
    not unrestricted
    not _is_caller_exempt(rule)
}

# ─── Subject Matching (Who is filtered) ───────────────────────────────────────
_subject_matches(rule) if {
    some subject in rule.subjects
    subject.subject_type == "ROLE"
    subject.role_code in input.user.roles
}

_subject_matches(rule) if {
    some subject in rule.subjects
    subject.subject_type == "ANY"
}

_subject_matches(rule) if {
    count(rule.subjects) == 0
}

# ─── Predicate Generator ──────────────────────────────────────────────────────
# 1. Literal value predicate (e.g. REGION = 'US_EAST')
_generate_predicate(action) := sprintf("%v = '%v'", [action.filter_column, action.filter_value]) if {
    action.filter_value != null
    action.filter_value_type != "USER_ATTRIBUTE"
}

# 2. Dynamic attribute predicate (e.g. REGION = 'US' from user.attributes.country)
_generate_predicate(action) := sprintf("%v = '%v'", [action.filter_column, attr_val]) if {
    action.filter_value_type == "USER_ATTRIBUTE"
    attr_val := input.user.attributes[action.filter_value]
}

# ─── Scope Matching ───────────────────────────────────────────────────────────
_applies_to_table(rule) if {
    some res in rule.resources
    res.resource_scope in {"TABLE", "SCHEMA", "DATABASE"}
    lower(res.table_name) == lower(input.resource.table)
}

_applies_to_table(rule) if {
    # If no resources specified on rule, fallback to policy-level target table
    count(rule.resources) == 0
}

# ─── Exemption Evaluation ─────────────────────────────────────────────────────
_is_caller_exempt(rule) if {
    unrestricted
}

_is_caller_exempt(rule) if {
    some c in rule.conditions
    c.attribute_key == "purpose"
    c.operator == "EQ"
    input.context.purpose == c.compare_value
}

