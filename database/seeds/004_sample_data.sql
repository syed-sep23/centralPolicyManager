-- ============================================================
-- 004_sample_data.sql
-- Complete Enterprise Seed Data for Central Entitlement Service (CES)
-- Covers: Organizations, Domains, Products, Users, Roles, Group Attributes,
-- ABAC User Attributes, PBAC Purposes, User Purposes, Access Requests,
-- Multi-Platform Catalog (Snowflake & Redshift), Hierarchical Tags,
-- Tag Assignments, Platform Role Mappings, Policies, and Deployments.
-- ============================================================

-- ─── Organizations ────────────────────────────────────────────────────────────
INSERT INTO organizations (organization_id, org_name, org_code, description) VALUES
(1, 'ACME Corporation', 'ACME', 'Primary enterprise tenant for Central Entitlement Service')
ON CONFLICT (organization_id) DO NOTHING;

-- ─── Data Domains ─────────────────────────────────────────────────────────────
INSERT INTO data_domains (domain_id, organization_id, domain_name, domain_code, description, domain_owner_ldap) VALUES
(1, 1, 'Revenue Analytics',     'DOM_REV',  'Financial revenue, billing, and transactional data', 'ldap://ou=finance,dc=acme,dc=com'),
(2, 1, 'Global HR',             'DOM_HR',   'Employee PII, payroll, and performance evaluations', 'ldap://ou=hr,dc=acme,dc=com'),
(3, 1, 'Customer 360',          'DOM_CUST', 'Customer profiles, behavior, and support interactions', 'ldap://ou=marketing,dc=acme,dc=com'),
(4, 1, 'Operations & Supply',   'DOM_OPS',  'Logistics, inventory, and supply chain metrics',    'ldap://ou=ops,dc=acme,dc=com'),
(5, 1, 'Financial Governance',  'DOM_GOV',  'Audit logs, regulatory compliance, and risk models','ldap://ou=compliance,dc=acme,dc=com')
ON CONFLICT (domain_id) DO NOTHING;

-- ─── Data Products ────────────────────────────────────────────────────────────
INSERT INTO data_products (product_id, domain_id, product_name, product_code, description, sensitivity_level) VALUES
(1, 1, 'Revenue Summary Feed',    'PROD_REV_SUM',  'Aggregated monthly revenue metrics per region', 'CONFIDENTIAL'),
(2, 1, 'GL Transactions Model',   'PROD_GL_TXN',   'General Ledger detailed transaction logs',      'RESTRICTED'),
(3, 2, 'Employee Directory Data', 'PROD_EMP_DIR',  'Basic employee names, titles, and org hierarchy','INTERNAL'),
(4, 2, 'Payroll & Compensation',  'PROD_PAYROLL',  'Detailed salary, bonus, and tax information',   'TOP_SECRET'),
(5, 3, 'Customer Profiles Core',  'PROD_CUST_PROF','Unified customer profile dataset with PII',     'RESTRICTED'),
(6, 3, 'Campaign Performance',    'PROD_MKT_CAMP', 'Marketing campaign engagement and clickstream', 'INTERNAL'),
(7, 4, 'Supply Chain Metrics',    'PROD_SUPPLY',   'Warehouse inventory and shipment tracking',     'INTERNAL'),
(8, 5, 'SOX Audit Reporting',     'PROD_SOX_AUDIT','SOX compliance transaction logs and sign-offs', 'RESTRICTED')
ON CONFLICT (product_id) DO NOTHING;

-- ─── Roles ────────────────────────────────────────────────────────────────────
INSERT INTO roles (role_id, organization_id, role_name, role_code, description, is_system_role) VALUES
(1,  1, 'Data Viewer',     'DATA_VIEWER',        'Read-only access to internal datasets',                     FALSE),
(2,  1, 'Data Analyst',    'DATA_ANALYST',       'Standard analytical access with non-PII query rights',     FALSE),
(3,  1, 'Data Engineer',   'DATA_ENGINEER',      'Pipeline creation, transformation, and schema control',     FALSE),
(4,  1, 'Policy Author',   'POLICY_AUTHOR',      'Permission to create, update, and draft governance policies',TRUE),
(5,  1, 'Policy Admin',    'POLICY_ADMIN',       'Permission to approve, deploy, and enforce policy versions',  TRUE),
(6,  1, 'Finance Analyst', 'FINANCE_ANALYST',    'Specialized finance role with GL and revenue access',       FALSE),
(7,  1, 'HR Analyst',      'HR_ANALYST',         'Specialized HR role with employee PII access',             FALSE),
(8,  1, 'Super Admin',     'SUPER_ADMIN',        'Platform super administrator',                               TRUE),
(9,  1, 'Role Analyst',    'ROLE_ANALYST',       'Analytical group role for ABAC and policy targeting',       FALSE),
(10, 1, 'Role Engineer',   'ROLE_DATA_ENGINEER', 'Engineering group role for pipeline transformations',       FALSE),
(11, 1, 'Role Compliance', 'ROLE_COMPLIANCE',    'Compliance and audit inspection role',                      FALSE),
(12, 1, 'Role Security',   'ROLE_SECURITY',      'Security governance and privilege oversight role',          FALSE),
(13, 1, 'Role Marketing',  'ROLE_MARKETING',     'Marketing campaigns and analytics targeting role',          FALSE)
ON CONFLICT (organization_id, role_code) DO NOTHING;

-- ─── Users ────────────────────────────────────────────────────────────────────
INSERT INTO users (user_id, organization_id, username, email, display_name, department, job_title, cost_center, office_location) VALUES
(1, 1, 'alice.chen',   'alice.chen@acme.com',   'Alice Chen',    'Finance',    'Finance Director',         'CC-001', 'New York'),
(2, 1, 'bob.smith',    'bob.smith@acme.com',    'Bob Smith',     'HR',         'HR Manager',               'CC-002', 'Chicago'),
(3, 1, 'carol.jones',  'carol.jones@acme.com',  'Carol Jones',   'Marketing',  'Marketing Director',       'CC-003', 'San Francisco'),
(4, 1, 'dave.lee',     'dave.lee@acme.com',     'Dave Lee',      'Operations', 'VP Operations',            'CC-004', 'Chicago'),
(5, 1, 'eve.taylor',   'eve.taylor@acme.com',   'Eve Taylor',    'Finance',    'Senior Financial Analyst', 'CC-001', 'New York'),
(6, 1, 'frank.nguyen', 'frank.nguyen@acme.com', 'Frank Nguyen',  'Engineering','Data Engineer',            'CC-005', 'Austin'),
(7, 1, 'admin',        'admin@acme.com',        'System Admin',  'IT',         'Platform Administrator',   'CC-000', 'Remote')
ON CONFLICT (user_id) DO NOTHING;

