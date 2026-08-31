package policy.rbac

import rego.v1

default allow := false

# Allow if user has a matching role AND all conditions pass
allow if {
    some rule in input.policy.rules
    rule.effect == "ALLOW"
    rule.rule_type in {"RBAC", "COMBINED"}
    _subject_matches(rule)
    _all_conditions_pass(rule)
}

# Explicit DENY always overrides
deny if {
    some rule in input.policy.rules
    rule.effect == "DENY"
    _subject_matches(rule)
}

_subject_matches(rule) if {
    some subject in rule.subjects
    subject.subject_type == "ROLE"
    subject.role_code in input.user.roles
}

_subject_matches(rule) if {
    some subject in rule.subjects
    subject.subject_type == "ANY"
}

_all_conditions_pass(rule) if {
    count(rule.conditions) == 0
}

_all_conditions_pass(rule) if {
    count(rule.conditions) > 0
    # Group conditions and evaluate: AND within group, OR across groups
    groups := {g | some c in rule.conditions; g := c.condition_group}
    some group in groups
    _group_passes(rule.conditions, group)
}

_group_passes(conditions, group) if {
    group_conditions := [c | some c in conditions; c.condition_group == group]
    every c in group_conditions {
        _condition_passes(c)
    }
}

_condition_passes(c) if {
    c.operator == "EQ"
    c.attribute_type == "USER_ATTRIBUTE"
    input.user.attributes[c.attribute_key] == c.compare_value
}

_condition_passes(c) if {
    c.operator == "IN"
    c.attribute_type == "USER_ATTRIBUTE"
    vals := split(c.compare_value, ",")
    input.user.attributes[c.attribute_key] in vals
}

_condition_passes(c) if {
    c.operator == "IS_NOT_NULL"
    c.attribute_type == "USER_ATTRIBUTE"
    _ := input.user.attributes[c.attribute_key]
}
