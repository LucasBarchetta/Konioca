// POST /circular-webhook — webhook do Resend para TODOS os e-mails (o nome ficou pela URL já cadastrada no Resend).
// Assinatura Svix obrigatória (RESEND_WEBHOOK_SECRET). Regras de 1/10 (docs/16):
//   entrega/abertura/clique: status da mensagem (e marcos da Circular);
//   devolução definitiva: mensagem "devolvido", endereço bloqueado para qualquer envio, evento no lead;
//   devolução temporária: só registra; na repetição (config.email_devolucao_temporaria_max em 7 dias) bloqueia;
//   spam: encerra tudo, igual ao opt-out (e-mail e WhatsApp), endereço bloqueado, evento no lead; se o e-mail era da base
//   antiga, a trilha pausa na hora (tolerância zero, Lucas 2/10);
//   base antiga: devoluções do dia acima do teto pausam a trilha e avisam os aprovadores;
//   endereço do próprio time (aprovadores e config.email_time_dominios; Lucas, 6/10): devolução definitiva não bloqueia
//   de imediato: registra em email_devolucoes_time e avisa; o cron email-time-retentar testa de novo depois de
//   config.email_devolucao_time_horas; só bloqueia se voltar outra vez (avisando). Entrega no endereço encerra a queda.
import { json } from "../_shared/http.ts";
import { db } from "../_shared/db.ts";
import { verificarSvix } from "../_shared/svix.ts";
import { aplicarEventoCircular } from "../_shared/circular.ts";
import { carregarConfig, cfgBool, cfgNum, cfgText } from "../_shared/config.ts";
import { aprovadores, emailsInternos } from "../_shared/aprovadores.ts";
import { enviarEmail } from "../_shared/email.ts";
import { classificarEvento, decisaoDevolucaoTime, destinatarioDe, enderecoDoTime, temporariaViraBloqueio, type DadosResend } from "../_shared/email_eventos.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ erro: "método" }, 405);
  const segredo = Deno.env.get("RESEND_WEBHOOK_SECRET") ?? "";
  const corpo = await req.text();
  if (!(await verificarSvix(req, corpo, segredo))) return json({ erro: "assinatura inválida" }, 401);

  let ev: { type?: string; created_at?: string; data?: DadosResend };
  try { ev = JSON.parse(corpo); } catch { return json({ erro: "json" }, 400); }
  const id = ev.data?.email_id;
  const tipo = ev.type ?? "";
  if (!id || !tipo) return json({ ok: true, ignorado: true });
  const quando = ev.created_at && !Number.isNaN(Date.parse(ev.created_at)) ? new Date(ev.created_at).toISOString() : new Date().toISOString();

  const sb = db();
  const decisao = classificarEvento(tipo, ev.data);
  // A Circular tem a trilha própria (status, marcos do prazo). O bloqueio e o spam valem para ela também, abaixo.
  const circular = await aplicarEventoCircular(id, tipo, quando, ev.data ?? null);
  const { data: m } = await sb.from("mensagens").select("id, lead_id, modelo").eq("provedor_id", id).maybeSingle();
  if (m && decisao.status) await sb.from("mensagens").update({ status: decisao.status, erro: decisao.acao === "nenhuma" ? null : decisao.motivo }).eq("id", m.id);
  if (m?.lead_id && tipo === "email.clicked") await sb.from("lead_eventos").insert({ lead_id: m.lead_id, tipo: "email_clicado", origem: "lead", dados: { email_id: id } });

  let leadId: string | null = m?.lead_id ?? null;
  if (!leadId && circular) {
    const { data: c } = await sb.from("circular_envios").select("lead_id").eq("provedor_id", id).maybeSingle();
    leadId = c?.lead_id ?? null;
  }
  let email = destinatarioDe(ev.data);
  if (!email && leadId) {
    const { data: l } = await sb.from("leads").select("email").eq("id", leadId).maybeSingle();
    email = String(l?.email ?? "").toLowerCase();
  }
  const modelo = m?.modelo ?? (circular ? "circular" : null);
  const resultado: Record<string, unknown> = { ok: true, tipo, acao: decisao.acao, mensagem: m?.id ?? null, circular, lead: leadId };
  if (decisao.acao === "nenhuma") {
    // Entrega em endereço do time com queda aberta: a caixa voltou, encerra a queda (nada a bloquear).
    if (tipo === "email.delivered" && email) {
      const { todos: cfg0 } = await carregarConfig();
      if (enderecoDoTime(email, emailsInternos(cfg0), dominiosTime(cfg0))) {
        const { data: fechadas } = await sb.from("email_devolucoes_time").update({ resolvido_em: quando }).eq("email", email).is("resolvido_em", null).select("id");
        if (fechadas?.length) resultado.time = { queda_encerrada: fechadas.length };
      }
    }
    return json(resultado);
  }

  const { todos: cfg } = await carregarConfig();
  const dadosEvento = { provedor_id: id, modelo, motivo: decisao.motivo, em: quando, email };

  if (decisao.acao === "registrar_temporaria") {
    if (leadId) await sb.from("lead_eventos").insert({ lead_id: leadId, tipo: decisao.evento, origem: "sistema", dados: dadosEvento });
    // Repetição em 7 dias para o mesmo endereço vira bloqueio.
    const desde = new Date(Date.now() - 7 * 86400_000).toISOString();
    const { count } = await sb.from("lead_eventos").select("id", { count: "exact", head: true })
      .eq("tipo", "email_devolucao_temporaria").eq("dados->>email", email).gt("criado_em", desde);
    const n = count ?? (leadId ? 1 : 0);
    if (email && temporariaViraBloqueio(n, cfgNum(cfg, "email_devolucao_temporaria_max", 2))) {
      await sb.rpc("email_bloquear", { p_email: email, p_motivo: "temporaria_repetida", p_mensagem_id: m?.id ?? null, p_dados: dadosEvento });
      if (leadId) await sb.from("lead_eventos").insert({ lead_id: leadId, tipo: "email_bloqueado", origem: "sistema", dados: { ...dadosEvento, motivo: "devolução temporária repetida (" + n + " em 7 dias)" } });
      resultado.bloqueado = true;
    }
    return json(resultado);
  }

  if (decisao.acao === "bloquear_email") {
    if (leadId) await sb.from("lead_eventos").insert({ lead_id: leadId, tipo: decisao.evento, origem: "sistema", dados: dadosEvento });
    if (email && enderecoDoTime(email, emailsInternos(cfg), dominiosTime(cfg))) {
      resultado.time = await devolucaoDoTime(cfg, email, decisao.motivo, id, m?.id ?? null, quando, dadosEvento);
      resultado.bloqueado = (resultado.time as { decisao: string }).decisao === "bloqueou";
      return json(resultado);
    }
    if (email) await sb.rpc("email_bloquear", { p_email: email, p_motivo: "devolvido", p_mensagem_id: m?.id ?? null, p_dados: dadosEvento });
    resultado.bloqueado = !!email;
    if (modelo === "base_antiga_email") resultado.base_antiga = await verificarBaseAntiga(cfg, email);
    return json(resultado);
  }

  // spam: encerra tudo, igual ao opt-out. O gatilho de opt-out cancela a fila (e-mail e WhatsApp).
  if (email) await sb.rpc("email_bloquear", { p_email: email, p_motivo: "spam", p_mensagem_id: m?.id ?? null, p_dados: dadosEvento });
  if (leadId) {
    await sb.from("leads").update({ optout_em: quando, optout_motivo: "spam", status_funil: "saiu" }).eq("id", leadId).is("optout_em", null);
    await sb.from("lead_eventos").insert({ lead_id: leadId, tipo: decisao.evento, origem: "lead", dados: dadosEvento });
    await sb.from("lead_eventos").insert({ lead_id: leadId, tipo: "optout", origem: "lead", dados: { canal: "email", motivo: "spam", provedor_id: id } });
  }
  resultado.bloqueado = !!email; resultado.saiu = !!leadId;
  // Tolerância zero (Lucas, 2/10): qualquer marcação de spam vinda de e-mail da base antiga pausa a trilha na hora.
  if ((modelo === "base_antiga_email" || modelo === "base_antiga_email2") && !cfgBool(cfg, "base_antiga_pausada", false)) {
    const motivo = `pausada em ${new Date().toISOString()}: marcação de spam em e-mail da base antiga (tolerância zero)`;
    resultado.base_antiga = await pausarBaseAntiga(cfg, motivo, email ? [email] : [], "[Konioca] Base antiga pausada por marcação de spam");
  }
  return json(resultado);
});

