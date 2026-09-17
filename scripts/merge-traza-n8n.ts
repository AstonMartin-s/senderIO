/**
 * Merge one-shot del dump n8n (MSG-TRZ-20260917-SND-DUMP-1).
 * No commitear el JSON. Idempotente por message_id / nombre de plantilla.
 *
 *   npx tsx scripts/merge-traza-n8n.ts
 */
import { existsSync, readFileSync } from "node:fs";
import "dotenv/config";
import pg from "pg";

const PATHS = [
  process.env.TRAZA_N8N_DUMP ?? "",
  "/tmp/traza-dumps/senderio-n8n.json",
  `${process.env.HOME}/Projects/Trazabilidad/app/data/dumps/senderio-n8n.json`,
].filter(Boolean);

function parseArt(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const d = /Z|[+-]\d{2}:\d{2}$/.test(s) ? new Date(s) : new Date(`${s}-03:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseMessageId(id: string): { bmId: string; leadId: number } | null {
  const m = /^senderio:([^:]+):(\d+)$/.exec(id);
  if (!m) return null;
  return { bmId: m[1], leadId: Number(m[2]) };
}

type DumpEnvio = {
  message_id: string;
  telefono?: string | null;
  segmento?: string | null;
  template_nombre?: string | null;
  ts_enviado?: string | null;
  ts_primera_respuesta?: string | null;
  estado_final?: string | null;
};

type DumpItem = {
  type: string;
  id: string;
  payload?: { templateNombre?: string | null; contenido?: string | null };
};

const dumpPath = PATHS.find((p) => existsSync(p));
if (!dumpPath) {
  console.error("no abre el json. busqué:", PATHS);
  process.exit(1);
}

const dump = JSON.parse(readFileSync(dumpPath, "utf8")) as {
  ref?: string;
  envios: DumpEnvio[];
  items: DumpItem[];
};

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const existing = await pool.query<{ k: string }>(`
  SELECT ('senderio:' || bm_id || ':' || lead_id) AS k
  FROM log_movimientos
  WHERE accion = 'movido_a_envio' AND lead_id IS NOT NULL
  GROUP BY bm_id, lead_id
`);
const have = new Set(existing.rows.map((r) => r.k));
const havePl = new Set(
  (await pool.query<{ nombre: string }>(`SELECT nombre FROM plantillas`)).rows.map(
    (r) => r.nombre
  )
);

const envios: Array<{
  ts: Date;
  bmId: string;
  leadId: number;
  resultado: string;
  telefono: string | null;
  segmento: string | null;
  templateNombre: string | null;
}> = [];
const errores: Array<{ ts: Date; bmId: string; leadId: number }> = [];
const resps: Array<{ ts: Date; bmId: string; leadId: number }> = [];

let skipExist = 0;
let skipBad = 0;

for (const e of dump.envios ?? []) {
  const parsed = parseMessageId(e.message_id);
  if (!parsed) {
    skipBad++;
    continue;
  }
  if (have.has(e.message_id)) {
    skipExist++;
    continue;
  }
  const ts = parseArt(e.ts_enviado);
  if (!ts) {
    skipBad++;
    continue;
  }
  have.add(e.message_id);
  envios.push({
    ts,
    bmId: parsed.bmId,
    leadId: parsed.leadId,
    resultado: e.estado_final === "failed" ? "error_3132" : "ok",
    telefono: e.telefono ?? null,
    segmento: e.segmento ?? null,
    templateNombre: e.template_nombre ?? null,
  });
  if (e.estado_final === "failed") {
    errores.push({ ts, bmId: parsed.bmId, leadId: parsed.leadId });
  } else if (e.ts_primera_respuesta) {
    const tsR = parseArt(e.ts_primera_respuesta);
    if (tsR) resps.push({ ts: tsR, bmId: parsed.bmId, leadId: parsed.leadId });
  }
}

const plantillas: Array<{ nombre: string; contenido: string }> = [];
for (const it of dump.items ?? []) {
  if (it.type !== "senderio.plantilla") continue;
  const nombre = it.payload?.templateNombre ?? it.id;
  const contenido = it.payload?.contenido ?? "";
  if (!nombre || havePl.has(nombre)) continue;
  havePl.add(nombre);
  plantillas.push({ nombre, contenido });
}

const client = await pool.connect();
try {
  await client.query("BEGIN");
  if (envios.length) {
    await client.query(
      `INSERT INTO log_movimientos
        (ts, bm_id, lead_id, accion, resultado, telefono, segmento, template_nombre)
       SELECT * FROM UNNEST(
         $1::timestamptz[], $2::text[], $3::bigint[],
         $4::text[], $5::text[], $6::text[], $7::text[], $8::text[]
       )`,
      [
        envios.map((e) => e.ts),
        envios.map((e) => e.bmId),
        envios.map((e) => e.leadId),
        envios.map(() => "movido_a_envio"),
        envios.map((e) => e.resultado),
        envios.map((e) => e.telefono),
        envios.map((e) => e.segmento),
        envios.map((e) => e.templateNombre),
      ]
    );
  }
  if (errores.length) {
    await client.query(
      `INSERT INTO log_movimientos (ts, bm_id, lead_id, accion, resultado)
       SELECT * FROM UNNEST(
         $1::timestamptz[], $2::text[], $3::bigint[], $4::text[], $5::text[]
       )`,
      [
        errores.map((e) => e.ts),
        errores.map((e) => e.bmId),
        errores.map((e) => e.leadId),
        errores.map(() => "resultado_error"),
        errores.map(() => "error_3132"),
      ]
    );
  }
  if (resps.length) {
    await client.query(
      `INSERT INTO log_movimientos (ts, bm_id, lead_id, accion, resultado)
       SELECT * FROM UNNEST(
         $1::timestamptz[], $2::text[], $3::bigint[], $4::text[], $5::text[]
       )`,
      [
        resps.map((e) => e.ts),
        resps.map((e) => e.bmId),
        resps.map((e) => e.leadId),
        resps.map(() => "resultado_respuesta"),
        resps.map(() => "ok"),
      ]
    );
  }
  if (plantillas.length) {
    await client.query(
      `INSERT INTO plantillas (bm_id, nombre, contenido, activo, estado)
       SELECT 'BM1', * FROM UNNEST($1::text[], $2::text[])`,
      [plantillas.map((p) => p.nombre), plantillas.map((p) => p.contenido)]
    );
  }
  await client.query("COMMIT");
} catch (err) {
  await client.query("ROLLBACK");
  throw err;
} finally {
  client.release();
}

const after = await pool.query<{ n: string }>(`
  SELECT COUNT(DISTINCT (bm_id, lead_id))::text AS n
  FROM log_movimientos
  WHERE accion = 'movido_a_envio' AND lead_id IS NOT NULL
`);

console.log(
  JSON.stringify(
    {
      dump: dumpPath,
      ref: dump.ref ?? null,
      dumpEnvios: dump.envios.length,
      skipExist,
      skipBad,
      insertedEnvios: envios.length,
      insertedErrores: errores.length,
      insertedRespuestas: resps.length,
      insertedPlantillas: plantillas.length,
      unicosPostMerge: Number(after.rows[0].n),
    },
    null,
    2
  )
);

await pool.end();
