// Starts a throwaway local PostgreSQL for development/tests (no Neon needed).
//   node scripts/local-pg.mjs   → postgres://postgres:postgres@127.0.0.1:54329/physio
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
const dir = process.env.LOCAL_PGDATA ?? "./.pgdata";
const pg = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: "postgres", port: 54329, persistent: true });
if (!existsSync(dir)) await pg.initialise();
await pg.start();
try { await pg.createDatabase("physio"); } catch {}
try { await pg.createDatabase("physio_test"); } catch {}
console.log("local postgres ready on 54329");
process.on("SIGTERM", async () => { await pg.stop(); process.exit(0); });
process.on("SIGINT", async () => { await pg.stop(); process.exit(0); });
setInterval(() => {}, 1 << 30);