-- ─── User-Role Mappings ───────────────────────────────────────────────────────
INSERT INTO user_role_mappings (mapping_id, user_id, role_id, granted_by_user_id) VALUES
(1,  1, 6,  7), -- alice.chen  → Finance Analyst
(2,  1, 4,  7), -- alice.chen  → Policy Author
(3,  1, 9,  7), -- alice.chen  → ROLE_ANALYST
(4,  2, 7,  7), -- bob.smith   → HR Analyst
(5,  3, 2,  7), -- carol.jones → Data Analyst
(6,  3, 13, 7), -- carol.jones → ROLE_MARKETING
(7,  4, 2,  7), -- dave.lee    → Data Analyst
(8,  5, 6,  1), -- eve.taylor  → Finance Analyst
(9,  5, 9,  1), -- eve.taylor  → ROLE_ANALYST
(10, 6, 3,  7), -- frank.nguyen→ Data Engineer
(11, 6, 10, 7), -- frank.nguyen→ ROLE_DATA_ENGINEER
(12, 7, 8,  7)  -- admin       → Super Admin
ON CONFLICT (mapping_id) DO NOTHING;

-- ─── User ABAC Attributes ─────────────────────────────────────────────────────
INSERT INTO user_attributes (attribute_id, user_id, attribute_key, attribute_value, attribute_source) VALUES
(1,  1, 'department',       'Finance',     'LDAP'),
(2,  1, 'clearance_level',  'RESTRICTED',  'MANUAL'),
(3,  1, 'cost_center',      'CC-001',      'LDAP'),
(4,  1, 'country',          'US',          'LDAP'),
(5,  2, 'department',       'HR',          'LDAP'),
(6,  2, 'clearance_level',  'TOP_SECRET',  'MANUAL'),
(7,  2, 'country',          'EU',          'LDAP'),
(8,  3, 'department',       'Marketing',   'LDAP'),
(9,  3, 'clearance_level',  'INTERNAL',    'LDAP'),
(10, 3, 'country',          'US',          'LDAP'),
(11, 4, 'department',       'Operations',  'LDAP'),
(12, 4, 'clearance_level',  'INTERNAL',    'LDAP'),
(13, 4, 'country',          'EU',          'LDAP'),
(14, 5, 'department',       'Finance',     'LDAP'),
(15, 5, 'clearance_level',  'CONFIDENTIAL','MANUAL'),
(16, 5, 'country',          'US',          'LDAP'),
(17, 6, 'department',       'Engineering', 'LDAP'),
(18, 6, 'clearance_level',  'RESTRICTED',  'MANUAL'),
(19, 6, 'country',          'US',          'LDAP'),
(20, 7, 'department',       'IT',          'LDAP'),
(21, 7, 'clearance_level',  'TOP_SECRET',  'SYSTEM'),
(22, 7, 'country',          'US',          'SYSTEM')
ON CONFLICT (user_id, attribute_key) DO UPDATE SET attribute_value = EXCLUDED.attribute_value;

-- ─── Group / Role ABAC Attributes (Inherited by Group Members) ─────────────────
INSERT INTO group_attributes (attribute_id, role_id, attribute_key, attribute_value, attribute_source) VALUES
(1,  9,  'department',       'Analytics',        'MANUAL'),
(2,  9,  'clearance_level',  'CONFIDENTIAL',     'MANUAL'),
(3,  10, 'environment',      'PRODUCTION',       'MANUAL'),
(4,  10, 'clearance_level',  'RESTRICTED',       'MANUAL'),
(5,  11, 'audit_scope',      'GLOBAL_ALL_DOMAINS','MANUAL'),
(6,  11, 'clearance_level',  'TOP_SECRET',       'MANUAL'),
(7,  12, 'security_tier',    'SOC_LEVEL_3',      'MANUAL'),
(8,  12, 'clearance_level',  'RESTRICTED',       'MANUAL'),
(9,  13, 'department',       'Marketing',        'MANUAL'),
(10, 13, 'region',           'US_WEST',          'MANUAL')
ON CONFLICT (role_id, attribute_key) DO UPDATE SET attribute_value = EXCLUDED.attribute_value;

-- ─── PBAC Business Purposes (Purpose-Based Access Control) ───────────────────
INSERT INTO purposes (purpose_id, purpose_code, purpose_name, description, compliance_mandate, retention_period_days, is_active) VALUES
(1, 'FRAUD_DETECTION',           'Fraud & AML Detection',                 'Contextual purpose for investigating suspicious transactions, card fraud, and anti-money laundering (AML).', 'AML / BSA Regulations',    180, TRUE),
(2, 'REGULATORY_AUDIT',         'Regulatory & Financial Audit',          'Purpose for conducting independent audits, SOX 404 control testing, and external regulatory reviews.',       'SOX 404 / SEC Mandate',     365, TRUE),
(3, 'CUSTOMER_SERVICE_SUPPORT',  'Customer Dispute Resolution & Support', 'Limited operational purpose for resolving customer inquiries, chargebacks, and account issues.',            'GDPR Art 6(1)(b) Contract', 90,  TRUE),
(4, 'DATA_SCIENCE_RESEARCH',     'Data Science & Predictive Modeling',    'Exploratory analytics and model training on anonymized data sets.',                                          'GDPR Art 89 Research',      730, TRUE),
(5, 'MARKETING_CAMPAIGN',        'Targeted Marketing Campaigns',          'Commercial marketing purpose for promotional outreach, targeted communications, and campaign performance.',  'GDPR Art 6(1)(a) Consent',  60,  TRUE),
(6, 'HIPAA_PATIENT_CARE',        'HIPAA Clinical Operations',             'Healthcare clinical operations adhering to HIPAA Minimum Necessary standards for patient treatment.',        'HIPAA Privacy Rule 45 CFR', 365, TRUE)
ON CONFLICT (purpose_code) DO UPDATE SET
    purpose_name = EXCLUDED.purpose_name,
    description = EXCLUDED.description,
    compliance_mandate = EXCLUDED.compliance_mandate,
    retention_period_days = EXCLUDED.retention_period_days;

-- ─── User Purpose Authorizations ──────────────────────────────────────────────
INSERT INTO user_purposes (user_purpose_id, user_id, purpose_id, authorized_by, valid_from, valid_until, is_active) VALUES
(1, 1, 1, 'admin@acme.com', NOW(), NOW() + INTERVAL '180 days', TRUE), -- Alice Chen → FRAUD_DETECTION
(2, 1, 2, 'admin@acme.com', NOW(), NOW() + INTERVAL '365 days', TRUE), -- Alice Chen → REGULATORY_AUDIT
(3, 3, 5, 'admin@acme.com', NOW(), NOW() + INTERVAL '60 days',  TRUE), -- Carol Jones → MARKETING_CAMPAIGN
(4, 5, 1, 'alice.chen',     NOW(), NOW() + INTERVAL '180 days', TRUE), -- Eve Taylor  → FRAUD_DETECTION
(5, 6, 4, 'admin@acme.com', NOW(), NOW() + INTERVAL '730 days', TRUE)  -- Frank Nguyen → DATA_SCIENCE_RESEARCH
ON CONFLICT (user_id, purpose_id) DO NOTHING;

