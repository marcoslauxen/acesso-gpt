const { query } = require("../database");

const MAX_AVATAR_BYTES = 400 * 1024;
const ALLOWED_AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

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

function parseAvatarDataUrl(avatarDataUrl) {
  if (avatarDataUrl === undefined || avatarDataUrl === null || avatarDataUrl === "") {
    return null;
  }

  if (typeof avatarDataUrl !== "string") {
    return { error: "Foto invalida." };
  }

  const match = avatarDataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);

  if (!match || !ALLOWED_AVATAR_TYPES.has(match[1])) {
    return { error: "Use uma foto JPG, PNG ou WebP." };
  }

  const data = Buffer.from(match[2], "base64");

  if (data.length === 0 || data.length > MAX_AVATAR_BYTES) {
    return { error: "A foto deve ter no maximo 400 KB." };
  }

  return { data, mime: match[1] };
}

async function listActiveUsers() {
  const result = await query(
    `SELECT id, name,
            CASE WHEN avatar_data IS NOT NULL
              THEN '/api/users/' || id || '/avatar?v=' || EXTRACT(EPOCH FROM updated_at)::BIGINT
            END AS "avatarUrl"
     FROM app_users
     WHERE active = TRUE
     ORDER BY name ASC`
  );

  return result.rows;
}

async function listAdminUsers() {
  const result = await query(
    `SELECT id, name, email, active,
            CASE WHEN avatar_data IS NOT NULL
              THEN '/api/users/' || id || '/avatar?v=' || EXTRACT(EPOCH FROM updated_at)::BIGINT
            END AS "avatarUrl",
            created_at AS "createdAt", updated_at AS "updatedAt"
     FROM app_users
     ORDER BY name ASC`
  );

  return result.rows;
}

async function createUser(name, email, avatar = null) {
  const result = await query(
    `INSERT INTO app_users
       (name, email, normalized_name, normalized_email, avatar_data, avatar_mime)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, name, email, active,
               CASE WHEN avatar_data IS NOT NULL
                 THEN '/api/users/' || id || '/avatar?v=' || EXTRACT(EPOCH FROM updated_at)::BIGINT
               END AS "avatarUrl",
               created_at AS "createdAt"`,
    [name, email, normalizeName(name), normalizeEmail(email), avatar?.data || null, avatar?.mime || null]
  );

  return result.rows[0];
}

async function getUserAvatar(userId) {
  const result = await query(
    `SELECT avatar_data AS data, avatar_mime AS mime
     FROM app_users
     WHERE id = $1 AND active = TRUE AND avatar_data IS NOT NULL`,
    [userId]
  );

  return result.rows[0] || null;
}

async function updateUser(userId, name, email, avatarAction) {
  const avatarData =
    avatarAction?.type === "replace" ? avatarAction.avatar.data : null;
  const avatarMime =
    avatarAction?.type === "replace" ? avatarAction.avatar.mime : null;
  const replaceAvatar = avatarAction?.type === "replace";
  const removeAvatar = avatarAction?.type === "remove";

  const result = await query(
    `UPDATE app_users
     SET name = $2,
         email = $3,
         normalized_name = $4,
         normalized_email = $5,
         avatar_data = CASE
           WHEN $6::BOOLEAN THEN $7
           WHEN $8::BOOLEAN THEN NULL
           ELSE avatar_data
         END,
         avatar_mime = CASE
           WHEN $6::BOOLEAN THEN $9
           WHEN $8::BOOLEAN THEN NULL
           ELSE avatar_mime
         END,
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, name, email, active,
               CASE WHEN avatar_data IS NOT NULL
                 THEN '/api/users/' || id || '/avatar?v=' || EXTRACT(EPOCH FROM updated_at)::BIGINT
               END AS "avatarUrl",
               created_at AS "createdAt", updated_at AS "updatedAt"`,
    [
      userId,
      name,
      email,
      normalizeName(name),
      normalizeEmail(email),
      replaceAvatar,
      avatarData,
      removeAvatar,
      avatarMime,
    ]
  );

  return result.rows[0] || null;
}

module.exports = {
  MAX_AVATAR_BYTES,
  createUser,
  getUserAvatar,
  listActiveUsers,
  listAdminUsers,
  normalizeEmail,
  normalizeName,
  parseAvatarDataUrl,
  updateUser,
  validateUserInput,
};
