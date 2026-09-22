/**
 * Normaliza teléfono a E.164 canónico para cruce con Trazabilidad/Mooney.
 * Clave de join: telefono exacto + plataforma.
 */
export function normalizePhoneE164(
  raw: string | null | undefined
): string | null {
  if (!raw) return null;
  let s = String(raw).trim();
  if (!s) return null;

  if (s.startsWith("00")) {
    s = `+${s.slice(2)}`;
  }

  const teniaPlus = s.startsWith("+");
  const digits = s.replace(/\D/g, "");
  if (digits.length < 8) return null;

  let out = `+${digits}`;

  // Número local argentino cargado SIN código de país (ej. "11 6467-5373" o
  // "3511234567"): 10–11 dígitos, sin "+" y sin empezar con 54. Se asume
  // Argentina y se antepone 54 9 (móvil). Evita que "1164675373" quede como
  // +1164675373 (interpretado como país 1) y no cruce con la operación (+549…).
  if (!teniaPlus && !digits.startsWith("54") && digits.length >= 10 && digits.length <= 11) {
    out = `+549${digits}`;
  }

  // Argentina móvil: +549… (Kommo a veces manda +5411… sin el 9).
  if (out.startsWith("+54") && !out.startsWith("+549")) {
    const rest = out.slice(3);
    if (rest.length >= 10 && rest.length <= 11) {
      out = `+549${rest}`;
    }
  }

  if (!/^\+[1-9]\d{7,14}$/.test(out)) return null;
  return out;
}
