-- ============================================================
-- 001_sample_data.sql
-- Sample Seed Data for Central Entitlement Service POC
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
(1, 1, 'Data Viewer',     'DATA_VIEWER',    'Read-only access to internal datasets',                     FALSE),
(2, 1, 'Data Analyst',    'DATA_ANALYST',   'Standard analytical access with non-PII query rights',     FALSE),
(3, 1, 'Data Engineer',   'DATA_ENGINEER',  'Pipeline creation, transformation, and schema control',     FALSE),
(4, 1, 'Policy Author',   'POLICY_AUTHOR',  'Permission to create, update, and draft governance policies',TRUE),
(5, 1, 'Policy Admin',    'POLICY_ADMIN',   'Permission to approve, deploy, and enforce policy versions',  TRUE),
(6, 1, 'Finance Analyst', 'FINANCE_ANALYST','Specialized finance role with GL and revenue access',       FALSE),
(7, 1, 'HR Analyst',      'HR_ANALYST',     'Specialized HR role with employee PII access',             FALSE),
(8, 1, 'Super Admin',     'SUPER_ADMIN',    'Platform super administrator',                               TRUE)
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
(1, 1, 6, 7), -- alice.chen  → Finance Analyst
(2, 1, 4, 7), -- alice.chen  → Policy Author
(3, 2, 7, 7), -- bob.smith   → HR Analyst
(4, 3, 2, 7), -- carol.jones → Data Analyst
(5, 4, 2, 7), -- dave.lee    → Data Analyst
(6, 5, 6, 1), -- eve.taylor  → Finance Analyst
(7, 6, 3, 7), -- frank.nguyen→ Data Engineer
(8, 7, 8, 7)  -- admin       → Super Admin
ON CONFLICT (mapping_id) DO NOTHING;

-- ─── User ABAC Attributes ─────────────────────────────────────────────────────
INSERT INTO user_attributes (attribute_id, user_id, attribute_key, attribute_value, attribute_source) VALUES
(1,  1, 'department',         'Finance',     'LDAP'),
(2,  1, 'clearance_level',    'RESTRICTED',  'MANUAL'),
(3,  1, 'cost_center',        'CC-001',      'LDAP'),
(4,  2, 'department',         'HR',          'LDAP'),
(5,  2, 'clearance_level',    'TOP_SECRET',  'MANUAL'),
(6,  3, 'department',         'Marketing',   'LDAP'),
(7,  3, 'clearance_level',    'INTERNAL',    'LDAP'),
(8,  4, 'department',         'Operations',  'LDAP'),
(9,  4, 'clearance_level',    'INTERNAL',    'LDAP'),
(10, 5, 'department',         'Finance',     'LDAP'),
(11, 5, 'clearance_level',    'CONFIDENTIAL','MANUAL'),
(12, 6, 'department',         'Engineering', 'LDAP'),
(13, 6, 'clearance_level',    'RESTRICTED',  'MANUAL'),
(14, 7, 'department',         'IT',          'LDAP'),
(15, 7, 'clearance_level',    'TOP_SECRET',  'SYSTEM')
ON CONFLICT (attribute_id) DO NOTHING;

-- ─── Platforms ────────────────────────────────────────────────────────────────
INSERT INTO metadata_platforms (platform_id, platform_code, platform_name, platform_version, connection_alias) VALUES
(1, 'SNOWFLAKE', 'Snowflake Enterprise Data Cloud', '7.42', 'SNOWFLAKE_PROD'),
(2, 'REDSHIFT',  'Amazon Redshift Cluster',         '1.0.60', 'REDSHIFT_ANALYTICS')
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
(1, 1, 'PUBLIC',   'SYSADMIN'),
(2, 1, 'RESTRICTED','SYSADMIN'),
(3, 2, 'CAMPAIGNS','SYSADMIN'),
(4, 3, 'public',   'aws_admin'),
(5, 4, 'employee', 'aws_admin')
ON CONFLICT (schema_id) DO NOTHING;

