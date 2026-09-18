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
ON CONFLICT (user_id, role_id) DO NOTHING;

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

-- ─── Personas (Functional Business Entitlement Archetypes) ─────────────────────
INSERT INTO personas (persona_id, organization_id, persona_name, persona_code, description, is_active) VALUES
(1, 1, 'Senior Quantitative Analyst', 'PERSONA_SR_QUANT',       'Quantitative modelers and financial risk engineers with GL and transactional analytical clearance', TRUE),
(2, 1, 'Data Platform Engineer',     'PERSONA_DATA_PLATFORM',  'Core infrastructure engineers responsible for cross-cloud pipelines and transformations',           TRUE),
(3, 1, 'Compliance & Risk Officer',   'PERSONA_RISK_AUDITOR',   'Global compliance audit and security oversight officers inspecting restricted data domains',         TRUE),
(4, 1, 'Growth & Marketing Strategist','PERSONA_MARKETING_LEAD', 'Omnichannel marketing campaign strategists analyzing customer profile segments',                    TRUE)
ON CONFLICT (persona_id) DO NOTHING;

-- ─── Persona-Group Mappings (Member Groups in Persona) ─────────────────────────
-- Personas compose Identity Groups
INSERT INTO persona_group_mappings (mapping_id, persona_id, role_id) VALUES
(1, 1, 6),   -- PERSONA_SR_QUANT        ← Finance Analyst (group 6)
(2, 1, 9),   -- PERSONA_SR_QUANT        ← ROLE_ANALYST (group 9)
(3, 2, 10),  -- PERSONA_DATA_PLATFORM   ← ROLE_DATA_ENGINEER (group 10)
(4, 2, 3),   -- PERSONA_DATA_PLATFORM   ← Data Engineer (group 3)
(5, 3, 11),  -- PERSONA_RISK_AUDITOR    ← ROLE_COMPLIANCE (group 11)
(6, 3, 12),  -- PERSONA_RISK_AUDITOR    ← ROLE_SECURITY (group 12)
(7, 4, 13)   -- PERSONA_MARKETING_LEAD  ← ROLE_MARKETING (group 13)
ON CONFLICT (persona_id, role_id) DO NOTHING;

-- ─── Persona-User Mappings (Direct Member Users in Persona) ───────────────────
-- Personas also support direct user assignment
INSERT INTO persona_user_mappings (mapping_id, persona_id, user_id) VALUES
(1, 1, 1),   -- PERSONA_SR_QUANT        ← alice.chen (direct)
(2, 2, 6),   -- PERSONA_DATA_PLATFORM   ← frank.nguyen (direct)
(3, 3, 5),   -- PERSONA_RISK_AUDITOR    ← eve.taylor (direct)
(4, 4, 3)    -- PERSONA_MARKETING_LEAD  ← carol.jones (direct)
ON CONFLICT (persona_id, user_id) DO NOTHING;

-- ─── Persona Attributes ───────────────────────────────────────────────────────
INSERT INTO persona_attributes (attribute_id, persona_id, attribute_key, attribute_value) VALUES
(1, 1, 'persona_tier', 'TIER_1_FINANCIAL'),
(2, 2, 'persona_tier', 'TIER_1_INFRASTRUCTURE'),
(3, 3, 'persona_tier', 'TIER_0_GOVERNANCE'),
(4, 4, 'persona_tier', 'TIER_2_BUSINESS')
ON CONFLICT (persona_id, attribute_key) DO UPDATE SET attribute_value = EXCLUDED.attribute_value;

