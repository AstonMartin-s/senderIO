/**
 * Parser CSV mínimo para las bases del panel-cliente. Soporta separador coma o
 * punto y coma, comillas dobles, y detecta columnas de teléfono/nombre por
 * encabezado. Si no hay encabezado reconocible, toma la 1ª columna como teléfono.
 */

export interface FilaCsv {
  telefonoRaw: string | null;
  nombre: string | null;
  extra: Record<string, string> | null;
}

function splitLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === sep) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const TEL_KEYS = ["telefono", "teléfono", "phone", "celular", "whatsapp", "wa", "numero", "número"];
const NOM_KEYS = ["nombre", "name", "contacto", "cliente"];

export function parseCsv(text: string): FilaCsv[] {
  const lines = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((l) => l.trim().length > 0);
  if (!lines.length) return [];

  const sep = lines[0].includes(";") && !lines[0].includes(",") ? ";" : ",";
  const first = splitLine(lines[0], sep).map((h) => h.toLowerCase());

  // ¿La primera fila es encabezado? Sí si alguna celda matchea keys conocidas.
  const telIdx = first.findIndex((h) => TEL_KEYS.includes(h));
  const nomIdx = first.findIndex((h) => NOM_KEYS.includes(h));
  const hasHeader = telIdx >= 0 || nomIdx >= 0;

  const dataLines = hasHeader ? lines.slice(1) : lines;
  const tel = hasHeader && telIdx >= 0 ? telIdx : 0;
  const nom = hasHeader && nomIdx >= 0 ? nomIdx : -1;

  return dataLines.map((line) => {
    const cells = splitLine(line, sep);
    const extra: Record<string, string> = {};
    if (hasHeader) {
      first.forEach((h, i) => {
        if (i !== tel && i !== nom && cells[i]) extra[h] = cells[i];
      });
    }
    return {
      telefonoRaw: cells[tel] || null,
      nombre: nom >= 0 ? cells[nom] || null : null,
      extra: Object.keys(extra).length ? extra : null,
    };
  });
}
