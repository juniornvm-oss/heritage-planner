// Autenticação (Supabase Auth). A plataforma inteira fica atrás do login;
// o formulário público do síndico é a única rota fora daqui.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { sb } from "./supabase";

type EstadoAuth = { carregando: boolean; sessao: Session | null };

const AuthCtx = createContext<EstadoAuth>({ carregando: true, sessao: null });

/** Provê a sessão atual para todo o app e mantém em dia (login/logout/refresh). */
export function AuthProvider({ children }: { children: ReactNode }) {
  // Sem Supabase (modo local): não há login — considera "carregado, sem sessão".
  const [estado, setEstado] = useState<EstadoAuth>({ carregando: !!sb, sessao: null });

  useEffect(() => {
    if (!sb) { setEstado({ carregando: false, sessao: null }); return; }
    let vivo = true;
    sb.auth.getSession().then(({ data }) => {
      if (vivo) setEstado({ carregando: false, sessao: data.session });
    });
    const { data: sub } = sb.auth.onAuthStateChange((_evento, sessao) => {
      setEstado({ carregando: false, sessao });
    });
    return () => { vivo = false; sub.subscription.unsubscribe(); };
  }, []);

  return <AuthCtx.Provider value={estado}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);

/** Entra com e-mail + senha. Lança erro (mensagem já em pt) se falhar. */
export async function entrar(email: string, senha: string): Promise<void> {
  if (!sb) throw new Error("Supabase não configurado.");
  const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password: senha });
  if (error) {
    if (/invalid login credentials/i.test(error.message)) throw new Error("E-mail ou senha incorretos.");
    if (/email not confirmed/i.test(error.message)) throw new Error("E-mail ainda não confirmado.");
    throw new Error(error.message);
  }
}

/** Sai da conta. A troca de sessão redireciona para a tela de login. */
export async function sair(): Promise<void> {
  if (sb) await sb.auth.signOut();
}
