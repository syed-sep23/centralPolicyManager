-- ============================================================
-- 004_sample_minimal_data.sql
-- Minimal Core Seed Data for Central Entitlement Service (CES)
-- Provides essential tenant, drivers, platforms, users, roles,
-- external mappings, and discovery rules for a clean minimal boot.
-- ============================================================

-- ─── Organizations ────────────────────────────────────────────────────────────
INSERT INTO organizations (organization_id, org_name, org_code, description) VALUES
(1, 'ACME Corporation', 'ACME', 'Primary enterprise tenant for Central Entitlement Service')
ON CONFLICT (organization_id) DO NOTHING;

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

-- ─── Core Roles ───────────────────────────────────────────────────────────────
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
(10, 1, 'Role Engineer',   'ROLE_DATA_ENGINEER', 'Engineering group role for pipeline transformations',       FALSE)
ON CONFLICT (organization_id, role_code) DO NOTHING;

-- ─── Core Users ───────────────────────────────────────────────────────────────
INSERT INTO users (user_id, organization_id, username, email, display_name, department, job_title, cost_center, office_location, country) VALUES
(1, 1, 'alice.chen',   'alice.chen@acme.com',   'Alice Chen',    'Finance',    'Finance Director',         'CC-001', 'New York',      'US'),
(6, 1, 'frank.nguyen', 'frank.nguyen@acme.com', 'Frank Nguyen',  'Engineering','Data Engineer',            'CC-005', 'Austin',        'US'),
(7, 1, 'admin',        'admin@acme.com',        'System Admin',  'IT',         'Platform Administrator',   'CC-000', 'Remote',        'US')
ON CONFLICT (user_id) DO NOTHING;

-- ─── Core User-Role Mappings ──────────────────────────────────────────────────
INSERT INTO user_role_mappings (mapping_id, user_id, role_id, granted_by_user_id) VALUES
(1,  1, 6,  7), -- alice.chen   → Finance Analyst
(2,  1, 4,  7), -- alice.chen   → Policy Author
(3,  1, 9,  7), -- alice.chen   → ROLE_ANALYST
(4,  6, 3,  7), -- frank.nguyen → Data Engineer
(5,  6, 10, 7), -- frank.nguyen → ROLE_DATA_ENGINEER
(6,  7, 8,  7)  -- admin        → Super Admin
ON CONFLICT (mapping_id) DO NOTHING;

-- ─── Minimal Data Platforms ───────────────────────────────────────────────────
INSERT INTO metadata_platforms (platform_id, platform_code, platform_name, driver_code, platform_version, connection_alias, account_identifier, warehouse, default_database, role_name, host, port, db_user, db_password, assigned_user_id, assigned_group_ids, connection_status) VALUES
(1, 'SNOWFLAKE', 'Snowflake Data Cloud', 'SNOWFLAKE', '8.12.0', 'prod-snowflake-warehouse', 'xy12345.us-east-1', 'ANALYTICS_WH', 'FINANCE_DB', 'ACCOUNTADMIN', 'xy12345.snowflakecomputing.com', 443, 'frank.nguyen', 'P@ssw0rd!SF2024', 6, '[3, 10]'::jsonb, 'CONNECTED'),
(2, 'REDSHIFT',  'AWS Redshift Warehouse', 'REDSHIFT', '1.0.52', 'analytics-cluster-prod', 'aws-us-east-1-cluster', NULL, 'acme_dw', 'awsuser', 'redshift-cluster.acme.us-east-1.redshift.amazonaws.com', 5439, 'frank.nguyen', 'Redsh!ftP@ss2024', 6, '[3, 10]'::jsonb, 'CONNECTED')
ON CONFLICT (platform_code) DO UPDATE SET
    platform_name = EXCLUDED.platform_name,
    driver_code = EXCLUDED.driver_code,
    assigned_user_id = EXCLUDED.assigned_user_id,
    assigned_group_ids = EXCLUDED.assigned_group_ids;

-- ─── Platform User Mappings Seed ──────────────────────────────────────────────
INSERT INTO platform_user_mappings (user_id, platform_id, platform_code, external_user_id) VALUES
(1, 1, 'SNOWFLAKE', 'ALICE_CDO_SF'),
(1, 2, 'REDSHIFT',  'alice_cdo_rs'),
(6, 1, 'SNOWFLAKE', 'FRANK_NGUYEN_SF'),
(6, 2, 'REDSHIFT',  'frank_nguyen_rs'),
(7, 1, 'SNOWFLAKE', 'ADMIN_SF'),
(7, 2, 'REDSHIFT',  'admin_rs')
ON CONFLICT (user_id, platform_code) DO UPDATE SET
    external_user_id = EXCLUDED.external_user_id;

-- ─── Minimal Data Domain & Data Product ───────────────────────────────────────
INSERT INTO data_domains (domain_id, organization_id, domain_name, domain_code, description, domain_owner_ldap) VALUES
(1, 1, 'Revenue Analytics', 'DOM_REV', 'Financial revenue, billing, and transactional data', 'ldap://ou=finance,dc=acme,dc=com')
ON CONFLICT (domain_id) DO NOTHING;

INSERT INTO data_products (product_id, domain_id, product_name, product_code, description, sensitivity_level) VALUES
(1, 1, 'Revenue Summary Feed', 'PROD_REV_SUM', 'Aggregated monthly revenue metrics per region', 'CONFIDENTIAL')
ON CONFLICT (product_id) DO NOTHING;

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

-- ─── Advance Auto-Increment Sequences ─────────────────────────────────────────
SELECT setval('organizations_organization_id_seq',           COALESCE((SELECT MAX(organization_id) FROM organizations), 1));
SELECT setval('data_domains_domain_id_seq',                   COALESCE((SELECT MAX(domain_id) FROM data_domains), 1));
SELECT setval('data_products_product_id_seq',                 COALESCE((SELECT MAX(product_id) FROM data_products), 1));
SELECT setval('roles_role_id_seq',                             COALESCE((SELECT MAX(role_id) FROM roles), 1));
SELECT setval('users_user_id_seq',                             COALESCE((SELECT MAX(user_id) FROM users), 1));
SELECT setval('user_role_mappings_mapping_id_seq',             COALESCE((SELECT MAX(mapping_id) FROM user_role_mappings), 1));
SELECT setval('metadata_platforms_platform_id_seq',            COALESCE((SELECT MAX(platform_id) FROM metadata_platforms), 1));
SELECT setval('platform_user_mappings_mapping_id_seq',         COALESCE((SELECT MAX(mapping_id) FROM platform_user_mappings), 1));
SELECT setval('policies_policy_id_seq',                        COALESCE((SELECT MAX(policy_id) FROM policies), 1));
SELECT setval('policy_versions_version_id_seq',                COALESCE((SELECT MAX(version_id) FROM policy_versions), 1));
SELECT setval('policy_rules_rule_id_seq',                      COALESCE((SELECT MAX(rule_id) FROM policy_rules), 1));
SELECT setval('policy_rule_subjects_subject_id_seq',           COALESCE((SELECT MAX(subject_id) FROM policy_rule_subjects), 1));
SELECT setval('policy_rule_actions_action_id_seq',             COALESCE((SELECT MAX(action_id) FROM policy_rule_actions), 1));
SELECT setval('policy_rule_conditions_condition_id_seq',       COALESCE((SELECT MAX(condition_id) FROM policy_rule_conditions), 1));
SELECT setval('policy_rule_resources_resource_id_seq',         COALESCE((SELECT MAX(resource_id) FROM policy_rule_resources), 1));
