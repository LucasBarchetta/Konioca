// POST /sults-export — (cron ou operador, chave de serviço) leva os leads para o Sults.
// Modo "api": envia cada lead novo ao endpoint configurado (formato [A CONFIRMAR] com a documentação do Sults).
// Modo "csv": gera exports/leads-AAAA-MM-DD.csv no bucket privado, com todos os leads (ou só os novos).
import { db, exigirServico } from "../_shared/db.ts";
import { carregarConfig, cfgText, pendente } from "../_shared/config.ts";
import { json, lerJson } from "../_shared/http.ts";
import { formatarWhatsapp } from "../_shared/validacao.ts";

const COLUNAS = [
  "id", "criado_em", "nome", "whatsapp", "email", "cidade", "tem_negocio", "intencao", "origem",
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "turma", "status_funil",
  "nota", "faixa", "circular_enviada_em", "circular_recebida_em", "pagamento_liberado_em", "consentimento_em", "optout_em", "grupo_controle",
];

function csvCampo(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "boolean" ? (v ? "sim" : "não") : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function montarCsv(linhas: Record<string, unknown>[]): string {
  const cab = COLUNAS.join(";");
  const corpo = linhas.map((l) => COLUNAS.map((c) => csvCampo(c === "whatsapp" ? formatarWhatsapp(String(l[c] ?? "")) : l[c])).join(";"));
  return "\ufeff" + [cab, ...corpo].join("\r\n") + "\r\n";
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ erro: "método" }, 405);
  if (!exigirServico(req)) return json({ erro: "não autorizado" }, 401);
  const b = await lerJson<{ modo?: string; somente_novos?: boolean }>(req);
  const { todos } = await carregarConfig();
  const modo = cfgText(todos, "sults_modo", "csv");
  const sb = db();

  let q = sb.from("leads").select(COLUNAS.join(",")).order("criado_em", { ascending: true });
  if (b?.somente_novos ?? modo === "api") q = q.is("sults_sincronizado_em", null);
  const { data: leads, error } = await q;
  if (error) return json({ erro: error.message }, 500);
  const linhas = (leads ?? []) as unknown as Record<string, unknown>[];

  if (modo === "api") {
    const endpoint = cfgText(todos, "sults_endpoint");
    const token = Deno.env.get("SULTS_API_TOKEN") ?? "";
    if (!endpoint || pendente(endpoint) || !token) return json({ erro: "sults_endpoint ou SULTS_API_TOKEN pendentes" }, 422);
    let ok = 0, falhas = 0;
    for (const l of linhas) {
      // Mapeamento [A CONFIRMAR] com a documentação do módulo Expansão do Sults.
      const corpo = {
        nome: l.nome, email: l.email, telefone: l.whatsapp, cidade: l.cidade,
        origem: l.origem, campanha: l.utm_campaign, observacoes: `Pré-venda nova geração · ${l.turma ?? ""} · intenção: ${l.intencao ?? ""}`,
        externo_id: l.id,
      };
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", "authorization": `Bearer ${token}` },
        body: JSON.stringify(corpo),
      });
      if (r.ok) {
        const resp = await r.json().catch(() => ({})) as { id?: string | number };
        await sb.from("leads").update({ sults_sincronizado_em: new Date().toISOString(), sults_id: resp?.id ? String(resp.id) : null }).eq("id", l.id);
        ok++;
      } else {
        falhas++;
        console.error("sults", r.status, await r.text().catch(() => ""));
      }
    }
    return json({ ok: true, modo, enviados: ok, falhas });
  }

  const csv = montarCsv(linhas);
  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }); // AAAA-MM-DD
  const caminho = `leads-${hoje}.csv`;
  const { error: e2 } = await sb.storage.from("exports").upload(caminho, new Blob([csv], { type: "text/csv; charset=utf-8" }), { upsert: true });
  if (e2) return json({ erro: e2.message }, 500);
  if (linhas.length) {
    await sb.from("leads").update({ sults_sincronizado_em: new Date().toISOString() }).is("sults_sincronizado_em", null);
  }
  return json({ ok: true, modo, arquivo: `exports/${caminho}`, linhas: linhas.length });
});
