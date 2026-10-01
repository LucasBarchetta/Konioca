// Planilha em tempo real: cada lead novo vira uma linha na aba "Tempo real" via Apps Script (App da Web).
// Mesmas colunas e mesma ordem da leads-planilha (CABECALHO/linhaPlanilha): nada além do que a planilha já mostra.
// O envio nunca segura o cadastro: a linha entra em planilha_envios e o envio roda em segundo plano; o que falhar
// é retentado pelo planilha-processar. O Google responde 302 depois de gravar: conta como sucesso.
import { CABECALHO, linhaPlanilha, type LeadPlanilha } from "./planilha.ts";

/** Objeto com as chaves em português legível, na ordem da leads-planilha. Puro, testado no Node. */
export function linhaTempoReal(l: LeadPlanilha): Record<string, string> {
  const valores = linhaPlanilha(l);
  const obj: Record<string, string> = {};
  CABECALHO.forEach((k, i) => { obj[k] = valores[i] ?? ""; });
  return obj;
}

/** 2xx e 3xx contam como gravado (o Apps Script redireciona com 302 depois de gravar). */
export function sucessoHttp(status: number): boolean {
  return status >= 200 && status < 400;
}

export function planilhaConfigurada(): boolean {
  return !!Deno.env.get("SHEETS_WEBHOOK_URL") && !!Deno.env.get("SHEETS_WEBHOOK_TOKEN");
}

/** POST {token, lead} sem seguir o redirecionamento. Tempo máximo curto: quem espera é a fila, não o cadastro. */
export async function enviarLinhaPlanilha(lead: Record<string, string>): Promise<{ ok: boolean; status?: number; motivo?: string }> {
  const url = Deno.env.get("SHEETS_WEBHOOK_URL"), token = Deno.env.get("SHEETS_WEBHOOK_TOKEN");
  if (!url || !token) return { ok: false, motivo: "SHEETS_WEBHOOK_URL/SHEETS_WEBHOOK_TOKEN ausentes" };
  try {
    const r = await fetch(url, {
      method: "POST", redirect: "manual", signal: AbortSignal.timeout(10_000),
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, lead }),
    });
    await r.body?.cancel().catch(() => {});
    return sucessoHttp(r.status) ? { ok: true, status: r.status } : { ok: false, status: r.status, motivo: "http " + r.status };
  } catch (e) {
    return { ok: false, motivo: (e as Error).message };
  }
}
