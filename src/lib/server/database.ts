import { PGlite, type Transaction } from "@electric-sql/pglite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { Pool } from "pg";

export type SqlValue = string | number | boolean | Date | null | Record<string, unknown> | unknown[];
export type SqlResult<Row extends Record<string, unknown> = Record<string, unknown>> = {
  rows: Row[];
  rowCount: number;
};

export interface Database {
  readonly engine: "pglite" | "postgres";
  query<Row extends Record<string, unknown> = Record<string, unknown>>(sql: string, params?: SqlValue[]): Promise<SqlResult<Row>>;
  exec(sql: string): Promise<void>;
  transaction<T>(work: (database: Database) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

class PostgresDatabase implements Database {
  readonly engine = "postgres" as const;
  constructor(private readonly pool: Pool) {}

  async query<Row extends Record<string, unknown>>(sql: string, params: SqlValue[] = []) {
    const result = await this.pool.query<Row>(sql, params);
    return { rows: result.rows, rowCount: result.rowCount ?? result.rows.length };
  }

  async exec(sql: string) {
    await this.pool.query(sql);
  }

  async transaction<T>(work: (database: Database) => Promise<T>) {
    const client = await this.pool.connect();
    const scoped: Database = {
      engine: "postgres",
      query: async <Row extends Record<string, unknown>>(sql: string, params: SqlValue[] = []) => {
        const result = await client.query<Row>(sql, params);
        return { rows: result.rows, rowCount: result.rowCount ?? result.rows.length };
      },
      exec: async (sql: string) => {
        await client.query(sql);
      },
      transaction: async <Nested>(nested: (database: Database) => Promise<Nested>) => nested(scoped),
      close: async () => undefined,
    };
    try {
      await client.query("BEGIN");
      const result = await work(scoped);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async close() {
    await this.pool.end();
  }
}

class LocalDatabase implements Database {
  readonly engine = "pglite" as const;
  constructor(
    private readonly client: PGlite,
    private readonly activeClient: PGlite | Transaction = client,
    private readonly isTransaction = false,
  ) {}

  async query<Row extends Record<string, unknown>>(sql: string, params: SqlValue[] = []) {
    const result = await this.activeClient.query<Row>(sql, params);
    return { rows: result.rows, rowCount: result.rows.length || result.affectedRows || 0 };
  }

  async exec(sql: string) {
    await this.activeClient.exec(sql);
  }

  async transaction<T>(work: (database: Database) => Promise<T>): Promise<T> {
    if (this.isTransaction) return work(this);

    return this.client.transaction(async (transaction) => {
      const scoped = new LocalDatabase(this.client, transaction, true);
      return work(scoped);
    });
  }

  async close() {
    if (!this.isTransaction) await this.client.close();
  }
}

declare global {
  var __hifiveDatabase: Promise<Database> | undefined;
}

function createPostgresDatabase(connectionString: string) {
  const parsedConnection = new URL(connectionString);
  const connectionSslMode = parsedConnection.searchParams.get("sslmode")?.toLowerCase();
  parsedConnection.searchParams.delete("sslmode");
  parsedConnection.searchParams.delete("uselibpqcompat");

  const sslMode = process.env.DATABASE_SSL?.toLowerCase() ?? connectionSslMode;
  const ca = process.env.DATABASE_CA_CERT?.replace(/\\n/g, "\n").trim();
  const ssl = sslMode === "disable"
    ? false
    : {
        rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false",
        ...(ca ? { ca } : {}),
      };
  return new PostgresDatabase(new Pool({
    connectionString: parsedConnection.toString(),
    ssl,
    max: 10,
    connectionTimeoutMillis: 10_000,
  }));
}

async function createDatabase(): Promise<Database> {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (connectionString) return createPostgresDatabase(connectionString);

  if (process.env.NODE_ENV === "production") {
    throw new Error("DATABASE_URL is required in production.");
  }

  const localPath = join(process.cwd(), ".data", "hifive.pglite");
  mkdirSync(dirname(localPath), { recursive: true });
  return new LocalDatabase(new PGlite(localPath));
}

export function getDatabase() {
  globalThis.__hifiveDatabase ??= createDatabase();
  return globalThis.__hifiveDatabase;
}

export async function closeDatabase() {
  const database = await globalThis.__hifiveDatabase;
  globalThis.__hifiveDatabase = undefined;
  if (database) await database.close();
}
