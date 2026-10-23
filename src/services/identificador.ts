/** Campo de lead que el SalesBot condiciona para elegir el link de respuesta. */
export const CAMPO_IDENTIFICADOR = "IDENTIFICADOR";

/**
 * Valor a estampar en IDENTIFICADOR.
 * La etiqueta K1K (cualquier posición) gana y se escribe "K1K".
 * Si no, queda la primera etiqueta. Sin etiquetas → null (no se escribe).
 */
export function valorIdentificador(
  tags: Array<string | null | undefined>
): string | null {
  const limpios = tags.map((t) => (t ?? "").trim()).filter(Boolean);
  if (limpios.some((t) => t.toLowerCase() === "k1k")) return "K1K";
  return limpios[0] ?? null;
}
