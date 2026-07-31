// Unidade de mundo = 1 cm. Formatação e parsing (adaptado de open3dFloorplan settings.ts).

export function formatLength(cm: number): string {
  if (cm >= 100) {
    const m = cm / 100;
    return `${m.toFixed(m % 1 === 0 ? 0 : 2).replace(".", ",")} m`;
  }
  return `${Math.round(cm)} cm`;
}

/** Aceita "500", "5m", "5,2 m", "80 cm" → cm. */
export function parseLength(input: string): number | null {
  const s = String(input).trim().toLowerCase().replace(",", ".");
  if (!s) return null;
  const m = s.match(/^([\d.]+)\s*(m|cm|mm)?$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  const unit = m[2] || "cm";
  if (unit === "m") return n * 100;
  if (unit === "mm") return n / 10;
  return n;
}

export const BRL = (n: number | null | undefined): string =>
  "R$ " + (Number(n) || 0).toLocaleString("pt-BR");

// ── Telefone / WhatsApp (BR) ─────────────────────────────────────────────────

/** Só os dígitos do telefone, já sem o +55 e limitado a DDD + 9 dígitos. */
export function telefoneDigitos(input: string | null | undefined): string {
  let d = String(input ?? "").replace(/\D/g, "");
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2); // colado com o código do país
  return d.slice(0, 11);
}

/** Máscara progressiva: "43996329538" → "(43) 99632-9538"; fixo → "(43) 3322-1100". */
export function mascaraTelefone(input: string | null | undefined): string {
  const d = telefoneDigitos(input);
  if (!d) return "";
  if (d.length <= 2) return `(${d}`;
  const ddd = d.slice(0, 2), resto = d.slice(2);
  if (resto.length <= 4) return `(${ddd}) ${resto}`;
  const corte = resto.length > 8 ? 5 : 4; // celular (9 dígitos) x fixo (8)
  return `(${ddd}) ${resto.slice(0, corte)}-${resto.slice(corte)}`;
}

/** Telefone completo: DDD válido + 8 (fixo) ou 9 (celular) dígitos. */
export function telefoneCompleto(input: string | null | undefined): boolean {
  const d = telefoneDigitos(input);
  return (d.length === 10 || d.length === 11) && Number(d.slice(0, 2)) >= 11;
}
