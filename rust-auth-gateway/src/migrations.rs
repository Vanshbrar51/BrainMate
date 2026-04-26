// src/migrations.rs — Database migration runner for brainmate-auth-gateway.
//
// Applies the auth schema SQL to the connected PostgreSQL/Supabase instance.
// Uses sqlx::migrate! when an offline `.sqlx` query cache is present, or
// falls back to executing the embedded SQL directly.
//
// To generate the offline cache (enables compile-time checking):
//   DATABASE_URL=postgres://... cargo sqlx prepare
//
// Until then, migrations are applied at runtime from the bundled SQL text.

use sqlx::PgPool;

/// SQL for the initial auth schema migration.
/// Embedded at compile time from migrations/0001_auth_schema.sql.
const SCHEMA_SQL: &str = include_str!("../migrations/0001_auth_schema.sql");

/// Marker key stored in a simple migrations table to track applied migrations.
const MIGRATION_TABLE: &str = "CREATE TABLE IF NOT EXISTS _brainmate_migrations (
    id         TEXT        PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)";

/// Run all pending migrations against the connected database.
///
/// This is idempotent: all DDL statements use IF NOT EXISTS / OR REPLACE, and
/// the migrations table prevents the SQL from being re-applied on restart.
///
/// # Errors
///
/// Returns a `sqlx::Error` if the database is unreachable or if a migration
/// statement fails.
pub async fn run_migrations(pool: &PgPool) -> Result<(), sqlx::Error> {
    tracing::info!("checking database migrations");

    use sqlx::Executor;

    // Ensure the migrations tracking table exists. Execute as simple query to avoid PgBouncer conflicts.
    pool.execute(MIGRATION_TABLE).await?;

    // Check whether migration 0001 has already been applied.
    // Use simple query without bind parameters.
    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM _brainmate_migrations WHERE id = '0001_auth_schema'",
    )
    .fetch_one(pool)
    .await?;

    if count > 0 {
        tracing::info!("migration 0001_auth_schema already applied — skipping");
        return Ok(());
    }

    tracing::info!("applying migration 0001_auth_schema");

    // Execute the schema SQL. Use a transaction so a partial failure rolls back.
    let mut tx = pool.begin().await?;

    // PostgreSQL natively supports multiple statements in a single Simple Query Protocol message.
    // Executing the entire script at once avoids breaking $$ quoting in CREATE FUNCTION blocks
    // which contain internal semicolons.
    tx.execute(SCHEMA_SQL).await?;

    // Record the applied migration.
    tx.execute(
        "INSERT INTO _brainmate_migrations (id) VALUES ('0001_auth_schema') ON CONFLICT DO NOTHING",
    )
    .await?;

    tx.commit().await?;
    tracing::info!("migration 0001_auth_schema applied successfully");

    Ok(())
}