-- ─── Tables ───────────────────────────────────────────────────────────────────
INSERT INTO metadata_tables (table_id, schema_id, table_name, table_type, table_owner, row_count_estimate, bytes_estimate) VALUES
(1, 1, 'CUSTOMER_PROFILES',  'TABLE', 'SYSADMIN', 1500000, 256000000),
(2, 1, 'CAMPAIGN_RESULTS',   'TABLE', 'SYSADMIN', 5000000, 890000000),
(3, 2, 'SALARIES_SENSITIVE', 'TABLE', 'SYSADMIN', 12000,   4500000),
(4, 2, 'TAX_RECORDS',        'TABLE', 'SYSADMIN', 35000,   12000000),
(5, 1, 'GL_TRANSACTIONS',    'TABLE', 'SYSADMIN', 8900000, 1400000000),
(6, 3, 'CLICKSTREAM',        'TABLE', 'SYSADMIN', 45000000,7800000000),
(7, 4, 'employee_pii',       'TABLE', 'aws_admin',12000,   4500000),
(8, 4, 'customer_profiles',  'TABLE', 'aws_admin',1500000, 256000000),
(9, 5, 'payroll_history',    'TABLE', 'aws_admin',98000,   34000000),
(10,4, 'revenue_summary',    'TABLE', 'aws_admin',450000,  88000000)
ON CONFLICT (table_id) DO NOTHING;

-- ─── Columns ──────────────────────────────────────────────────────────────────
INSERT INTO metadata_columns (table_id, column_name, ordinal_position, data_type, normalized_type, is_nullable, is_primary_key) VALUES
-- CUSTOMER_PROFILES (table_id=1)
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

-- CAMPAIGN_RESULTS (table_id=2)
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

-- SALARIES_SENSITIVE (table_id=3)
(3, 'EMPLOYEE_ID',       1, 'NUMBER(38,0)', 'NUMBER',    FALSE, TRUE),
(3, 'SSN',               2, 'VARCHAR(11)',  'TEXT',      FALSE, FALSE),
(3, 'BASE_SALARY_USD',   3, 'NUMBER(12,2)', 'NUMBER',    FALSE, FALSE),
(3, 'BONUS_PERCENT',     4, 'NUMBER(5,2)',  'NUMBER',    TRUE,  FALSE),
(3, 'BANK_ACCOUNT_NUM',  5, 'VARCHAR(30)',  'TEXT',      FALSE, FALSE),
(3, 'ROUTING_NUMBER',    6, 'VARCHAR(20)',  'TEXT',      FALSE, FALSE),
(3, 'TAX_BRACKET',       7, 'VARCHAR(20)',  'TEXT',      TRUE,  FALSE),
(3, 'EFFECTIVE_DATE',    8, 'DATE',         'DATE',      FALSE, FALSE),

-- TAX_RECORDS (table_id=4)
(4, 'RECORD_ID',         1, 'NUMBER(38,0)', 'NUMBER',    FALSE, TRUE),
(4, 'EMPLOYEE_ID',       2, 'NUMBER(38,0)', 'NUMBER',    FALSE, FALSE),
(4, 'TAX_YEAR',          3, 'NUMBER(4,0)',  'NUMBER',    FALSE, FALSE),
(4, 'TOTAL_WAGES_USD',   4, 'NUMBER(15,2)', 'NUMBER',    FALSE, FALSE),
(4, 'FEDERAL_TAX_HELD',  5, 'NUMBER(12,2)', 'NUMBER',    FALSE, FALSE),
(4, 'STATE_TAX_HELD',    6, 'NUMBER(12,2)', 'NUMBER',    FALSE, FALSE),
(4, 'FILING_STATUS',     7, 'VARCHAR(50)',  'TEXT',      FALSE, FALSE),

-- GL_TRANSACTIONS (table_id=5)
(5, 'TRANSACTION_ID',    1, 'NUMBER(38,0)', 'NUMBER',    FALSE, TRUE),
(5, 'ACCOUNT_NUMBER',    2, 'VARCHAR(50)',  'TEXT',      FALSE, FALSE),
(5, 'JOURNAL_ENTRY_ID',  3, 'NUMBER(38,0)', 'NUMBER',    FALSE, FALSE),
(5, 'TRANSACTION_DATE',  4, 'DATE',         'DATE',      FALSE, FALSE),
(5, 'DEBIT_AMOUNT_USD',  5, 'NUMBER(18,2)', 'NUMBER',    FALSE, FALSE),
(5, 'CREDIT_AMOUNT_USD', 6, 'NUMBER(18,2)', 'NUMBER',    FALSE, FALSE),
(5, 'CURRENCY_CODE',     7, 'VARCHAR(3)',   'TEXT',      FALSE, FALSE),
(5, 'DESCRIPTION',       8, 'VARCHAR(500)', 'TEXT',      TRUE,  FALSE),
(5, 'POSTED_BY_USER_ID', 9, 'NUMBER(38,0)', 'NUMBER',    FALSE, FALSE),