-- ─── Entitlement & Subscription Requests ──────────────────────────────────────
INSERT INTO data_access_requests (request_id, request_number, requestor_id, domain_id, product_id, purpose_id, requested_role_id, access_level, justification, valid_for_days, status, reviewed_by_id, reviewed_at, review_comment) VALUES
(1, 'REQ-2026-0001', 5, 1, 2, 1, 9,  'READ', 'Urgent investigation of suspicious wire transfer activity in EMEA accounts for AML filing.', 30, 'APPROVED', 1, NOW() - INTERVAL '2 days', 'Approved for AML fraud investigation.'),
(2, 'REQ-2026-0002', 3, 3, 5, 5, 13, 'READ', 'Access customer profiles to build segment targeting for Q3 product launch.',                  60, 'PENDING',  NULL, NULL, NULL),
(3, 'REQ-2026-0003', 6, 1, 1, 4, 10, 'READ', 'Analyze monthly revenue aggregation latency for pipeline optimization.',                        90, 'PENDING',  NULL, NULL, NULL),
(4, 'REQ-2026-0004', 4, 4, 7, 2, 2,  'READ', 'Evaluate regional warehouse shipment bottlenecks against inventory data.',                     45, 'PENDING',  NULL, NULL, NULL),
(5, 'REQ-2026-0005', 2, 2, 4, 2, 7,  'READ', 'Conduct external HR compliance compensation audit report.',                                    30, 'REJECTED', 7, NOW() - INTERVAL '5 days', 'Requires Department Head counter-signature.')
ON CONFLICT (request_id) DO NOTHING;

-- ─── Platforms ────────────────────────────────────────────────────────────────
INSERT INTO metadata_platforms (platform_id, platform_code, platform_name, platform_version, connection_alias, account_identifier, warehouse, default_database, role_name, host, port, db_user, db_password) VALUES
(1, 'SNOWFLAKE', 'Snowflake Enterprise Data Cloud', '7.42', 'SNOWFLAKE_PROD', 'demo.us-east-1', 'CES_WH', 'FINANCE_DB', 'SYSADMIN', NULL, NULL, 'ces_svc', 'demo_password_2026'),
(2, 'REDSHIFT',  'Amazon Redshift Cluster',         '1.0.60', 'REDSHIFT_ANALYTICS', NULL, NULL, 'acme_dw', NULL, 'localhost', 5439, 'ces_svc', 'demo_password_2026')
ON CONFLICT (platform_id) DO NOTHING;

-- ─── Databases ────────────────────────────────────────────────────────────────
INSERT INTO metadata_databases (database_id, platform_id, database_name, database_owner) VALUES
(1, 1, 'FINANCE_DB',     'ACCOUNTADMIN'),
(2, 1, 'MARKETING_DB',   'ACCOUNTADMIN'),
(3, 2, 'analytics_prod', 'aws_admin'),
(4, 2, 'hr_warehouse',   'aws_admin')
ON CONFLICT (database_id) DO NOTHING;

-- ─── Schemas ──────────────────────────────────────────────────────────────────
INSERT INTO metadata_schemas (schema_id, database_id, schema_name, schema_owner) VALUES
(1, 1, 'PUBLIC',     'SYSADMIN'),
(2, 1, 'RESTRICTED', 'SYSADMIN'),
(3, 2, 'CAMPAIGNS',  'SYSADMIN'),
(4, 3, 'public',     'aws_admin'),
(5, 4, 'employee',   'aws_admin')
ON CONFLICT (schema_id) DO NOTHING;

-- ─── Tables ───────────────────────────────────────────────────────────────────
INSERT INTO metadata_tables (table_id, schema_id, table_name, table_type, table_owner, row_count_estimate, bytes_estimate) VALUES
(1,  1, 'CUSTOMER_PROFILES',  'TABLE', 'SYSADMIN', 1500000, 256000000),
(2,  1, 'CAMPAIGN_RESULTS',   'TABLE', 'SYSADMIN', 5000000, 890000000),
(3,  2, 'SALARIES_SENSITIVE', 'TABLE', 'SYSADMIN', 12000,   4500000),
(4,  2, 'TAX_RECORDS',        'TABLE', 'SYSADMIN', 35000,   12000000),
(5,  1, 'GL_TRANSACTIONS',    'TABLE', 'SYSADMIN', 8900000, 1400000000),
(6,  3, 'CLICKSTREAM',        'TABLE', 'SYSADMIN', 45000000,7800000000),
(7,  4, 'employee_pii',       'TABLE', 'aws_admin',12000,   4500000),
(8,  4, 'customer_profiles',  'TABLE', 'aws_admin',1500000, 256000000),
(9,  5, 'payroll_history',    'TABLE', 'aws_admin',98000,   34000000),
(10, 4, 'revenue_summary',    'TABLE', 'aws_admin',450000,  88000000)
ON CONFLICT (table_id) DO NOTHING;

-- ─── Columns ──────────────────────────────────────────────────────────────────
INSERT INTO metadata_columns (table_id, column_name, ordinal_position, data_type, normalized_type, is_nullable, is_primary_key) VALUES
-- CUSTOMER_PROFILES (table_id=1, Snowflake)
(1, 'CUSTOMER_ID',       1, 'NUMBER(38,0)', 'NUMBER',    FALSE, TRUE),
(1, 'FIRST_NAME',        2, 'VARCHAR(100)', 'TEXT',      TRUE,  FALSE),
(1, 'LAST_NAME',         3, 'VARCHAR(100)', 'TEXT',      TRUE,  FALSE),
(1, 'EMAIL',             4, 'VARCHAR(255)', 'TEXT',      TRUE,  FALSE),
(1, 'PHONE',             5, 'VARCHAR(50)',  'TEXT',      TRUE,  FALSE),
(1, 'DATE_OF_BIRTH',     6, 'DATE',         'DATE',      TRUE,  FALSE),
(1, 'ANNUAL_INCOME_USD', 7, 'NUMBER(12,2)', 'NUMBER',    TRUE,  FALSE),
(1, 'SSN_MASKED',        8, 'VARCHAR(11)',  'TEXT',      TRUE,  FALSE),
(1, 'CREATED_AT',        9, 'TIMESTAMP_NTZ','TIMESTAMP', FALSE, FALSE),
(1, 'UPDATED_AT',       10, 'TIMESTAMP_NTZ','TIMESTAMP', FALSE, FALSE),

