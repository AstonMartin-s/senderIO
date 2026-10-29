/** Campo de lead que el SalesBot condiciona para elegir el link de respuesta. */
export const CAMPO_IDENTIFICADOR = "IDENTIFICADOR";

function clave(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Valor a estampar en IDENTIFICADOR.
 * K1K (cualquier posición) se escribe "K1K".
 * Listavolve1 se escribe "volve1" (el valor que el bot filtra).
 * Si no, queda la primera etiqueta (M1 queda "M1"). Sin etiquetas → null.
 */
export function valorIdentificador(
  tags: Array<string | null | undefined>
): string | null {
  const limpios = tags.map((t) => (t ?? "").trim()).filter(Boolean);
  const claves = limpios.map(clave);
  if (claves.some((c) => c === "k1k")) return "K1K";
  if (claves.some((c) => c === "listavolve1" || c === "volve1")) return "volve1";
  return limpios[0] ?? null;
}
