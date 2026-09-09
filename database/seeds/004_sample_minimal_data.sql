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