-- CAMPAIGN_RESULTS (table_id=2, Snowflake)
(2, 'CAMPAIGN_ID',       1, 'NUMBER(38,0)', 'NUMBER',    FALSE, TRUE),
(2, 'CAMPAIGN_NAME',     2, 'VARCHAR(255)', 'TEXT',      FALSE, FALSE),
(2, 'IMPRESSIONS',       3, 'NUMBER(12,0)', 'NUMBER',    TRUE,  FALSE),
(2, 'CLICKS',            4, 'NUMBER(10,0)', 'NUMBER',    TRUE,  FALSE),
(2, 'CONVERSIONS',       5, 'NUMBER(10,0)', 'NUMBER',    TRUE,  FALSE),
(2, 'SPEND_USD',         6, 'NUMBER(15,2)', 'NUMBER',    FALSE, FALSE),
(2, 'ROI_PERCENT',       7, 'NUMBER(6,2)',  'NUMBER',    TRUE,  FALSE),
(2, 'START_DATE',        8, 'DATE',         'DATE',      FALSE, FALSE),
(2, 'END_DATE',          9, 'DATE',         'DATE',      TRUE,  FALSE),
(2, 'STATUS',           10, 'VARCHAR(50)',  'TEXT',      FALSE, FALSE),

-- SALARIES_SENSITIVE (table_id=3, Snowflake)
(3, 'EMPLOYEE_ID',       1, 'NUMBER(38,0)', 'NUMBER',    FALSE, TRUE),
(3, 'BASE_SALARY_USD',   2, 'NUMBER(12,2)', 'NUMBER',    FALSE, FALSE),
(3, 'BONUS_PERCENT',     4, 'NUMBER(5,2)',  'NUMBER',    TRUE,  FALSE),
(3, 'BANK_ACCOUNT_NUM',  5, 'VARCHAR(30)',  'TEXT',      FALSE, FALSE),
(3, 'ROUTING_NUMBER',    6, 'VARCHAR(20)',  'TEXT',      FALSE, FALSE),
(3, 'TAX_BRACKET',       7, 'VARCHAR(20)',  'TEXT',      TRUE,  FALSE),
(3, 'EFFECTIVE_DATE',    8, 'DATE',         'DATE',      FALSE, FALSE),

-- TAX_RECORDS (table_id=4, Snowflake)
(4, 'RECORD_ID',         1, 'NUMBER(38,0)', 'NUMBER',    FALSE, TRUE),
(4, 'EMPLOYEE_ID',       2, 'NUMBER(38,0)', 'NUMBER',    FALSE, FALSE),
(4, 'TAX_YEAR',          3, 'NUMBER(4,0)',  'NUMBER',    FALSE, FALSE),
(4, 'TOTAL_WAGES_USD',   4, 'NUMBER(15,2)', 'NUMBER',    FALSE, FALSE),
(4, 'FEDERAL_TAX_HELD',  5, 'NUMBER(12,2)', 'NUMBER',    FALSE, FALSE),
(4, 'STATE_TAX_HELD',    6, 'NUMBER(12,2)', 'NUMBER',    FALSE, FALSE),
(4, 'FILING_STATUS',     7, 'VARCHAR(50)',  'TEXT',      FALSE, FALSE),

-- GL_TRANSACTIONS (table_id=5, Snowflake)
(5, 'TRANSACTION_ID',    1, 'NUMBER(38,0)', 'NUMBER',    FALSE, TRUE),
(5, 'ACCOUNT_NUMBER',    2, 'VARCHAR(50)',  'TEXT',      FALSE, FALSE),
(5, 'JOURNAL_ENTRY_ID',  3, 'NUMBER(38,0)', 'NUMBER',    FALSE, FALSE),
(5, 'TRANSACTION_DATE',  4, 'DATE',         'DATE',      FALSE, FALSE),
(5, 'DEBIT_AMOUNT_USD',  5, 'NUMBER(18,2)', 'NUMBER',    FALSE, FALSE),
(5, 'CREDIT_AMOUNT_USD', 6, 'NUMBER(18,2)', 'NUMBER',    FALSE, FALSE),
(5, 'CURRENCY_CODE',     7, 'VARCHAR(3)',   'TEXT',      FALSE, FALSE),
(5, 'DESCRIPTION',       8, 'VARCHAR(500)', 'TEXT',      TRUE,  FALSE),
(5, 'POSTED_BY_USER_ID', 9, 'NUMBER(38,0)', 'NUMBER',    FALSE, FALSE),

-- CLICKSTREAM (table_id=6, Snowflake)
(6, 'EVENT_ID',          1, 'NUMBER(38,0)', 'NUMBER',    FALSE, TRUE),
(6, 'SESSION_ID',        2, 'VARCHAR(100)', 'TEXT',      FALSE, FALSE),
(6, 'USER_ID',           3, 'NUMBER(38,0)', 'NUMBER',    TRUE,  FALSE),
(6, 'PAGE_URL',          4, 'VARCHAR(1000)','TEXT',      FALSE, FALSE),
(6, 'EVENT_TYPE',        5, 'VARCHAR(50)',  'TEXT',      FALSE, FALSE),
(6, 'DEVICE_TYPE',       6, 'VARCHAR(50)',  'TEXT',      TRUE,  FALSE),
(6, 'IP_ADDRESS',        7, 'VARCHAR(45)',  'TEXT',      TRUE,  FALSE),
(6, 'EVENT_TIMESTAMP',   8, 'TIMESTAMP_NTZ','TIMESTAMP', FALSE, FALSE),

-- employee_pii (table_id=7, Redshift)
(7, 'emp_id',            1, 'integer',      'NUMBER',    FALSE, TRUE),
(7, 'first_name',        2, 'varchar(100)', 'TEXT',      FALSE, FALSE),
(7, 'last_name',         3, 'varchar(100)', 'TEXT',      FALSE, FALSE),
(7, 'email',             4, 'varchar(255)', 'TEXT',      FALSE, FALSE),
(7, 'national_id',       5, 'varchar(50)',  'TEXT',      FALSE, FALSE),
(7, 'salary_amount',     6, 'numeric(15,2)','NUMBER',    FALSE, FALSE),

-- customer_profiles (table_id=8, Redshift)
(8, 'customer_id',       1, 'integer',      'NUMBER',    FALSE, TRUE),
(8, 'full_name',         2, 'varchar(200)', 'TEXT',      FALSE, FALSE),
(8, 'email_address',     3, 'varchar(255)', 'TEXT',      FALSE, FALSE),
(8, 'phone_number',      4, 'varchar(50)',  'TEXT',      TRUE,  FALSE),
(8, 'credit_score',      5, 'integer',      'NUMBER',    TRUE,  FALSE),
(8, 'city',              6, 'varchar(100)', 'TEXT',      TRUE,  FALSE),

