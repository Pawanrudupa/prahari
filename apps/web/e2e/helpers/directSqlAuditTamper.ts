import pg from "pg";

const DEFAULT_DB_URL = "postgresql://prahari:prahari@localhost:5432/prahari";

function getConnectionString(): string {
  const raw = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || DEFAULT_DB_URL;
  // Convert asyncpg or psycopg prefix to standard postgresql://
  return raw.replace(/^postgresql\+[a-zA-Z0-9_]+:\/\//, "postgresql://");
}

/**
 * Direct SQL helper for test harnesses to simulate database tampering
 * against the test DB only.
 * Invariant: No HTTP route may modify or delete audit rows.
 */
export async function tamperAuditRecordDirectSql(targetSeq?: number): Promise<{
  tamperedSeq: number;
  originalHash: string;
  tamperedHash: string;
}> {
  const client = new pg.Client({ connectionString: getConnectionString() });
  await client.connect();

  try {
    let row: { seq: number; hash: string } | undefined;

    if (targetSeq !== undefined) {
      const res = await client.query("SELECT seq, hash FROM audit_log WHERE seq = $1", [targetSeq]);
      row = res.rows[0];
    } else {
      const res = await client.query("SELECT seq, hash FROM audit_log ORDER BY seq DESC LIMIT 1");
      row = res.rows[0];
    }

    if (!row) {
      throw new Error("No audit log record found to tamper.");
    }

    const tamperedSeq = row.seq;
    const originalHash = row.hash;
    const tamperedHash = "deadbeef".repeat(8);

    await client.query("UPDATE audit_log SET hash = $1 WHERE seq = $2", [tamperedHash, tamperedSeq]);

    return {
      tamperedSeq,
      originalHash,
      tamperedHash,
    };
  } finally {
    await client.end();
  }
}

/**
 * Restores a tampered audit record to its pristine cryptographic hash.
 */
export async function restoreAuditRecordDirectSql(seq: number, originalHash: string): Promise<void> {
  const client = new pg.Client({ connectionString: getConnectionString() });
  await client.connect();

  try {
    await client.query("UPDATE audit_log SET hash = $1 WHERE seq = $2", [originalHash, seq]);
  } finally {
    await client.end();
  }
}