-- CLICKSTREAM (table_id=6)
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

-- ─── Tags ─────────────────────────────────────────────────────────────────────
INSERT INTO metadata_tags (tag_id, platform_id, tag_name, tag_category, allowed_values) VALUES
(1, 1, 'PII',                'CONFIDENTIALITY', 'TRUE,FALSE'),
(2, 1, 'SENSITIVITY',        'SECURITY_CLASS',  'PUBLIC,INTERNAL,HIGH,RESTRICTED'),
(3, 1, 'FINANCIAL_DATA',     'DOMAIN',          'GL,REVENUE,PAYROLL'),
(4, 2, 'pii_type',           'CONFIDENTIALITY', 'NAME,EMAIL,PHONE,SSN'),
(5, 2, 'data_classification','SECURITY_CLASS',  'PUBLIC,RESTRICTED,TOP_SECRET')
ON CONFLICT (tag_id) DO NOTHING;

-- ─── Tag Assignments ──────────────────────────────────────────────────────────
INSERT INTO metadata_tag_assignments (assignment_id, tag_id, column_id, tag_value) VALUES
(1, 1, 2, 'TRUE'), -- FIRST_NAME = PII
(2, 1, 3, 'TRUE'), -- LAST_NAME = PII
(3, 1, 4, 'TRUE'), -- EMAIL = PII
(4, 1, 5, 'TRUE'), -- PHONE = PII
(5, 2, 7, 'HIGH'), -- ANNUAL_INCOME_USD = HIGH sensitivity
(6, 2, 6, 'HIGH')  -- DATE_OF_BIRTH = HIGH sensitivity
ON CONFLICT (assignment_id) DO NOTHING;

-- ─── Data Product → Table Mappings ───────────────────────────────────────────
INSERT INTO data_product_table_mappings (mapping_id, product_id, table_id, is_primary_table) VALUES
(1, 5, 1, TRUE),   -- Customer 360 → CUSTOMER_PROFILES (Snowflake)
(2, 5, 8, FALSE),  -- Customer 360 → customer_profiles (Redshift)
(3, 6, 2, TRUE),   -- Campaign Performance → CAMPAIGN_RESULTS
(4, 1, 10, TRUE),  -- Revenue Analytics → revenue_summary
(5, 2, 5, TRUE)    -- GL Transactions → GL_TRANSACTIONS
ON CONFLICT (mapping_id) DO NOTHING;

-- ─── Platform Role Mappings ───────────────────────────────────────────────────
INSERT INTO platform_role_mappings (mapping_id, platform_id, internal_role_id, platform_role_name) VALUES
(1, 1, 1, 'CES_VIEWER'),        -- DATA_VIEWER → Snowflake CES_VIEWER
(2, 1, 2, 'CES_ANALYST'),       -- DATA_ANALYST → Snowflake CES_ANALYST
(3, 1, 3, 'CES_ENGINEER'),      -- DATA_ENGINEER → Snowflake CES_ENGINEER
(4, 1, 6, 'CES_FINANCE_ANALYST'),
(5, 2, 1, 'ces_viewer'),        -- DATA_VIEWER → Redshift ces_viewer
(6, 2, 2, 'ces_analyst'),
(7, 2, 6, 'ces_finance_analyst')
ON CONFLICT (mapping_id) DO NOTHING;

-- ─── Sample Policies, Versions & Rules ───────────────────────────────────────
INSERT INTO policies (policy_id, organization_id, policy_name, policy_code, description, enforce_mode, status, owner_user_id, domain_id, product_id) VALUES
(1, 1, 'PII & Customer Profile Access Control', 'POL_PII_001', 'Governance policy restricting access to customer PII and masking sensitive email/phone columns', 'ENFORCED', 'ENFORCED', 1, 5, 5),
(2, 1, 'Financial & Revenue Row Access Policy', 'POL_FIN_002', 'Restricts GL transactions and revenue summary tables by region and analyst role', 'ENFORCED', 'ENFORCED', 2, 1, 1)
ON CONFLICT (policy_id) DO NOTHING;

