// Campo de percentual (honorário). Guarda o texto digitado e só emite número
// válido — digitar "," ou apagar tudo devolve null, nunca NaN.
import { useEffect, useState } from "react";

/** "0,5" · "0.5" · "" → número | null (nunca NaN). */
export function parsePercentual(txt: string): number | null {
  const s = txt.replace(",", ".").replace(/[^\d.]/g, "");
  if (!s || s === ".") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Número → texto do campo ("0.5" → "0,5"; nulo/NaN → ""). */
export function textoPercentual(n: number | null | undefined): string {
  return n == null || !Number.isFinite(Number(n)) ? "" : String(n).replace(".", ",");
}

export default function Percentual({ valor, onChange, placeholder = "0,5", max = 100 }: {
  valor: number | null;
  onChange: (n: number | null) => void;
  placeholder?: string;
  max?: number;
}) {
  const [txt, setTxt] = useState(() => textoPercentual(valor));

  // Sincroniza quando o valor chega de fora (carregamento do cadastro/projeto).
  useEffect(() => {
    setTxt((atual) => (parsePercentual(atual) === valor ? atual : textoPercentual(valor)));
  }, [valor]);

  function digitar(bruto: string) {
    // Só dígitos e um único separador decimal — o campo nunca chega a NaN.
    const limpo = bruto.replace(/[^\d.,]/g, "").replace(/[.,]/, "·").replace(/[.,]/g, "").replace("·", ",");
    const n = parsePercentual(limpo);
    if (n != null && n > max) return; // ignora acima do teto (ex.: 100%)
    setTxt(limpo);
    onChange(n);
  }

  return (
    <div style={{ position: "relative", minWidth: 0 }}>
      <input className="fld" type="text" inputMode="decimal" placeholder={placeholder} value={txt}
        style={{ paddingRight: 32 }}
        onChange={(e) => digitar(e.target.value)}
        onBlur={() => setTxt(textoPercentual(parsePercentual(txt)))} />
      <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", fontSize: 13, pointerEvents: "none" }}>%</span>
    </div>
  );
}