/** Domínios do time na config (lista JSON), sem arroba. */
function dominiosTime(cfg: Record<string, unknown>): string[] {
  const v = cfg["email_time_dominios"];
  return Array.isArray(v) ? v.map(String) : [];
}

/** Devolução definitiva de endereço do time (Lucas, 6/10): primeira só registra e avisa; dentro da janela só registra;
 *  depois da janela (o teste de entrega ou qualquer outro e-mail voltou de novo) bloqueia e avisa. */
async function devolucaoDoTime(cfg: Record<string, unknown>, email: string, motivo: string, provedorId: string, mensagemId: number | null, quando: string, dados: Record<string, unknown>): Promise<Record<string, unknown>> {
  const sb = db();
  const horas = cfgNum(cfg, "email_devolucao_time_horas", 6);
  const { data: aberta } = await sb.from("email_devolucoes_time").select("em").eq("email", email).is("resolvido_em", null).order("em", { ascending: true }).limit(1).maybeSingle();
  const d = decisaoDevolucaoTime(aberta?.em ?? null, new Date(quando), horas);
  const decisao = d === "bloquear" ? "bloqueou" : d;
  await sb.from("email_devolucoes_time").insert({ email, em: quando, motivo, provedor_id: provedorId, mensagem_id: mensagemId, decisao });
  const quandoSP = new Date(quando).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  let assunto = ""; let texto: string[] = [];
  if (d === "bloquear") {
    await sb.rpc("email_bloquear", { p_email: email, p_motivo: "devolvido", p_mensagem_id: mensagemId, p_dados: { ...dados, time: true, primeira_em: aberta?.em ?? null } });
    await sb.from("email_devolucoes_time").update({ resolvido_em: quando }).eq("email", email).is("resolvido_em", null);
    await sb.from("alertas").insert({ tipo: "email_time_bloqueado", resumo: `Endereço do time bloqueado por devolução repetida: ${email}` });
    assunto = `[Konioca] Endereço do time bloqueado: ${email}`;
    texto = [
      `O endereço ${email} devolveu outra vez em ${quandoSP} (${motivo}), depois da janela de ${horas} horas da primeira devolução. Agora está bloqueado: nenhum e-mail sai para ele.`, ``,
      `Para liberar: corrigir o endereço nos aprovadores ou pedir aqui o desbloqueio, com o endereço certo.`,
    ];
  } else if (d === "primeira") {
    assunto = `[Konioca] Devolução em endereço do time (sem bloqueio): ${email}`;
    texto = [
      `O endereço ${email} devolveu um e-mail em ${quandoSP} (${motivo}). Por ser endereço do time, não foi bloqueado.`, ``,
      `Daqui a ${horas} horas o sistema manda um teste de entrega. Se voltar outra vez, aí bloqueia e avisa. Se qualquer e-mail for entregue antes, a queda é encerrada sozinha.`, ``,
      `Enquanto isso, o que devolveu não chegou: vale conferir a caixa.`,
    ];
  }
  const avisados: string[] = [];
  if (assunto) {
    const corpo = texto.join("\n");
    const html = `<pre style="font-family:Carlito,Calibri,sans-serif;font-size:15px;white-space:pre-wrap">${corpo.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string))}</pre>`;
    for (const a of aprovadores(cfg).filter((x) => x.papel === "principal")) {
      const r = await enviarEmail(a.email, assunto, corpo, html, "monitor");
      if (r.ok) avisados.push(a.email);
    }
  }
  return { decisao, primeira_em: aberta?.em ?? null, avisados };
}

