// Worker da fila (cron a cada minuto). Prioridade por nota. Respeita: opt-out, grupo de controle,
// limite semanal de mensagens iniciadas pela empresa, janela de 24h (template fora dela),
// aquecimento do número (teto por minuto e por dia) e pausa automática se a taxa de falhas subir.
import { db, exigirServico } from "../_shared/db.ts";
import { carregarConfig, cfgNum, cfgText, type Config } from "../_shared/config.ts";
import { json } from "../_shared/http.ts";
import { montarEnvio, type LeadFila } from "../_shared/fila.ts";
import { enviarTemplate, whatsappConfigurado } from "../_shared/whatsapp.ts";
import { enviarEmail } from "../_shared/email.ts";

async function fechar(id: number, status: string, motivo?: string) {
  await db().from("fila_envios").update({ status, motivo: motivo ?? null, processado_em: new Date().toISOString() }).eq("id", id);
}

async function contagemHoje(canal: string): Promise<number> {
  const inicio = new Date(); inicio.setUTCHours(inicio.getUTCHours() - 24);
  const { count } = await db().from("mensagens").select("id", { count: "exact", head: true }).eq("canal", canal).eq("direcao", "out").gt("criado_em", inicio.toISOString());
  return count ?? 0;
}

async function taxaFalhasHora(): Promise<{ total: number; falhas: number }> {
  const desde = new Date(Date.now() - 3600_000).toISOString();
  const sb = db();
  const { count: total } = await sb.from("mensagens").select("id", { count: "exact", head: true }).eq("canal", "whatsapp").eq("direcao", "out").gt("criado_em", desde);
  const { count: falhas } = await sb.from("mensagens").select("id", { count: "exact", head: true }).eq("canal", "whatsapp").eq("direcao", "out").eq("status", "falhou").gt("criado_em", desde);
  return { total: total ?? 0, falhas: falhas ?? 0 };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ erro: "método" }, 405);
  if (!(await exigirServico(req))) return json({ erro: "não autorizado" }, 401);
  const sb = db();
  const { todos: cfg } = await carregarConfig();
  const apiUrl = (Deno.env.get("SUPABASE_URL") ?? "") + "/functions/v1";

  // Pausa por qualidade do número
  const { total, falhas } = await taxaFalhasHora();
  if (total >= 20 && (falhas / total) * 100 > cfgNum(cfg, "wa_pausa_falhas_pct", 15)) {
    const { data: aberto } = await sb.from("alertas").select("id").eq("tipo", "fila_pausada").eq("status", "aberto").maybeSingle();
    if (!aberto) await sb.from("alertas").insert({ tipo: "fila_pausada", resumo: `Fila do WhatsApp pausada: ${falhas} falhas em ${total} envios na última hora. Verificar qualidade do número na Meta.` });
    return json({ ok: true, pausada: true, total, falhas });
  }

  const porMinuto = cfgNum(cfg, "wa_envios_por_minuto", 20);
  const porDia = cfgNum(cfg, "wa_envios_por_dia", 500);
  const hoje = await contagemHoje("whatsapp");
  const limite = Math.max(0, Math.min(porMinuto, porDia - hoje));
  const { data: itens, error } = await sb.rpc("fila_proximos", { p_limite: Math.max(limite, 5) }); // e-mails passam mesmo com o teto do WhatsApp batido
  if (error) return json({ erro: error.message }, 500);

  const isentos = new Set(((cfg["msgs_tipos_isentos"] as string[] | undefined) ?? []));
  const maxSemana = cfgNum(cfg, "msgs_max_semana", 2);
  let enviados = 0, waEnviados = 0; const resultados: Record<string, string> = {};

  for (const item of (itens ?? []) as { id: number; lead_id: string; tipo: string; canal: string; payload: Record<string, unknown> | null; tentativas: number }[]) {
    const { data: lead } = await sb.from("leads").select("id, nome, whatsapp, email, token, turma, pergunta_live, estado_conversa, optout_em, grupo_controle, wa_invalido_em, base_antiga_gancho").eq("id", item.lead_id).single();
    if (!lead || lead.optout_em) { await fechar(item.id, "cancelado", "optout"); continue; }
    if (lead.grupo_controle && item.tipo !== "circular_lembrete") { await fechar(item.id, "pulado", "grupo_controle"); continue; }
    if (item.canal === "whatsapp" && (lead.wa_invalido_em || !lead.whatsapp)) { await fechar(item.id, "pulado", "numero_invalido"); continue; }
    if (!isentos.has(item.tipo)) {
      const { data: n } = await sb.rpc("mensagens_empresa_semana", { p_lead: lead.id });
      if ((n ?? 0) >= maxSemana) { await sb.from("fila_envios").update({ status: "pendente", agendado_para: new Date(Date.now() + 86400_000).toISOString(), motivo: "limite semanal" }).eq("id", item.id); continue; }
    }
    if (item.canal === "whatsapp" && !whatsappConfigurado()) { await sb.from("fila_envios").update({ status: "pendente", tentativas: Math.max(0, item.tentativas - 1), agendado_para: new Date(Date.now() + 600_000).toISOString(), motivo: "WhatsApp ainda não configurado (WABA)" }).eq("id", item.id); continue; }
    if (item.canal === "whatsapp" && waEnviados >= limite) { await sb.from("fila_envios").update({ status: "pendente", motivo: "teto por minuto/dia" }).eq("id", item.id); continue; }

    const envio = montarEnvio(item.tipo, item.canal, lead as LeadFila, cfg as Config, apiUrl);
    if (envio.canal === "nenhum") {
      // Config pendente é bloqueio geral, não falha do item: volta à fila em 10 min sem gastar tentativa.
      // Nada se perde enquanto um humano não preenche a configuração.
      await sb.from("fila_envios").update({ status: "pendente", tentativas: Math.max(0, item.tentativas - 1), agendado_para: new Date(Date.now() + 600_000).toISOString(), motivo: envio.motivo }).eq("id", item.id);
      resultados[item.id] = envio.motivo; continue;
    }

    if (envio.canal === "email") {
      const r = await enviarEmail(lead.email, envio.assunto, envio.texto, envio.html, item.tipo);
      await sb.from("mensagens").insert({ lead_id: lead.id, canal: "email", direcao: "out", tipo: "template", modelo: item.tipo, corpo: envio.texto, provedor_id: r.id ?? null, status: r.ok ? "enviado" : "falhou", erro: r.motivo ?? null, iniciada_pela_empresa: true, fila_id: item.id });
      await fechar(item.id, r.ok ? "enviado" : "falhou", r.motivo);
      if (r.ok) { enviados++; await sb.from("leads").update({ ultima_msg_empresa_em: new Date().toISOString(), ...(item.tipo === "convite" ? { convidado_em: new Date().toISOString(), estado_conversa: "convidado", status_funil: "convidado" } : {}) }).eq("id", lead.id); }
      resultados[item.id] = r.ok ? "email" : (r.motivo ?? "falhou"); continue;
    }

    if (envio.modo === "template") {
      const r = await enviarTemplate(lead.whatsapp!, envio.nome, cfgText(cfg, "wa_idioma", "pt_BR"), envio.params, envio.botaoUrlSufixo);
      await sb.from("mensagens").insert({ lead_id: lead.id, canal: "whatsapp", direcao: "out", tipo: "template", modelo: envio.nome, corpo: envio.params.join(" | "), provedor_id: r.wamid ?? null, status: r.ok ? "enviado" : "falhou", erro: r.erro ?? null, iniciada_pela_empresa: true, fila_id: item.id, bruto: r.ok ? null : { codigo: r.codigo } });
      if (r.ok) {
        enviados++; waEnviados++;
        const upd: Record<string, unknown> = { ultima_msg_empresa_em: new Date().toISOString() };
        if (item.tipo === "convite" || item.tipo === "base_antiga") { upd.convidado_em = new Date().toISOString(); upd.estado_conversa = "convidado"; upd.status_funil = "convidado"; }
        await sb.from("leads").update(upd).eq("id", lead.id);
        await sb.from("lead_eventos").insert({ lead_id: lead.id, tipo: "wa_" + item.tipo, origem: "sistema", dados: { modelo: envio.nome } });
        // Áudio da Marcela não vai junto do template: fora da janela de 24h o WhatsApp recusa. Sai pelo webhook quando a pessoa responde.
        await fechar(item.id, "enviado");
      } else {
        if (r.codigo === 131026) await sb.from("leads").update({ wa_invalido_em: new Date().toISOString() }).eq("id", lead.id);
        const definitivo = r.codigo === 131026 || item.tentativas >= 3;
        if (definitivo) await fechar(item.id, "falhou", r.erro);
        else await sb.from("fila_envios").update({ status: "pendente", agendado_para: new Date(Date.now() + 15 * 60_000).toISOString(), motivo: r.erro }).eq("id", item.id);
      }
      resultados[item.id] = r.ok ? "whatsapp" : (r.erro ?? "falhou");
    } else {
      await fechar(item.id, "pulado", "texto livre só pelo webhook/humano");
    }
  }
  return json({ ok: true, processados: itens?.length ?? 0, enviados, resultados });
});
