package policy.rbac

import rego.v1

# ==============================================================================
# Immuta-Grade RBAC & ABAC Access Decision Engine
# Evaluates user identities, inherited group memberships, and multi-attribute
# conditions with Boolean grouping (AND within condition group, OR across groups).
# ==============================================================================

# ─── Default Decision ─────────────────────────────────────────────────────────
default allow := false
default deny  := false

# ─── Allow Rule: Triggered when an active ALLOW rule matches subject and conditions ──
allow if {
    not deny
    some rule in input.policy.rules
    rule.effect == "ALLOW"
    rule.is_active != false
    _subject_matches(rule)
    _all_conditions_pass(rule)
}

# ─── Deny Rule: Explicit DENY always overrides any ALLOW ───────────────────────
deny if {
    some rule in input.policy.rules
    rule.effect == "DENY"
    rule.is_active != false
    _subject_matches(rule)
    _all_conditions_pass(rule)
}

# ─── Subject Matching Logic ───────────────────────────────────────────────────
# 1. Match by Role / Group Membership (including inherited group codes)
_subject_matches(rule) if {
    some subject in rule.subjects
    subject.subject_type == "ROLE"
    subject.role_code in input.user.roles
}

# 2. Match by Specific User Account ID
_subject_matches(rule) if {
    some subject in rule.subjects
    subject.subject_type == "USER"
    subject.user_id == input.user.user_id
}

# 3. Match Universal "ANY" (Wildcard audience)
_subject_matches(rule) if {
    some subject in rule.subjects
    subject.subject_type == "ANY"
}

# ─── Condition Evaluation Engine ──────────────────────────────────────────────
# Empty conditions pass unconditionally
_all_conditions_pass(rule) if {
    count(rule.conditions) == 0
}

# Multi-condition evaluation: Disjunctive Normal Form (DNF)
# Condition groups are OR'd together; conditions within a group are AND'd together.
_all_conditions_pass(rule) if {
    count(rule.conditions) > 0
    groups := {g | some c in rule.conditions; g := c.condition_group}
    some group in groups
    _group_passes(rule.conditions, group)
}

_group_passes(conditions, group) if {
    group_conditions := [c | some c in conditions; c.condition_group == group]
    every c in group_conditions {
        _condition_evaluation(c)
    }
}

# Wrap condition logic with negation flag support
_condition_evaluation(c) if {
    c.is_negated == true
    not _condition_passes(c)
}

_condition_evaluation(c) if {
    c.is_negated != true
    _condition_passes(c)
}

# ─── Condition Operator Implementations ───────────────────────────────────────
# Attribute Resolver: Extracts from user.attributes or context (e.g. purpose)
_resolve_attr(c) := val if {
    c.attribute_type in {"USER_ATTRIBUTE", "ABAC_ATTRIBUTE"}
    val := input.user.attributes[c.attribute_key]
}

_resolve_attr(c) := val if {
    c.attribute_type in {"SESSION_ATTRIBUTE", "ENV_ATTRIBUTE", "CONTEXT"}
    val := input.context[c.attribute_key]
}

_resolve_attr(c) := val if {
    c.attribute_key == "purpose"
    val := input.context.purpose
}

# Operators:
_condition_passes(c) if {
    c.operator == "EQ"
    _resolve_attr(c) == c.compare_value
}

_condition_passes(c) if {
    c.operator == "NEQ"
    _resolve_attr(c) != c.compare_value
}

_condition_passes(c) if {
    c.operator == "IN"
    vals := [trim_space(v) | some v in split(c.compare_value, ",")]
    _resolve_attr(c) in vals
}

_condition_passes(c) if {
    c.operator == "NOT_IN"
    vals := [trim_space(v) | some v in split(c.compare_value, ",")]
    not _resolve_attr(c) in vals
}

_condition_passes(c) if {
    c.operator == "CONTAINS"
    contains(lower(_resolve_attr(c)), lower(c.compare_value))
}

_condition_passes(c) if {
    c.operator == "REGEX"
    regex.match(c.compare_value, _resolve_attr(c))
}

_condition_passes(c) if {
    c.operator == "GT"
    to_number(_resolve_attr(c)) > to_number(c.compare_value)
}

_condition_passes(c) if {
    c.operator == "GTE"
    to_number(_resolve_attr(c)) >= to_number(c.compare_value)
}

_condition_passes(c) if {
    c.operator == "LT"
    to_number(_resolve_attr(c)) < to_number(c.compare_value)
}

_condition_passes(c) if {
    c.operator == "LTE"
    to_number(_resolve_attr(c)) <= to_number(c.compare_value)
}

_condition_passes(c) if {
    c.operator == "IS_NOT_NULL"
    _resolve_attr(c) != null
    _resolve_attr(c) != ""
}

_condition_passes(c) if {
    c.operator == "IS_NULL"
    val := _resolve_attr(c)
    val in {null, ""}
}
