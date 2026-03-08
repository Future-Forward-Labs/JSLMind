-- JSLMind — Postgres database initialisation
-- Runs once on first container start via /docker-entrypoint-initdb.d/
-- Each service that depends on Postgres gets its own database.

SELECT 'CREATE DATABASE keycloak'  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'keycloak')  \gexec
SELECT 'CREATE DATABASE litellm'   WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'litellm')   \gexec
SELECT 'CREATE DATABASE langfuse'  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'langfuse')  \gexec
SELECT 'CREATE DATABASE backstage' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'backstage') \gexec
SELECT 'CREATE DATABASE airflow'   WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'airflow')   \gexec
SELECT 'CREATE DATABASE marquez'   WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'marquez')   \gexec
SELECT 'CREATE DATABASE temporal'  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'temporal')  \gexec
SELECT 'CREATE DATABASE dify'      WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'dify')      \gexec
SELECT 'CREATE DATABASE n8n'       WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'n8n')       \gexec
