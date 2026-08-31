package policy.validate

import rego.v1

# ─── Top-level validation result ──────────────────────────────────────────────
default valid := true

valid := false if {
    count(violations) > 0
}

violations contains msg if {
    count(input.rules) == 0
    msg := "Policy has no rules"
}

violations contains msg if {
    some rule in input.rules
    rule.effect == "ALLOW"
    count(rule.subjects) == 0
    msg := sprintf("Rule '%v' has effect ALLOW but no subjects defined", [rule.rule_id])
}

violations contains msg if {
    some rule in input.rules
    count(rule.actions) == 0
    msg := sprintf("Rule '%v' has no actions defined", [rule.rule_id])
}

# Detect invalid numeric data types (e.g. string value provided for NUMBER attribute)
violations contains msg if {
    some rule in input.rules
    some condition in rule.conditions
    condition.expected_type == "NUMBER"
    val := condition.compare_value
    val != null
    val != ""
    not is_number_convertible(val)
    msg := sprintf("Data type validation failed for attribute '%v': expected numeric value, but got string '%v'", [condition.attribute_key, val])
}

# Detect invalid boolean data types
violations contains msg if {
    some rule in input.rules
    some condition in rule.conditions
    condition.expected_type == "BOOLEAN"
    val := condition.compare_value
    val != null
    val != ""
    not is_boolean_convertible(val)
    msg := sprintf("Data type validation failed for attribute '%v': expected BOOLEAN (true/false), but got '%v'", [condition.attribute_key, val])
}

# Detect conflicting rules: same subject allowed AND denied on same scope
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
    msg := sprintf("Conflicting ALLOW/DENY for role '%v'", [allow_subj.role_code])
}

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
    lower(val) == "true"
}
is_boolean_convertible(val) if {
    is_string(val)
    lower(val) == "false"
}
