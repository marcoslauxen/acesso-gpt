const { Pool } = require("pg");

class DatabaseConfigurationError extends Error {
  constructor() {
    super("Configure DATABASE_URL para usar o cadastro de usuarios e as solicitacoes.");
    this.name = "DatabaseConfigurationError";
  }
}

let pool;

function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new DatabaseConfigurationError();
  }

  if (!pool) {
    const sslEnabled = ["1", "true", "require"].includes(
      String(process.env.DATABASE_SSL || "").toLowerCase()
    );

    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: sslEnabled ? { rejectUnauthorized: false } : undefined,
    });
  }

  return pool;
}

function query(text, params) {
  return getPool().query(text, params);
}

async function withTransaction(callback) {
  const client = await getPool().connect();

  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function closePool() {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}

module.exports = {
  DatabaseConfigurationError,
  closePool,
  getPool,
  query,
  withTransaction,
};