-- ─── Entitlement & Subscription Requests ──────────────────────────────────────
INSERT INTO data_access_requests (request_id, request_number, requestor_id, domain_id, product_id, requested_role_id, access_level, justification, valid_for_days, status, reviewed_by_id, reviewed_at, review_comment) VALUES
(1, 'REQ-2026-0001', 5, 1, 2, 9,  'READ', 'Urgent investigation of suspicious wire transfer activity in EMEA accounts for AML filing.', 30, 'APPROVED', 1, NOW() - INTERVAL '2 days', 'Approved for AML fraud investigation.'),
(2, 'REQ-2026-0002', 3, 3, 5, 13, 'READ', 'Access customer profiles to build segment targeting for Q3 product launch.',                  60, 'PENDING',  NULL, NULL, NULL),
(3, 'REQ-2026-0003', 6, 1, 1, 10, 'READ', 'Analyze monthly revenue aggregation latency for pipeline optimization.',                        90, 'PENDING',  NULL, NULL, NULL),
(4, 'REQ-2026-0004', 4, 4, 7, 2,  'READ', 'Evaluate regional warehouse shipment bottlenecks against inventory data.',                     45, 'PENDING',  NULL, NULL, NULL),
(5, 'REQ-2026-0005', 2, 2, 4, 7,  'READ', 'Conduct external HR compliance compensation audit report.',                                    30, 'REJECTED', 7, NOW() - INTERVAL '5 days', 'Requires Department Head counter-signature.')
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
(3, 1, 'SOX Financial Audit Oversight',        'SOX_AUDIT_003',     'Global SOX 404 compliance policy enforcing restricted GL and payroll access.',          'ENFORCED', 'ENFORCED', 1, 5, 8),
(4, 1, 'test',                                  'TEST',              'Subscription access test policy',                                                        'ENFORCED', 'ENFORCED', 1, 1, 1)
ON CONFLICT (policy_id) DO NOTHING;

INSERT INTO policy_versions (version_id, policy_id, version_number, version_label, is_current, authored_by_user_id, status, change_summary) VALUES
(1, 1, 1, 'v1.0 Baseline PII Masking',  TRUE, 1, 'DEPLOYED', 'Initial baseline PII masking & access policy'),
(2, 2, 1, 'v1.0 Financial Governance',  TRUE, 2, 'DEPLOYED', 'Initial financial governance and row access control'),
(3, 3, 1, 'v1.0 SOX Controls',          TRUE, 1, 'DEPLOYED', 'SOX 404 audit logging and restricted financial queries'),
(4, 4, 1, 'v1.0',                       TRUE, 1, 'DEPLOYED', 'Subscription access test policy')
ON CONFLICT (version_id) DO NOTHING;

INSERT INTO policy_rules (rule_id, version_id, rule_name, rule_description, rule_order, rule_type, effect, is_active) VALUES
(1, 1, 'Mask Email for Analysts',      'Masks EMAIL column via SHA256 for non-admin analysts unless Fraud purpose', 1, 'COMBINED', 'ALLOW', TRUE),
(2, 1, 'Filter Customers by Region',   'Restricts customer profiles to US_EAST region for analysts',               2, 'COMBINED', 'ALLOW', TRUE),
(3, 2, 'US East Revenue Access',       'Restricts revenue summary access to US East region',                       1, 'ABAC',     'ALLOW', TRUE),
(4, 3, 'SOX Auditor Audit Access',     'Allows SOX auditors with REGULATORY_AUDIT purpose to query GL data',       1, 'COMBINED', 'ALLOW', TRUE),
(5, 4, 'SUBSCRIPTION_ACCESS Global Rule','Allow select on Redshift for Data Engineer',                            0, 'COMBINED', 'ALLOW', TRUE)
ON CONFLICT (rule_id) DO NOTHING;

INSERT INTO policy_rule_subjects (subject_id, rule_id, subject_type, role_id) VALUES
(1, 1, 'ROLE', 9),  -- ROLE_ANALYST
(2, 2, 'ROLE', 9),  -- ROLE_ANALYST
(3, 3, 'ROLE', 6),  -- FINANCE_ANALYST
(4, 4, 'ROLE', 11), -- ROLE_COMPLIANCE
(5, 5, 'ROLE', 3)   -- DATA_ENGINEER
ON CONFLICT (subject_id) DO NOTHING;

