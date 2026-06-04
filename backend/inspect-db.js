const { closePool, query } = require("./database");
const { loadEnvFile } = require("./env");

loadEnvFile();

async function inspectDatabase() {
  const users = await query(
    `SELECT id, name, email, active, created_at AS "createdAt"
     FROM app_users
     ORDER BY name ASC`
  );
  const currentRequest = await query(
    `SELECT cr.id, u.name AS "userName", cr.status,
            cr.requested_at AS "requestedAt", cr.expires_at AS "expiresAt"
     FROM code_requests cr
     JOIN app_users u ON u.id = cr.user_id
     WHERE cr.status = 'waiting'
     ORDER BY cr.requested_at DESC`
  );
  const recentRequests = await query(
    `SELECT cr.id, u.name AS "userName", cr.status,
            cr.requested_at AS "requestedAt", cr.completed_at AS "completedAt"
     FROM code_requests cr
     JOIN app_users u ON u.id = cr.user_id
     ORDER BY cr.requested_at DESC
     LIMIT 20`
  );
  const recentDeliveries = await query(
    `SELECT dh.id, u.name AS "userName", dh.recipient_email AS "recipientEmail",
            dh.status, dh.detail, dh.delivered_at AS "deliveredAt",
            dh.created_at AS "createdAt"
     FROM delivery_history dh
     JOIN app_users u ON u.id = dh.user_id
     ORDER BY dh.created_at DESC
     LIMIT 20`
  );

  console.log("\nUsuarios");
  console.table(users.rows);
  console.log("\nSolicitacao atual");
  console.table(currentRequest.rows);
  console.log("\nUltimas solicitacoes");
  console.table(recentRequests.rows);
  console.log("\nUltimas entregas");
  console.table(recentDeliveries.rows);
}

inspectDatabase()
  .catch((err) => {
    console.error(`Falha ao consultar o banco: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(closePool);
