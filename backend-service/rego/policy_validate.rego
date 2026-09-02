package policy.validate

import rego.v1

# ==============================================================================
# Immuta-Grade Policy Specification Validator
# Validates policy AST structure, rule completeness, type consistency,
# and detects conflicting permissions before policy activation/deployment.
# ==============================================================================

# ─── Top-Level Validation Status ──────────────────────────────────────────────
default valid := true

valid := false if {
    count(violations) > 0
}

# ─── 1. Rule Completeness Checks ──────────────────────────────────────────────
violations contains msg if {
    count(input.rules) == 0
    msg := "Policy version must define at least one active governance rule."
}

violations contains msg if {
    some rule in input.rules
    rule.effect == "ALLOW"
    count(rule.subjects) == 0
    msg := sprintf("Rule '%v' (%v) has effect ALLOW but specifies no target subjects.", [rule.rule_name, rule.rule_id])
}

violations contains msg if {
    some rule in input.rules
    count(rule.actions) == 0
    msg := sprintf("Rule '%v' (%v) defines no governance actions (e.g. MASK_COLUMN, FILTER_ROWS, GRANT_SELECT).", [rule.rule_name, rule.rule_id])
}

# ─── 2. Action Specification Checks ───────────────────────────────────────────
valid_action_types := {
    "GRANT_SELECT", "GRANT_INSERT", "GRANT_UPDATE", "DENY_ACCESS",
    "MASK_COLUMN", "FILTER_ROWS", "AUDIT_LOG"
}

violations contains msg if {
    some rule in input.rules
    some action in rule.actions
    not action.action_type in valid_action_types
    msg := sprintf("Rule '%v' contains unrecognized action_type '%v'.", [rule.rule_name, action.action_type])
}

valid_mask_types := {
    "HASH_SHA256", "EMAIL_REDACT", "PARTIAL_4_DIGITS", "NULLIFY",
    "CUSTOM", "NULL_MASK", "PARTIAL_MASK", "EMAIL_MASK", "PHONE_MASK"
}

violations contains msg if {
    some rule in input.rules
    some action in rule.actions
    action.action_type == "MASK_COLUMN"
    action.mask_type != null
    not action.mask_type in valid_mask_types
    msg := sprintf("Rule '%v' specifies invalid mask_type '%v'.", [rule.rule_name, action.mask_type])
}

violations contains msg if {
    some rule in input.rules
    some action in rule.actions
    action.action_type == "MASK_COLUMN"
    action.mask_type == "CUSTOM"
    action.mask_expression == null
    msg := sprintf("Rule '%v' specifies CUSTOM mask_type but provides no mask_expression.", [rule.rule_name])
}

violations contains msg if {
    some rule in input.rules
    some action in rule.actions
    action.action_type == "FILTER_ROWS"
    action.filter_column == null
    msg := sprintf("Rule '%v' specifies FILTER_ROWS action without defining filter_column.", [rule.rule_name])
}

# ─── 3. Data Type Consistency Checks ──────────────────────────────────────────
violations contains msg if {
    some rule in input.rules
    some condition in rule.conditions
    condition.expected_type == "NUMBER"
    val := condition.compare_value
    val != null
    val != ""
    not is_number_convertible(val)
    msg := sprintf("Type mismatch on attribute '%v': expected numeric value, got '%v'.", [condition.attribute_key, val])
}

violations contains msg if {
    some rule in input.rules
    some condition in rule.conditions
    condition.expected_type == "BOOLEAN"
    val := condition.compare_value
    val != null
    val != ""
    not is_boolean_convertible(val)
    msg := sprintf("Type mismatch on attribute '%v': expected boolean (true/false), got '%v'.", [condition.attribute_key, val])
}

violations contains msg if {
    some rule in input.rules
    some condition in rule.conditions
    condition.operator == "REGEX"
    val := condition.compare_value
    not regex.is_valid(val)
    msg := sprintf("Invalid regular expression pattern '%v' for condition on '%v'.", [val, condition.attribute_key])
}

# ─── 4. Conflict Detection (Simultaneous ALLOW and DENY) ───────────────────────
violations contains msg if {
    some allow_rule in input.rules
    some deny_rule in input.rules
    allow_rule.rule_id != deny_rule.rule_id
    allow_rule.effect == "ALLOW"
    deny_rule.effect  == "DENY"
    some allow_subj in allow_rule.subjects
    some deny_subj  in deny_rule.subjects
    allow_subj.role_code == deny_subj.role_code
    allow_subj.role_code != null
    count(allow_rule.conditions) == 0
    count(deny_rule.conditions) == 0
    msg := sprintf("Unconditional conflict: role '%v' is both ALLOWed (Rule '%v') and DENYed (Rule '%v') without qualifying conditions.", [
        allow_subj.role_code, allow_rule.rule_name, deny_rule.rule_name
    ])
}

# ─── Helper Functions ─────────────────────────────────────────────────────────
is_number_convertible(val) if {
    is_number(val)
}

is_number_convertible(val) if {
    is_string(val)
    num := to_number(val)
    is_number(num)
}

is_boolean_convertible(val) if {
    is_boolean(val)
}

is_boolean_convertible(val) if {
    is_string(val)
    lower(val) in {"true", "false", "1", "0", "yes", "no"}
}