-- payroll_history (table_id=9, Redshift)
(9, 'payroll_id',        1, 'integer',      'NUMBER',    FALSE, TRUE),
(9, 'emp_id',            2, 'integer',      'NUMBER',    FALSE, FALSE),
(9, 'pay_period_start',  3, 'date',         'DATE',      FALSE, FALSE),
(9, 'pay_period_end',    4, 'date',         'DATE',      FALSE, FALSE),
(9, 'gross_pay_usd',     5, 'numeric(15,2)','NUMBER',    FALSE, FALSE),
(9, 'net_pay_usd',       6, 'numeric(15,2)','NUMBER',    FALSE, FALSE),

-- revenue_summary (table_id=10, Redshift)
(10, 'summary_id',       1, 'integer',      'NUMBER',    FALSE, TRUE),
(10, 'fiscal_year',      2, 'integer',      'NUMBER',    FALSE, FALSE),
(10, 'fiscal_quarter',   3, 'integer',      'NUMBER',    FALSE, FALSE),
(10, 'gross_revenue',    4, 'numeric(18,2)','NUMBER',    FALSE, FALSE),
(10, 'net_revenue',      5, 'numeric(18,2)','NUMBER',    FALSE, FALSE),
(10, 'region_code',      6, 'varchar(50)',  'TEXT',      FALSE, FALSE)
ON CONFLICT (table_id, column_name) DO NOTHING;

-- ─── Tags (Hierarchical Taxonomy Tree) ─────────────────────────────────────────
-- 1. Root Categories
INSERT INTO metadata_tags (tag_id, platform_id, tag_name, full_path, parent_tag_id, tag_category, source_type, description) VALUES
(1, NULL, 'Discovered',     'Discovered',               NULL, 'SYSTEM',         'SYSTEM', 'Root category for automated sensitive data discovery identifiers'),
(2, NULL, 'Governance',     'Governance',               NULL, 'GOVERNANCE',     'MANUAL', 'Enterprise data governance, privacy, and confidentiality levels'),
(3, NULL, 'Compliance',     'Compliance',               NULL, 'COMPLIANCE',     'MANUAL', 'Regulatory compliance mandates (HIPAA, GDPR, PCI-DSS, SOX)')
ON CONFLICT (full_path) DO NOTHING;

-- 2. Level 2 Branches
INSERT INTO metadata_tags (tag_id, platform_id, tag_name, full_path, parent_tag_id, tag_category, source_type, description) VALUES
(4, NULL, 'PII',             'Discovered.PII',           1, 'PII',             'DISCOVERED', 'Personally Identifiable Information branch'),
(5, NULL, 'Financial',       'Discovered.Financial',     1, 'FINANCIAL',       'DISCOVERED', 'Financial account and compensation data identifiers'),
(6, NULL, 'Location',        'Discovered.Location',      1, 'LOCATION',        'DISCOVERED', 'Geographic and address identifiers'),
(7, NULL, 'Confidentiality', 'Governance.Confidentiality', 2, 'CONFIDENTIALITY', 'MANUAL',     'Data classification tiers'),
(8, NULL, 'GDPR',            'Compliance.GDPR',          3, 'COMPLIANCE',      'MANUAL',     'European General Data Protection Regulation personal data'),
(9, NULL, 'HIPAA',           'Compliance.HIPAA',         3, 'COMPLIANCE',      'MANUAL',     'Health Insurance Portability and Accountability Act data'),
(10,NULL, 'PCI-DSS',         'Compliance.PCI-DSS',       3, 'COMPLIANCE',      'MANUAL',     'Payment Card Industry Data Security Standard data'),
(11,NULL, 'SOX',             'Compliance.SOX',           3, 'COMPLIANCE',      'MANUAL',     'Sarbanes-Oxley Act financial governance data')
ON CONFLICT (full_path) DO NOTHING;

-- 3. Level 3 Leaf Tags
INSERT INTO metadata_tags (tag_id, platform_id, tag_name, full_path, parent_tag_id, tag_category, source_type, description) VALUES
(12, NULL, 'Email',          'Discovered.PII.Email',                 4, 'PII',             'DISCOVERED', 'Email address columns'),
(13, NULL, 'Phone',          'Discovered.PII.Phone',                 4, 'PII',             'DISCOVERED', 'Telephone or mobile contact numbers'),
(14, NULL, 'SSN',            'Discovered.PII.SSN',                   4, 'PII',             'DISCOVERED', 'Social Security or National Identification numbers'),
(15, NULL, 'Name',           'Discovered.PII.Name',                  4, 'PII',             'DISCOVERED', 'Customer, employee, or individual personal names'),
(16, NULL, 'DateOfBirth',    'Discovered.PII.DateOfBirth',           4, 'PII',             'DISCOVERED', 'Individual birth dates'),
(17, NULL, 'BankAccount',    'Discovered.Financial.BankAccount',     5, 'FINANCIAL',       'DISCOVERED', 'Bank account, IBAN, or routing numbers'),
(18, NULL, 'RoutingNumber',  'Discovered.Financial.RoutingNumber',   5, 'FINANCIAL',       'DISCOVERED', 'Bank routing transit numbers'),
(19, NULL, 'Salary',         'Discovered.Financial.Salary',          5, 'FINANCIAL',       'DISCOVERED', 'Employee salary, wage, or compensation figures'),
(20, NULL, 'Income',         'Discovered.Financial.Income',          5, 'FINANCIAL',       'DISCOVERED', 'Annual income or gross earnings amounts'),
(21, NULL, 'CreditCard',     'Discovered.Financial.CreditCard',      5, 'FINANCIAL',       'DISCOVERED', 'Credit or debit card payment PANs'),
(22, NULL, 'CreditScore',    'Discovered.Financial.CreditScore',     5, 'FINANCIAL',       'DISCOVERED', 'Customer credit ratings or risk scores'),
(23, NULL, 'Address',        'Discovered.Location.Address',          6, 'LOCATION',        'DISCOVERED', 'Street, postal address, or residence'),
(24, NULL, 'City',           'Discovered.Location.City',             6, 'LOCATION',        'DISCOVERED', 'Municipality, city, or town name'),
(25, NULL, 'Public',         'Governance.Confidentiality.Public',    7, 'CONFIDENTIALITY', 'MANUAL',     'Publicly accessible unclassified data'),
(26, NULL, 'Internal',       'Governance.Confidentiality.Internal',  7, 'CONFIDENTIALITY', 'MANUAL',     'General internal business data'),
(27, NULL, 'Confidential',   'Governance.Confidentiality.Confidential', 7, 'CONFIDENTIALITY', 'MANUAL', 'Confidential enterprise business data'),
(28, NULL, 'Restricted',     'Governance.Confidentiality.Restricted',   7, 'CONFIDENTIALITY', 'MANUAL', 'Highest protection tier: restricted access only')
ON CONFLICT (full_path) DO NOTHING;

