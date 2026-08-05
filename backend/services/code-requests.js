const { query, withTransaction } = require("../database");

const DEFAULT_REQUEST_TIMEOUT_MINUTES = 5;
const DEFAULT_REQUEST_HISTORY_LIMIT = 10;
const MAX_REQUEST_HISTORY_LIMIT = 50;

function getRequestTimeoutMinutes() {
  const configuredValue = Number.parseInt(process.env.REQUEST_TIMEOUT_MINUTES, 10);

  if (!Number.isInteger(configuredValue) || configuredValue < 1 || configuredValue > 30) {
    return DEFAULT_REQUEST_TIMEOUT_MINUTES;
  }

  return configuredValue;
}

function normalizeRequestHistoryLimit(value) {
  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue < 1 || parsedValue > MAX_REQUEST_HISTORY_LIMIT) {
    return DEFAULT_REQUEST_HISTORY_LIMIT;
  }

  return parsedValue;
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
              cr.status, cr.requested_at AS "requestedAt", cr.expires_at AS "expiresAt"
       FROM code_requests cr
       JOIN app_users u ON u.id = cr.user_id
       WHERE cr.status IN ('waiting', 'processing')
       LIMIT 1`
    );

    return result.rows[0] || null;
  });
}

async function listRecentRequests(limit = DEFAULT_REQUEST_HISTORY_LIMIT, dependencies = {}) {
  const queryImpl = dependencies.query || query;
  const result = await queryImpl(
    `SELECT u.name AS "userName", cr.requested_at AS "requestedAt"
     FROM code_requests cr
     JOIN app_users u ON u.id = cr.user_id
     ORDER BY cr.requested_at DESC
     LIMIT $1`,
    [normalizeRequestHistoryLimit(limit)]
  );

  return result.rows.map((row) => ({
    userName: row.userName,
    requestedAt: row.requestedAt,
  }));
}

async function createRequest(userId) {
  return withTransaction(async (client) => {
    // Serializa a reserva da vez mesmo quando duas pessoas clicam ao mesmo tempo.
    await client.query("SELECT pg_advisory_xact_lock($1)", [728451]);
    await expireStaleRequests(client);

    const activeRequest = await client.query(
      `SELECT cr.id, cr.user_id AS "userId", u.name AS "userName",
              cr.status, cr.requested_at AS "requestedAt", cr.expires_at AS "expiresAt"
       FROM code_requests cr
       JOIN app_users u ON u.id = cr.user_id
       WHERE cr.status IN ('waiting', 'processing')
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

async function getCurrentRequestForObserver() {
  return withTransaction(async (client) => {
    await expireStaleRequests(client);

    const result = await client.query(
      `SELECT cr.id, cr.user_id AS "userId", u.name AS "userName",
              u.email AS "userEmail", cr.requested_at AS "requestedAt",
              cr.expires_at AS "expiresAt"
       FROM code_requests cr
       JOIN app_users u ON u.id = cr.user_id
       WHERE cr.status = 'waiting'
       LIMIT 1`
    );

    return result.rows[0] || null;
  });
}

async function getRequestStatus(requestId) {
  return withTransaction(async (client) => {
    await expireStaleRequests(client);

    const result = await client.query(
      `SELECT cr.id, cr.user_id AS "userId", u.name AS "userName", cr.status,
              cr.requested_at AS "requestedAt", cr.expires_at AS "expiresAt",
              cr.completed_at AS "completedAt"
       FROM code_requests cr
       JOIN app_users u ON u.id = cr.user_id
       WHERE cr.id = $1`,
      [requestId]
    );

    return result.rows[0] || null;
  });
}

async function claimRequestForDelivery(requestId, sourceMessageId) {
  try {
    return await withTransaction(async (client) => {
      const result = await client.query(
        `UPDATE code_requests cr
         SET status = 'processing', source_message_id = $2
         FROM app_users u
         WHERE cr.id = $1
           AND cr.user_id = u.id
           AND cr.status = 'waiting'
           AND cr.expires_at > NOW()
         RETURNING cr.id, cr.user_id AS "userId", u.name AS "userName",
                   u.email AS "userEmail", cr.source_message_id AS "sourceMessageId"`,
        [requestId, sourceMessageId]
      );

      return result.rows[0] || null;
    });
  } catch (err) {
    if (err.code === "23505") {
      return null;
    }

    throw err;
  }
}

async function completeRequestDelivery(request, status, detail = null) {
  if (!["sent", "failed"].includes(status)) {
    throw new Error("Status de entrega invalido.");
  }

  return withTransaction(async (client) => {
    const completed = await client.query(
      `UPDATE code_requests
       SET status = $2, completed_at = NOW()
       WHERE id = $1 AND status = 'processing'
       RETURNING id`,
      [request.id, status]
    );

    if (completed.rowCount === 0) {
      return false;
    }

    await client.query(
      `INSERT INTO delivery_history
         (request_id, user_id, recipient_email, status, detail, delivered_at)
       VALUES ($1, $2, $3, $4::VARCHAR, $5,
               CASE WHEN $4::VARCHAR = 'sent' THEN NOW() ELSE NULL END)`,
      [request.id, request.userId, request.userEmail, status, detail]
    );

    return true;
  });
}

async function failInterruptedDeliveries() {
  return withTransaction(async (client) => {
    const interrupted = await client.query(
      `UPDATE code_requests cr
       SET status = 'failed', completed_at = NOW()
       FROM app_users u
       WHERE cr.user_id = u.id AND cr.status = 'processing'
       RETURNING cr.id, cr.user_id AS "userId", u.email AS "userEmail"`
    );

    for (const request of interrupted.rows) {
      await client.query(
        `INSERT INTO delivery_history
           (request_id, user_id, recipient_email, status, detail)
         VALUES ($1, $2, $3, 'failed', $4)
         ON CONFLICT (request_id) DO NOTHING`,
        [
          request.id,
          request.userId,
          request.userEmail,
          "Envio interrompido por reinicio do servidor.",
        ]
      );
    }

    return interrupted.rowCount;
  });
}

module.exports = {
  DEFAULT_REQUEST_HISTORY_LIMIT,
  DEFAULT_REQUEST_TIMEOUT_MINUTES,
  MAX_REQUEST_HISTORY_LIMIT,
  cancelCurrentRequest,
  claimRequestForDelivery,
  completeRequestDelivery,
  createRequest,
  failInterruptedDeliveries,
  getCurrentRequest,
  getCurrentRequestForObserver,
  getRequestStatus,
  getRequestTimeoutMinutes,
  listRecentRequests,
  normalizeRequestHistoryLimit,
};