INSERT INTO policy_rule_actions (action_id, rule_id, action_type, mask_type, filter_column, filter_value) VALUES
(1, 1, 'MASK_COLUMN', 'HASH_SHA256', 'EMAIL',  NULL),
(2, 2, 'FILTER_ROWS', NULL,          'REGION', 'US_EAST'),
(3, 3, 'FILTER_ROWS', NULL,          'REGION', 'US_EAST'),
(4, 4, 'GRANT_SELECT',NULL,          NULL,     NULL),
(5, 5, 'GRANT_SELECT',NULL,          NULL,     NULL)
ON CONFLICT (action_id) DO NOTHING;

INSERT INTO policy_rule_resources (resource_id, rule_id, platform_id, database_id, schema_id, table_id, resource_scope) VALUES
(1, 1, 1, 1, 1, 1,  'TABLE'),  -- Snowflake CUSTOMER_PROFILES
(2, 2, 1, 1, 1, 1,  'TABLE'),  -- Snowflake CUSTOMER_PROFILES
(3, 3, 2, 3, 4, 10, 'TABLE'),  -- Redshift revenue_summary
(4, 4, 1, 1, 1, 5,  'TABLE'),  -- Snowflake GL_TRANSACTIONS
(5, 5, 2, 3, 4, 10, 'TABLE')   -- Redshift revenue_summary
ON CONFLICT (resource_id) DO NOTHING;

INSERT INTO policy_version_targets (version_id, platform_id, deployment_status, celery_task_id, error_message, deployed_at) VALUES
(1, 1, 'SUCCESS', 'celery-dep-sf-001', 'Successfully deployed native DDL to SNOWFLAKE', NOW()),
(1, 2, 'SUCCESS', 'celery-dep-rs-001', 'Successfully deployed native DDL to REDSHIFT',  NOW()),
(2, 1, 'SUCCESS', 'celery-dep-sf-002', 'Successfully deployed native DDL to SNOWFLAKE', NOW()),
(2, 2, 'SUCCESS', 'celery-dep-rs-002', 'Successfully deployed native DDL to REDSHIFT',  NOW()),
(3, 1, 'SUCCESS', 'celery-dep-sf-003', 'Successfully deployed native DDL to SNOWFLAKE', NOW()),
(3, 2, 'SUCCESS', 'celery-dep-rs-003', 'Successfully deployed native DDL to REDSHIFT',  NOW()),
(4, 2, 'SUCCESS', 'celery-dep-rs-004', 'Successfully deployed native DDL to REDSHIFT',  NOW())
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
UPDATE policies SET current_version_id = 4 WHERE policy_id = 4 AND current_version_id IS NULL;

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

-- ─── Platform User Mappings Seed ──────────────────────────────────────────────
INSERT INTO platform_user_mappings (user_id, platform_id, platform_code, external_user_id) VALUES
(1, 1, 'SNOWFLAKE', 'ALICE_CDO_SF'),
(1, 2, 'REDSHIFT',  'alice_cdo_rs'),
(2, 1, 'SNOWFLAKE', 'BOB_HR_SF'),
(2, 2, 'REDSHIFT',  'bob_hr_rs'),
(3, 1, 'SNOWFLAKE', 'CAROL_MKT_SF'),
(3, 2, 'REDSHIFT',  'carol_mkt_rs'),
(4, 1, 'SNOWFLAKE', 'DAVE_OPS_SF'),
(4, 2, 'REDSHIFT',  'dave_ops_rs'),
(5, 1, 'SNOWFLAKE', 'EVE_FIN_SF'),
(5, 2, 'REDSHIFT',  'eve_fin_rs'),
(6, 1, 'SNOWFLAKE', 'FRANK_NGUYEN_SF'),
(6, 2, 'REDSHIFT',  'frank_nguyen_rs'),
(7, 1, 'SNOWFLAKE', 'ADMIN_SF'),
(7, 2, 'REDSHIFT',  'admin_rs')
ON CONFLICT (user_id, platform_code) DO UPDATE SET
    external_user_id = EXCLUDED.external_user_id;