-- ─── Tag Assignments ──────────────────────────────────────────────────────────
INSERT INTO metadata_tag_assignments (assignment_id, tag_id, column_id, tag_value, confidence_score, assigned_by) VALUES
(1,  15, 2,  'FIRST_NAME',        0.98, 'AUTOMATED_DISCOVERY'),
(2,  15, 3,  'LAST_NAME',         0.98, 'AUTOMATED_DISCOVERY'),
(3,  12, 4,  'EMAIL',             0.99, 'AUTOMATED_DISCOVERY'),
(4,  13, 5,  'PHONE',             0.95, 'AUTOMATED_DISCOVERY'),
(5,  16, 6,  'DATE_OF_BIRTH',     0.97, 'AUTOMATED_DISCOVERY'),
(6,  20, 7,  'ANNUAL_INCOME_USD', 0.92, 'AUTOMATED_DISCOVERY'),
(7,  14, 8,  'SSN_MASKED',        0.99, 'AUTOMATED_DISCOVERY'),
(8,  19, 21, 'BASE_SALARY_USD',   0.96, 'AUTOMATED_DISCOVERY'),
(9,  17, 23, 'BANK_ACCOUNT_NUM',  0.99, 'AUTOMATED_DISCOVERY'),
(10, 18, 24, 'ROUTING_NUMBER',    0.98, 'AUTOMATED_DISCOVERY'),
(11, 12, 42, 'email',             0.99, 'AUTOMATED_DISCOVERY'),
(12, 14, 43, 'national_id',       0.99, 'AUTOMATED_DISCOVERY'),
(13, 19, 44, 'salary_amount',     0.97, 'AUTOMATED_DISCOVERY'),
(14, 15, 46, 'full_name',         0.98, 'AUTOMATED_DISCOVERY'),
(15, 12, 47, 'email_address',     0.99, 'AUTOMATED_DISCOVERY'),
(16, 13, 48, 'phone_number',      0.95, 'AUTOMATED_DISCOVERY'),
(17, 22, 49, 'credit_score',      0.93, 'AUTOMATED_DISCOVERY'),
(18, 24, 50, 'city',              0.91, 'AUTOMATED_DISCOVERY'),
(19, 19, 54, 'gross_pay_usd',     0.96, 'AUTOMATED_DISCOVERY'),
(20, 19, 55, 'net_pay_usd',       0.96, 'AUTOMATED_DISCOVERY')
ON CONFLICT (assignment_id) DO NOTHING;

-- ─── Data Product → Table Mappings ───────────────────────────────────────────
INSERT INTO data_product_table_mappings (mapping_id, product_id, table_id, is_primary_table) VALUES
(1, 5, 1,  TRUE),   -- Customer 360 → CUSTOMER_PROFILES (Snowflake)
(2, 5, 8,  FALSE),  -- Customer 360 → customer_profiles (Redshift)
(3, 6, 2,  TRUE),   -- Campaign Performance → CAMPAIGN_RESULTS
(4, 1, 10, TRUE),   -- Revenue Analytics → revenue_summary
(5, 2, 5,  TRUE)    -- GL Transactions → GL_TRANSACTIONS
ON CONFLICT (mapping_id) DO NOTHING;

-- ─── Platform Role Mappings ───────────────────────────────────────────────────
INSERT INTO platform_role_mappings (mapping_id, platform_id, internal_role_id, platform_role_name) VALUES
(1, 1, 1,  'CES_VIEWER'),
(2, 1, 2,  'CES_ANALYST'),
(3, 1, 3,  'CES_ENGINEER'),
(4, 1, 6,  'CES_FINANCE_ANALYST'),
(5, 1, 9,  'CES_ROLE_ANALYST'),
(6, 1, 10, 'CES_ROLE_DATA_ENGINEER'),
(7, 2, 1,  'ces_viewer'),
(8, 2, 2,  'ces_analyst'),
(9, 2, 6,  'ces_finance_analyst'),
(10,2, 9,  'ces_role_analyst'),
(11,2, 10, 'ces_role_data_engineer')
ON CONFLICT (mapping_id) DO NOTHING;

-- ─── Sample Policies, Versions & Rules ───────────────────────────────────────
INSERT INTO policies (policy_id, organization_id, policy_name, policy_code, description, enforce_mode, status, owner_user_id, domain_id, product_id) VALUES
(1, 1, 'Customer PII Data Masking & RLS', 'CUSTOMER_PII_PROTECT', 'Governance policy restricting access to customer PII and masking sensitive email/phone columns', 'ENFORCED', 'ENFORCED', 1, 3, 5),
(2, 1, 'Financial & Revenue Row Access Policy', 'POL_FIN_002',      'Restricts GL transactions and revenue summary tables by region and analyst role',         'ENFORCED', 'ENFORCED', 2, 1, 1),
(3, 1, 'SOX Financial Audit Oversight',        'SOX_AUDIT_003',     'Global SOX 404 compliance policy enforcing restricted GL and payroll access.',          'ENFORCED', 'ENFORCED', 1, 5, 8)
ON CONFLICT (policy_id) DO NOTHING;

INSERT INTO policy_versions (version_id, policy_id, version_number, version_label, is_current, authored_by_user_id, status, change_summary) VALUES
(1, 1, 1, 'v1.0 Baseline PII Masking',  TRUE, 1, 'DEPLOYED', 'Initial baseline PII masking & access policy'),
(2, 2, 1, 'v1.0 Financial Governance',  TRUE, 2, 'DEPLOYED', 'Initial financial governance and row access control'),
(3, 3, 1, 'v1.0 SOX Controls',          TRUE, 1, 'DEPLOYED', 'SOX 404 audit logging and restricted financial queries')
ON CONFLICT (version_id) DO NOTHING;

INSERT INTO policy_rules (rule_id, version_id, rule_name, rule_description, rule_order, rule_type, effect, is_active) VALUES
(1, 1, 'Mask Email for Analysts',      'Masks EMAIL column via SHA256 for non-admin analysts unless Fraud purpose', 1, 'COMBINED', 'ALLOW', TRUE),
(2, 1, 'Filter Customers by Region',   'Restricts customer profiles to US_EAST region for analysts',               2, 'COMBINED', 'ALLOW', TRUE),
(3, 2, 'US East Revenue Access',       'Restricts revenue summary access to US East region',                       1, 'ABAC',     'ALLOW', TRUE),
(4, 3, 'SOX Auditor Audit Access',     'Allows SOX auditors with REGULATORY_AUDIT purpose to query GL data',       1, 'COMBINED', 'ALLOW', TRUE)
ON CONFLICT (rule_id) DO NOTHING;

INSERT INTO policy_rule_subjects (subject_id, rule_id, subject_type, role_id) VALUES
(1, 1, 'ROLE', 9),  -- ROLE_ANALYST
(2, 2, 'ROLE', 9),  -- ROLE_ANALYST
(3, 3, 'ROLE', 6),  -- FINANCE_ANALYST
(4, 4, 'ROLE', 11)  -- ROLE_COMPLIANCE
ON CONFLICT (subject_id) DO NOTHING;

