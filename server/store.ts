import { Pool } from 'pg'

import type { RoomSnapshot } from './rooms'

/**
 * Where rooms live between server restarts.
 *
 * A room is a single row of JSON. The whole snapshot is rewritten on every
 * change rather than diffed: a room is a few kilobytes at most, and a game
 * produces a handful of writes per turn, so the simple thing is fast enough and
 * cannot drift out of step with the in-memory copy.
 */
export interface RoomStore {
  loadAll(): Promise<RoomSnapshot[]>
  save(snapshot: RoomSnapshot): Promise<void>
  remove(codes: string[]): Promise<void>
  close(): Promise<void>
}

/**
 * `jsonb` reorders object keys, so a snapshot does not come back byte for byte.
 * Nothing reads a room by key order — the board is walked in `board.order` and
 * everything else is a lookup or a sum — so the restored game is identical.
 */
const SCHEMA = `
  create table if not exists rooms (
    code text primary key,
    data jsonb not null,
    last_activity timestamptz not null
  );
  create index if not exists rooms_last_activity_idx on rooms (last_activity);
`

export class PostgresRoomStore implements RoomStore {
  private constructor(private readonly pool: Pool) {}

  /**
   * Connect and make sure the table exists. Retries, because a container stack
   * routinely brings the server up before the database is accepting connections.
   */
  static async connect(url: string, timeoutMs = 30_000): Promise<PostgresRoomStore> {
    const pool = new Pool({
      connectionString: url,
      max: Number(process.env.DATABASE_POOL_MAX ?? 5),
      // Managed providers usually terminate TLS with a certificate the container
      // has no root for; opt in explicitly rather than silently trusting one.
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    })
    pool.on('error', (error) => console.error('[db] idle client error:', error.message))

    const deadline = Date.now() + timeoutMs
    for (let attempt = 1; ; attempt++) {
      try {
        await pool.query(SCHEMA)
        return new PostgresRoomStore(pool)
      } catch (error) {
        if (Date.now() >= deadline) {
          await pool.end().catch(() => {})
          throw error
        }
        const wait = Math.min(1000 * attempt, 5000)
        console.warn(`[db] not ready (${(error as Error).message}); retrying in ${wait}ms`)
        await new Promise((resolve) => setTimeout(resolve, wait))
      }
    }
  }

  async loadAll(): Promise<RoomSnapshot[]> {
    const { rows } = await this.pool.query<{ data: RoomSnapshot }>(
      'select data from rooms order by last_activity desc',
    )
    return rows.map((row) => row.data)
  }

  async save(snapshot: RoomSnapshot): Promise<void> {
    await this.pool.query(
      `insert into rooms (code, data, last_activity) values ($1, $2, to_timestamp($3 / 1000.0))
       on conflict (code) do update set data = excluded.data, last_activity = excluded.last_activity`,
      [snapshot.code, JSON.stringify(snapshot), snapshot.lastActivity],
    )
  }

  async remove(codes: string[]): Promise<void> {
    if (!codes.length) return
    await this.pool.query('delete from rooms where code = any($1::text[])', [codes])
  }

  async close(): Promise<void> {
    await this.pool.end()
  }
}
