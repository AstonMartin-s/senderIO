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

  const digits = s.replace(/\D/g, "");
  if (digits.length < 8) return null;

  let out = `+${digits}`;

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