INSERT INTO policy_rule_actions (action_id, rule_id, action_type, mask_type, filter_column, filter_value) VALUES
(1, 1, 'MASK_COLUMN', 'HASH_SHA256', 'EMAIL',  NULL),
(2, 2, 'FILTER_ROWS', NULL,          'REGION', 'US_EAST'),
(3, 3, 'FILTER_ROWS', NULL,          'REGION', 'US_EAST'),
(4, 4, 'GRANT_SELECT',NULL,          NULL,     NULL)
ON CONFLICT (action_id) DO NOTHING;

INSERT INTO policy_rule_conditions (condition_id, rule_id, condition_group, attribute_type, attribute_key, operator, compare_value_type, compare_value) VALUES
(1, 1, 1, 'SESSION_ATTRIBUTE', 'purpose', 'EQ', 'LITERAL', 'FRAUD_DETECTION'),
(2, 4, 1, 'SESSION_ATTRIBUTE', 'purpose', 'EQ', 'LITERAL', 'REGULATORY_AUDIT')
ON CONFLICT (condition_id) DO NOTHING;

INSERT INTO policy_rule_resources (resource_id, rule_id, platform_id, database_id, schema_id, table_id, resource_scope) VALUES
(1, 1, 1, 1, 1, 1,  'TAG'),    -- Global Tag-scoped: Discovered.PII.Email
(2, 2, 1, 1, 1, 1,  'TABLE'),  -- Snowflake CUSTOMER_PROFILES
(3, 3, 2, 3, 4, 10, 'TABLE'),  -- Redshift revenue_summary
(4, 4, 1, 1, 1, 5,  'TABLE')   -- Snowflake GL_TRANSACTIONS
ON CONFLICT (resource_id) DO NOTHING;

INSERT INTO policy_rule_resource_tags (id, resource_id, tag_id, tag_value) VALUES
(1, 1, 12, 'TRUE')  -- Links resource_id 1 to Discovered.PII.Email (tag_id 12)
ON CONFLICT (id) DO NOTHING;

INSERT INTO policy_version_targets (version_id, platform_id, deployment_status, celery_task_id, error_message, deployed_at) VALUES
(1, 1, 'SUCCESS', 'celery-dep-sf-001', 'Successfully deployed native DDL to SNOWFLAKE', NOW()),
(1, 2, 'SUCCESS', 'celery-dep-rs-001', 'Successfully deployed native DDL to REDSHIFT',  NOW()),
(2, 1, 'SUCCESS', 'celery-dep-sf-002', 'Successfully deployed native DDL to SNOWFLAKE', NOW()),
(2, 2, 'SUCCESS', 'celery-dep-rs-002', 'Successfully deployed native DDL to REDSHIFT',  NOW()),
(3, 1, 'SUCCESS', 'celery-dep-sf-003', 'Successfully deployed native DDL to SNOWFLAKE', NOW()),
(3, 2, 'SUCCESS', 'celery-dep-rs-003', 'Successfully deployed native DDL to REDSHIFT',  NOW())
ON CONFLICT (version_id, platform_id) DO NOTHING;

-- ─── Celery Beat Scheduled Cron History Seed Data ─────────────────────────────
INSERT INTO celery_task_history (task_id, task_name, task_type, platform_code, status, started_at, completed_at, duration_ms, tables_synced, columns_synced, result_summary) VALUES
('cron-sync-sf-001', 'sync_platform_metadata_cron', 'CRON_BEAT', 'SNOWFLAKE', 'SUCCESS', NOW() - INTERVAL '3 hour', NOW() - INTERVAL '3 hour' + INTERVAL '420 millisecond', 420, 8, 42, 'Successfully synchronized 8 tables and 42 columns from Snowflake Information Schema'),
('cron-sync-rs-001', 'sync_platform_metadata_cron', 'CRON_BEAT', 'REDSHIFT',  'SUCCESS', NOW() - INTERVAL '3 hour', NOW() - INTERVAL '3 hour' + INTERVAL '390 millisecond', 390, 6, 31, 'Successfully synchronized 6 tables and 31 columns from Redshift Information Schema'),
('cron-sync-sf-002', 'sync_platform_metadata_cron', 'CRON_BEAT', 'SNOWFLAKE', 'SUCCESS', NOW() - INTERVAL '2 hour', NOW() - INTERVAL '2 hour' + INTERVAL '415 millisecond', 415, 8, 42, 'Successfully synchronized 8 tables and 42 columns from Snowflake Information Schema'),
('cron-sync-rs-002', 'sync_platform_metadata_cron', 'CRON_BEAT', 'REDSHIFT',  'SUCCESS', NOW() - INTERVAL '2 hour', NOW() - INTERVAL '2 hour' + INTERVAL '385 millisecond', 385, 6, 31, 'Successfully synchronized 6 tables and 31 columns from Redshift Information Schema'),
('cron-sync-sf-003', 'sync_platform_metadata_cron', 'CRON_BEAT', 'SNOWFLAKE', 'SUCCESS', NOW() - INTERVAL '1 hour', NOW() - INTERVAL '1 hour' + INTERVAL '430 millisecond', 430, 8, 42, 'Successfully synchronized 8 tables and 42 columns from Snowflake Information Schema'),
('cron-sync-rs-003', 'sync_platform_metadata_cron', 'CRON_BEAT', 'REDSHIFT',  'SUCCESS', NOW() - INTERVAL '1 hour', NOW() - INTERVAL '1 hour' + INTERVAL '395 millisecond', 395, 6, 31, 'Successfully synchronized 6 tables and 31 columns from Redshift Information Schema')
ON CONFLICT (id) DO NOTHING;


-- ─── Update Policies current_version_id ─────────────────────────────────────────
UPDATE policies SET current_version_id = 1 WHERE policy_id = 1 AND current_version_id IS NULL;
UPDATE policies SET current_version_id = 2 WHERE policy_id = 2 AND current_version_id IS NULL;
UPDATE policies SET current_version_id = 3 WHERE policy_id = 3 AND current_version_id IS NULL;

