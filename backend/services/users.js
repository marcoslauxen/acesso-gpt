const { query } = require("../database");

function normalizeName(name) {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
}

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function validateUserInput(name, email) {
  const cleanName = typeof name === "string" ? name.trim().replace(/\s+/g, " ") : "";
  const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : "";

  if (cleanName.length < 2 || cleanName.length > 100) {
    return { error: "O nome deve ter entre 2 e 100 caracteres." };
  }

  if (
    cleanEmail.length > 320 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)
  ) {
    return { error: "Informe um e-mail valido." };
  }

  return { name: cleanName, email: cleanEmail };
}

async function listActiveUsers() {
  const result = await query(
    `SELECT id, name
     FROM app_users
     WHERE active = TRUE
     ORDER BY name ASC`
  );

  return result.rows;
}

async function createUser(name, email) {
  const result = await query(
    `INSERT INTO app_users (name, email, normalized_name, normalized_email)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, email, active, created_at AS "createdAt"`,
    [name, email, normalizeName(name), normalizeEmail(email)]
  );

  return result.rows[0];
}

module.exports = {
  createUser,
  listActiveUsers,
  normalizeEmail,
  normalizeName,
  validateUserInput,
};