-- ─── Advance Auto-Increment Sequences to Prevent Unique Constraint Collisions ──
SELECT setval('organizations_organization_id_seq',           COALESCE((SELECT MAX(organization_id) FROM organizations), 1));
SELECT setval('data_domains_domain_id_seq',                   COALESCE((SELECT MAX(domain_id) FROM data_domains), 1));
SELECT setval('data_products_product_id_seq',                 COALESCE((SELECT MAX(product_id) FROM data_products), 1));
SELECT setval('roles_role_id_seq',                             COALESCE((SELECT MAX(role_id) FROM roles), 1));
SELECT setval('users_user_id_seq',                             COALESCE((SELECT MAX(user_id) FROM users), 1));
SELECT setval('user_role_mappings_mapping_id_seq',             COALESCE((SELECT MAX(mapping_id) FROM user_role_mappings), 1));
SELECT setval('user_attributes_attribute_id_seq',              COALESCE((SELECT MAX(attribute_id) FROM user_attributes), 1));
SELECT setval('group_attributes_attribute_id_seq',             COALESCE((SELECT MAX(attribute_id) FROM group_attributes), 1));
SELECT setval('personas_persona_id_seq',                       COALESCE((SELECT MAX(persona_id) FROM personas), 1));
SELECT setval('persona_user_mappings_mapping_id_seq',          COALESCE((SELECT MAX(mapping_id) FROM persona_user_mappings), 1));
SELECT setval('persona_group_mappings_mapping_id_seq',         COALESCE((SELECT MAX(mapping_id) FROM persona_group_mappings), 1));
SELECT setval('persona_attributes_attribute_id_seq',           COALESCE((SELECT MAX(attribute_id) FROM persona_attributes), 1));
SELECT setval('data_access_requests_request_id_seq',           COALESCE((SELECT MAX(request_id) FROM data_access_requests), 1));
SELECT setval('metadata_platforms_platform_id_seq',            COALESCE((SELECT MAX(platform_id) FROM metadata_platforms), 1));
SELECT setval('metadata_databases_database_id_seq',            COALESCE((SELECT MAX(database_id) FROM metadata_databases), 1));
SELECT setval('metadata_schemas_schema_id_seq',                COALESCE((SELECT MAX(schema_id) FROM metadata_schemas), 1));
SELECT setval('metadata_tables_table_id_seq',                  COALESCE((SELECT MAX(table_id) FROM metadata_tables), 1));
SELECT setval('metadata_columns_column_id_seq',                COALESCE((SELECT MAX(column_id) FROM metadata_columns), 1));
SELECT setval('data_product_table_mappings_mapping_id_seq',    COALESCE((SELECT MAX(mapping_id) FROM data_product_table_mappings), 1));
SELECT setval('platform_role_mappings_mapping_id_seq',         COALESCE((SELECT MAX(mapping_id) FROM platform_role_mappings), 1));
SELECT setval('platform_user_mappings_mapping_id_seq',         COALESCE((SELECT MAX(mapping_id) FROM platform_user_mappings), 1));
SELECT setval('policies_policy_id_seq',                        COALESCE((SELECT MAX(policy_id) FROM policies), 1));
SELECT setval('policy_versions_version_id_seq',                COALESCE((SELECT MAX(version_id) FROM policy_versions), 1));
SELECT setval('policy_rules_rule_id_seq',                      COALESCE((SELECT MAX(rule_id) FROM policy_rules), 1));
SELECT setval('policy_rule_subjects_subject_id_seq',           COALESCE((SELECT MAX(subject_id) FROM policy_rule_subjects), 1));
SELECT setval('policy_rule_actions_action_id_seq',             COALESCE((SELECT MAX(action_id) FROM policy_rule_actions), 1));
SELECT setval('policy_rule_conditions_condition_id_seq',       COALESCE((SELECT MAX(condition_id) FROM policy_rule_conditions), 1));
SELECT setval('policy_rule_resources_resource_id_seq',         COALESCE((SELECT MAX(resource_id) FROM policy_rule_resources), 1));
SELECT setval('celery_task_history_id_seq',                    COALESCE((SELECT MAX(id) FROM celery_task_history), 1));