-- ─── Platform Drivers Registry Seed ─────────────────────────────────────────
INSERT INTO metadata_platform_drivers (driver_code, driver_name, description, fields) VALUES
('SNOWFLAKE',   'Snowflake Data Cloud',      'Tag-based Masking & Row Access Policies',          '["account_identifier", "warehouse", "default_database", "role", "db_user", "db_password"]'::jsonb),
('REDSHIFT',    'AWS Redshift Warehouse',   'Row-Level Security (RLS) & Dynamic Data Masking',   '["host", "port", "default_database", "db_user", "db_password", "iam_role_arn"]'::jsonb),
('DATABRICKS',  'Databricks Unity Catalog',  'Column Masking & Row Filters (UC)',                '["host", "http_path", "catalog_name", "db_user", "db_password"]'::jsonb),
('BIGQUERY',    'Google Cloud BigQuery',     'Policy Tags & Authorized Views',                   '["account_identifier", "default_database", "db_user", "db_password"]'::jsonb),
('POSTGRESQL',  'Native PostgreSQL Engine',  'Row-Level Security & Cryptographic Masking',       '["host", "port", "default_database", "db_user", "db_password"]'::jsonb),
('TRINO',       'Trino / Starburst Galaxy',  'Distributed Query Engine ABAC Security',           '["host", "port", "default_database", "db_user", "db_password"]'::jsonb),
('CUSTOM_JDBC', 'Enterprise Generic JDBC',   'Standard SQL-92 Dialect Connection',               '["host", "port", "default_database", "db_user", "db_password"]'::jsonb)
ON CONFLICT (driver_code) DO UPDATE SET
    driver_name = EXCLUDED.driver_name,
    description = EXCLUDED.description,
    fields = EXCLUDED.fields;

-- ─── Automated Tag Discovery Identifiers Seed ─────────────────────────────────
INSERT INTO metadata_tag_rules (tag_path, category, regex_pattern, description) VALUES
('Discovered.PII.Email',            'PII',       '.*(email|mail_addr|e_mail).*',                                                                'Email address classifier'),
('Discovered.PII.Phone',            'PII',       '.*(phone|mobile|cell|contact_num|tel_num).*',                                                 'Telephone & mobile number classifier'),
('Discovered.PII.SSN',              'PII',       '.*(ssn|social_sec|national_id|tax_id).*',                                                     'Social Security & National ID classifier'),
('Discovered.PII.Name',             'PII',       '.*(first_name|last_name|full_name|customer_name|patient_name|user_name|contact_name).*',      'Person full/first/last name classifier'),
('Discovered.Financial.CreditCard', 'FINANCIAL', '.*(card_num|credit_card|cc_num|pan|card_number).*',                                          'Payment card / credit card classifier'),
('Discovered.Financial.Salary',     'FINANCIAL', '.*(salary|wage|compensation|bonus|annual_income|pay_rate).*',                                 'Employee compensation / wage classifier'),
('Discovered.Financial.BankAccount','FINANCIAL', '.*(account_num|bank_acc|iban|routing_num|swift_code).*',                                     'Bank account and routing number classifier'),
('Discovered.Location.Address',     'LOCATION',  '.*(address|street_addr|postal_code|zip_code|residence).*',                                    'Postal & physical street address classifier')
ON CONFLICT (tag_path) DO UPDATE SET
    category = EXCLUDED.category,
    regex_pattern = EXCLUDED.regex_pattern,
    description = EXCLUDED.description;

-- ─── Advance Auto-Increment Sequences to Prevent Unique Constraint Collisions ──
SELECT setval('organizations_organization_id_seq',           COALESCE((SELECT MAX(organization_id) FROM organizations), 1));
SELECT setval('data_domains_domain_id_seq',                   COALESCE((SELECT MAX(domain_id) FROM data_domains), 1));
SELECT setval('data_products_product_id_seq',                 COALESCE((SELECT MAX(product_id) FROM data_products), 1));
SELECT setval('roles_role_id_seq',                             COALESCE((SELECT MAX(role_id) FROM roles), 1));
SELECT setval('users_user_id_seq',                             COALESCE((SELECT MAX(user_id) FROM users), 1));
SELECT setval('user_role_mappings_mapping_id_seq',             COALESCE((SELECT MAX(mapping_id) FROM user_role_mappings), 1));
SELECT setval('user_attributes_attribute_id_seq',              COALESCE((SELECT MAX(attribute_id) FROM user_attributes), 1));
SELECT setval('group_attributes_attribute_id_seq',             COALESCE((SELECT MAX(attribute_id) FROM group_attributes), 1));
SELECT setval('purposes_purpose_id_seq',                       COALESCE((SELECT MAX(purpose_id) FROM purposes), 1));
SELECT setval('user_purposes_user_purpose_id_seq',             COALESCE((SELECT MAX(user_purpose_id) FROM user_purposes), 1));
SELECT setval('data_access_requests_request_id_seq',           COALESCE((SELECT MAX(request_id) FROM data_access_requests), 1));
SELECT setval('metadata_platforms_platform_id_seq',            COALESCE((SELECT MAX(platform_id) FROM metadata_platforms), 1));
SELECT setval('metadata_databases_database_id_seq',            COALESCE((SELECT MAX(database_id) FROM metadata_databases), 1));
SELECT setval('metadata_schemas_schema_id_seq',                COALESCE((SELECT MAX(schema_id) FROM metadata_schemas), 1));
SELECT setval('metadata_tables_table_id_seq',                  COALESCE((SELECT MAX(table_id) FROM metadata_tables), 1));
SELECT setval('metadata_columns_column_id_seq',                COALESCE((SELECT MAX(column_id) FROM metadata_columns), 1));
SELECT setval('metadata_tags_tag_id_seq',                      COALESCE((SELECT MAX(tag_id) FROM metadata_tags), 1));
SELECT setval('metadata_tag_assignments_assignment_id_seq',    COALESCE((SELECT MAX(assignment_id) FROM metadata_tag_assignments), 1));
SELECT setval('data_product_table_mappings_mapping_id_seq',    COALESCE((SELECT MAX(mapping_id) FROM data_product_table_mappings), 1));
SELECT setval('platform_role_mappings_mapping_id_seq',         COALESCE((SELECT MAX(mapping_id) FROM platform_role_mappings), 1));
SELECT setval('policies_policy_id_seq',                        COALESCE((SELECT MAX(policy_id) FROM policies), 1));
SELECT setval('policy_versions_version_id_seq',                COALESCE((SELECT MAX(version_id) FROM policy_versions), 1));
SELECT setval('policy_rules_rule_id_seq',                      COALESCE((SELECT MAX(rule_id) FROM policy_rules), 1));
SELECT setval('policy_rule_subjects_subject_id_seq',           COALESCE((SELECT MAX(subject_id) FROM policy_rule_subjects), 1));
SELECT setval('policy_rule_actions_action_id_seq',             COALESCE((SELECT MAX(action_id) FROM policy_rule_actions), 1));
SELECT setval('policy_rule_conditions_condition_id_seq',       COALESCE((SELECT MAX(condition_id) FROM policy_rule_conditions), 1));
SELECT setval('policy_rule_resources_resource_id_seq',         COALESCE((SELECT MAX(resource_id) FROM policy_rule_resources), 1));
SELECT setval('policy_rule_resource_tags_id_seq',              COALESCE((SELECT MAX(id) FROM policy_rule_resource_tags), 1));
SELECT setval('celery_task_history_id_seq',                    COALESCE((SELECT MAX(id) FROM celery_task_history), 1));