INSERT INTO policy_versions (version_id, policy_id, version_number, version_label, is_current, authored_by_user_id, status, change_summary) VALUES
(1, 1, 1, 'v1.0 Baseline PII Masking', TRUE, 1, 'DEPLOYED', 'Initial baseline PII masking & access policy'),
(2, 2, 1, 'v1.0 Financial Governance', TRUE, 2, 'DEPLOYED', 'Initial financial governance and row access control')
ON CONFLICT (version_id) DO NOTHING;

INSERT INTO policy_rules (rule_id, version_id, rule_name, rule_description, rule_order, rule_type, effect, is_active) VALUES
(1, 1, 'Finance Analyst Full Access', 'Grants UPDATE/SELECT access to Finance Analysts on Customer Profiles', 1, 'RBAC', 'ALLOW', TRUE),
(2, 1, 'Mask Email for Non-Admins', 'Masks EMAIL column for non-admin users', 2, 'ABAC', 'ALLOW', TRUE),
(3, 2, 'US East Revenue Access', 'Restricts revenue summary access to US East region', 1, 'ABAC', 'ALLOW', TRUE)
ON CONFLICT (rule_id) DO NOTHING;

INSERT INTO policy_rule_subjects (subject_id, rule_id, subject_type, role_id) VALUES
(1, 1, 'ROLE', 6), -- FINANCE_ANALYST
(2, 2, 'ROLE', 2), -- DATA_ANALYST
(3, 3, 'ROLE', 6)  -- FINANCE_ANALYST
ON CONFLICT (subject_id) DO NOTHING;

INSERT INTO policy_rule_actions (action_id, rule_id, action_type, mask_type, filter_column, filter_value) VALUES
(1, 1, 'GRANT_UPDATE', NULL, NULL, NULL),
(2, 2, 'MASK_COLUMN', 'HASH_SHA256', 'EMAIL', NULL),
(3, 3, 'FILTER_ROWS', NULL, 'REGION', 'US_EAST')
ON CONFLICT (action_id) DO NOTHING;

INSERT INTO policy_rule_resources (resource_id, rule_id, platform_id, database_id, schema_id, table_id, resource_scope) VALUES
(1, 1, 1, 1, 1, 1, 'TABLE'), -- Snowflake CUSTOMER_PROFILES
(2, 2, 1, 1, 1, 1, 'COLUMN'),
(3, 3, 2, 3, 4, 10, 'TABLE')  -- Redshift revenue_summary
ON CONFLICT (resource_id) DO NOTHING;

INSERT INTO policy_version_targets (version_id, platform_id, deployment_status, temporal_workflow_id, error_message, deployed_at) VALUES
(1, 1, 'SUCCESS', 'dep-init-sf-001', 'Successfully deployed native DDL to SNOWFLAKE', NOW()),
(1, 2, 'SUCCESS', 'dep-init-rs-001', 'Successfully deployed native DDL to REDSHIFT', NOW()),
(2, 1, 'SUCCESS', 'dep-init-sf-002', 'Successfully deployed native DDL to SNOWFLAKE', NOW()),
(2, 2, 'SUCCESS', 'dep-init-rs-002', 'Successfully deployed native DDL to REDSHIFT', NOW())
ON CONFLICT (version_id, platform_id) DO NOTHING;

-- ─── Update Policies current_version_id ─────────────────────────────────────────
UPDATE policies SET current_version_id = 1 WHERE policy_id = 1 AND current_version_id IS NULL;
UPDATE policies SET current_version_id = 2 WHERE policy_id = 2 AND current_version_id IS NULL;

-- ─── Advance Auto-Increment Sequences to Prevent Unique Constraint Collisions ──
SELECT setval('policies_policy_id_seq', (SELECT MAX(policy_id) FROM policies));
SELECT setval('policy_versions_version_id_seq', (SELECT MAX(version_id) FROM policy_versions));
SELECT setval('policy_rules_rule_id_seq', (SELECT MAX(rule_id) FROM policy_rules));
SELECT setval('policy_rule_subjects_subject_id_seq', (SELECT MAX(subject_id) FROM policy_rule_subjects));
SELECT setval('policy_rule_actions_action_id_seq', (SELECT MAX(action_id) FROM policy_rule_actions));
SELECT setval('policy_rule_resources_resource_id_seq', (SELECT MAX(resource_id) FROM policy_rule_resources));
SELECT setval('platform_role_mappings_mapping_id_seq', (SELECT MAX(mapping_id) FROM platform_role_mappings));

