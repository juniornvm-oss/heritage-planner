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
