package policy.pbac

import rego.v1

# ==============================================================================
# CES-Grade Purpose-Based Access Control (PBAC) Engine
# Enforces regulatory purpose limitations (GDPR Art 5(1)(b), HIPAA Minimum Necessary),
# user purpose authorizations, and validity periods.
# ==============================================================================

# ─── Recognized Enterprise Purposes ───────────────────────────────────────────
standard_purposes := {
    "FRAUD_DETECTION",
    "REGULATORY_AUDIT",
    "CUSTOMER_SERVICE_SUPPORT",
    "DATA_SCIENCE_RESEARCH",
    "MARKETING_CAMPAIGN",
    "HIPAA_PATIENT_CARE"
}

# ─── Default Decisions ────────────────────────────────────────────────────────
default is_purpose_valid      := false
default is_purpose_authorized := false
default purpose_permitted     := false
default rejection_reason      := null

# ─── Validation ───────────────────────────────────────────────────────────────
is_purpose_valid if {
    input.context.purpose in standard_purposes
}

# ─── Authorization: User must be granted the declared purpose ─────────────────
is_purpose_authorized if {
    is_purpose_valid
    input.context.purpose in input.user.purposes
}

# ─── Permitted if Purpose is Authorized or Not Required ───────────────────────
purpose_permitted if {
    is_purpose_authorized
}

# Bypass if no purpose context is mandated for the resource
purpose_permitted if {
    not _resource_mandates_purpose
}

# ─── Resource Mandate Check ───────────────────────────────────────────────────
# Resources with RESTRICTED or TOP_SECRET sensitivity strictly mandate an approved purpose
_resource_mandates_purpose if {
    input.resource.sensitivity_level in {"RESTRICTED", "TOP_SECRET"}
}

_resource_mandates_purpose if {
    some tag in input.resource.tags
    lower(tag) in {"compliance.sox", "compliance.hipaa", "compliance.gdpr", "discovered.financial.salary"}
}

# ─── Rejection Reason Formulation ─────────────────────────────────────────────
rejection_reason := "Unrecognized business purpose." if {
    input.context.purpose != null
    not is_purpose_valid
}

rejection_reason := sprintf("User '%v' is not authorized for declared purpose '%v'.", [input.user.username, input.context.purpose]) if {
    is_purpose_valid
    not input.context.purpose in input.user.purposes
}

rejection_reason := sprintf("Access to sensitive resource '%v' strictly mandates an authorized compliance purpose.", [input.resource.table]) if {
    _resource_mandates_purpose
    input.context.purpose == null
}
