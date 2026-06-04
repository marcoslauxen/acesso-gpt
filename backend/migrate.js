const fs = require("fs");
const path = require("path");
const { closePool, getPool } = require("./database");
const { loadEnvFile } = require("./env");

loadEnvFile();

async function migrate() {
  const client = await getPool().connect();
  const migrationsPath = path.join(__dirname, "migrations");

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const files = fs
      .readdirSync(migrationsPath)
      .filter((file) => file.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const existing = await client.query(
        "SELECT 1 FROM schema_migrations WHERE name = $1",
        [file]
      );

      if (existing.rowCount > 0) {
        continue;
      }

      const sql = fs.readFileSync(path.join(migrationsPath, file), "utf8");

      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
        await client.query("COMMIT");
        console.log(`Migration aplicada: ${file}`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }
  } finally {
    client.release();
    await closePool();
  }
}

migrate().catch((err) => {
  console.error(`Falha ao aplicar migrations: ${err.message}`);
  process.exitCode = 1;
});
