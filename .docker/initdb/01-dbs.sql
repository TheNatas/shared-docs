-- Runs once, on first container start, after POSTGRES_DB (shared_docs_test) exists.
-- Adds the development database to the same container so there is one thing to start.
CREATE DATABASE shared_docs_dev OWNER test;
