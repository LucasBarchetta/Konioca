// Endereços bloqueados por devolução definitiva ou spam (tabela emails_bloqueados). Nenhum envio sai para eles,
// em qualquer tipo (convite, base antiga, Circular, lembretes, avisos). Desbloqueio só por correção humana do e-mail.
import { db } from "./db.ts";

export async function emailBloqueado(para: string): Promise<{ bloqueado: boolean; motivo?: string; em?: string }> {
  const email = String(para ?? "").trim().toLowerCase();
  if (!email) return { bloqueado: true, motivo: "endereço vazio" };
  const { data } = await db().from("emails_bloqueados").select("motivo, em").eq("email", email).maybeSingle();
  if (!data) return { bloqueado: false };
  return { bloqueado: true, motivo: data.motivo, em: data.em };
}

export function motivoBloqueio(b: { motivo?: string; em?: string }): string {
  return "email_bloqueado: " + (b.motivo ?? "") + (b.em ? " em " + String(b.em).slice(0, 10) : "");
}
