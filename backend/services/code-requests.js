const { query, withTransaction } = require("../database");

const DEFAULT_REQUEST_TIMEOUT_MINUTES = 5;

function getRequestTimeoutMinutes() {
  const configuredValue = Number.parseInt(process.env.REQUEST_TIMEOUT_MINUTES, 10);

  if (!Number.isInteger(configuredValue) || configuredValue < 1 || configuredValue > 30) {
    return DEFAULT_REQUEST_TIMEOUT_MINUTES;
  }

  return configuredValue;
}

async function expireStaleRequests(client) {
  await client.query(
    `UPDATE code_requests
     SET status = 'expired', completed_at = NOW()
     WHERE status = 'waiting' AND expires_at <= NOW()`
  );
}

async function getCurrentRequest() {
  return withTransaction(async (client) => {
    await expireStaleRequests(client);

    const result = await client.query(
      `SELECT cr.id, cr.user_id AS "userId", u.name AS "userName",
              cr.requested_at AS "requestedAt", cr.expires_at AS "expiresAt"
       FROM code_requests cr
       JOIN app_users u ON u.id = cr.user_id
       WHERE cr.status = 'waiting'
       LIMIT 1`
    );

    return result.rows[0] || null;
  });
}

async function createRequest(userId) {
  return withTransaction(async (client) => {
    // Serializa a reserva da vez mesmo quando duas pessoas clicam ao mesmo tempo.
    await client.query("SELECT pg_advisory_xact_lock($1)", [728451]);
    await expireStaleRequests(client);

    const activeRequest = await client.query(
      `SELECT cr.id, cr.user_id AS "userId", u.name AS "userName",
              cr.requested_at AS "requestedAt", cr.expires_at AS "expiresAt"
       FROM code_requests cr
       JOIN app_users u ON u.id = cr.user_id
       WHERE cr.status = 'waiting'
       LIMIT 1`
    );

    if (activeRequest.rowCount > 0) {
      return { conflict: activeRequest.rows[0] };
    }

    const user = await client.query(
      `SELECT id, name
       FROM app_users
       WHERE id = $1 AND active = TRUE`,
      [userId]
    );

    if (user.rowCount === 0) {
      return { userNotFound: true };
    }

    const timeoutMinutes = getRequestTimeoutMinutes();
    const result = await client.query(
      `INSERT INTO code_requests (user_id, expires_at)
       VALUES ($1, NOW() + ($2 * INTERVAL '1 minute'))
       RETURNING id, user_id AS "userId", requested_at AS "requestedAt",
                 expires_at AS "expiresAt"`,
      [userId, timeoutMinutes]
    );

    return {
      request: {
        ...result.rows[0],
        userName: user.rows[0].name,
      },
    };
  });
}

async function cancelCurrentRequest() {
  const result = await query(
    `UPDATE code_requests
     SET status = 'canceled', completed_at = NOW()
     WHERE status = 'waiting'
     RETURNING id`
  );

  return result.rowCount > 0;
}

module.exports = {
  DEFAULT_REQUEST_TIMEOUT_MINUTES,
  cancelCurrentRequest,
  createRequest,
  getCurrentRequest,
  getRequestTimeoutMinutes,
};