/** Pausa a trilha da base antiga (config), registra o alerta e avisa o aprovador principal por e-mail. */
async function pausarBaseAntiga(cfg: Record<string, unknown>, motivo: string, enderecos: string[], assunto: string): Promise<Record<string, unknown>> {
  const sb = db();
  await sb.from("config").update({ valor: true }).eq("chave", "base_antiga_pausada");
  await sb.from("config").update({ valor: motivo }).eq("chave", "base_antiga_pausada_motivo");
  await sb.from("alertas").insert({ tipo: "base_antiga_pausada", resumo: "Trilha da base antiga pausada sozinha: " + motivo });
  const texto = [
    `A trilha da base antiga foi pausada sozinha.`, motivo, ``,
    `Endereços envolvidos:`, ...[...new Set(enderecos)].map((e) => "- " + e), ``,
    `Para voltar: config.base_antiga_pausada = false, com o seu sim. Nada sai até lá.`,
  ].join("\n");
  const html = `<pre style="font-family:Carlito,Calibri,sans-serif;font-size:15px;white-space:pre-wrap">${texto.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string))}</pre>`;
  const avisados: string[] = [];
  for (const a of aprovadores(cfg).filter((x) => x.papel === "principal")) {
    const r = await enviarEmail(a.email, assunto, texto, html, "monitor");
    if (r.ok) avisados.push(a.email);
  }
  return { pausou: true, avisados };
}

/** Base antiga: com devoluções do dia acima do teto, pausa a trilha (config) e avisa os aprovadores uma vez. */
async function verificarBaseAntiga(cfg: Record<string, unknown>, emailDevolvido: string): Promise<Record<string, unknown>> {
  const sb = db();
  const { data } = await sb.rpc("base_antiga_devolucoes_dia");
  const dia = (Array.isArray(data) ? data[0] : data) as { enviados: number; devolvidos: number; pct: number; pausar: boolean } | null;
  if (!dia) return { verificado: false };
  if (!dia.pausar || cfgBool(cfg, "base_antiga_pausada", false)) return { ...dia, pausou: false };
  const motivo = `pausada em ${new Date().toISOString()}: ${dia.devolvidos} devoluções em ${dia.enviados} e-mails no dia (${dia.pct}%), teto ${cfgNum(cfg, "base_antiga_devolucao_max_pct", 3)}%`;
  // Endereços devolvidos no dia, para o aviso.
  const hoje = new Date(); hoje.setHours(hoje.getHours() - 27);
  const { data: devolvidos } = await sb.from("mensagens").select("lead_id").in("modelo", ["base_antiga_email", "base_antiga_email2"]).eq("status", "devolvido").gt("criado_em", hoje.toISOString()).limit(200);
  const ids = [...new Set((devolvidos ?? []).map((d) => d.lead_id).filter(Boolean))] as string[];
  const { data: leads } = ids.length ? await sb.from("leads").select("email").in("id", ids) : { data: [] };
  const lista = (leads ?? []).map((l) => l.email as string).concat(emailDevolvido ? [emailDevolvido] : []);
  void cfgText;
  const r = await pausarBaseAntiga(cfg, motivo, lista, "[Konioca] Base antiga pausada por devoluções");
  return { ...dia, ...r };
}
