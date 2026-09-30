// Envio da Circular de Oferta de Franquia por e-mail (Resend) e registro do envio.
import { db } from "./db.ts";
import { carregarConfig, cfgNum, cfgText, pendente } from "./config.ts";
import { limiteRecebimentoCircular, partesData, textoHaQuanto } from "./datas.ts";

interface LeadMin { id: string; nome: string; email: string; token: string; optout_em: string | null; circular_enviada_em: string | null }

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}

function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? "";
}

function bytesToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

/** Monta assunto, texto e HTML do e-mail. Exportado para teste e para pré-visualização. */
export function montarEmailCircular(opts: {
  nome: string; token: string; lpUrl: string; apiUrl: string; prevendaFimIso: string; prazoDias: number;
  liveIso: string; livePlataforma: string; grupoLink: string; assinatura: string; anexoNome: string | null;
}) {
  const limite = limiteRecebimentoCircular(opts.prevendaFimIso, opts.prazoDias);
  const lim = partesData(limite.toISOString());
  const fim = partesData(opts.prevendaFimIso);
  const live = partesData(opts.liveIso);
  const confirmar = `${opts.apiUrl}/circular-confirmar?t=${encodeURIComponent(opts.token)}`;
  const sair = `${opts.apiUrl}/optout?t=${encodeURIComponent(opts.token)}`;
  const nome = primeiroNome(opts.nome);

  const anexoLinha = opts.anexoNome
    ? `A Circular de Oferta de Franquia da Konioca está em anexo (${opts.anexoNome}).`
    : `A Circular de Oferta de Franquia da Konioca chega em um segundo e-mail, assim que o arquivo for liberado.`;

  const texto = [
    `${nome}, seu nome está na lista da pré-venda.`,
    ``,
    anexoLinha,
    `É o documento que a lei pede que você tenha em mãos antes de qualquer pagamento. Leia com calma.`,
    ``,
    `Um detalhe de calendário: a lei dá ${opts.prazoDias} dias entre o recebimento da Circular e qualquer pagamento, e o prazo começa a contar quando você confirma o recebimento no link abaixo. A pré-venda fecha em ${fim.ddmm}, às ${fim.hora}. Quem confirma até ${lim.ddmm} consegue reservar dentro do prazo.`,
    ``,
    `Confirmo que recebi a Circular: ${confirmar}`,
    ``,
    `A live é ${live.diaSemana}, ${live.ddmm}, às ${live.hora}, pelo ${opts.livePlataforma}. O link chega pelo grupo da pré-venda: ${opts.grupoLink}`,
    ``,
    opts.assinatura,
    ``,
    `Para não receber mais mensagens da pré-venda: ${sair}`,
  ].join("\n");

  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f4ebdb;font-family:Carlito,Calibri,'Segoe UI',sans-serif;color:#1f4a36">
<div style="max-width:560px;margin:0 auto;padding:32px 24px">
<div style="font-size:12px;font-weight:700;letter-spacing:.25em;color:#1f4a36">PRÉ-VENDA · NOVA GERAÇÃO</div>
<h1 style="margin:14px 0 0;font-family:Caladea,Cambria,Georgia,serif;font-weight:400;font-size:30px;line-height:1.1;color:#1f4a36">${esc(nome)}, seu nome está na lista.</h1>
<div style="width:120px;height:1px;background:#c9a227;margin:16px 0 20px 6px"></div>
<p style="margin:0 0 14px;font-size:17px;line-height:1.6">${esc(anexoLinha)} É o documento que a lei pede que você tenha em mãos antes de qualquer pagamento. Leia com calma.</p>
<p style="margin:0 0 20px;font-size:17px;line-height:1.6">Um detalhe de calendário: a lei dá ${opts.prazoDias} dias entre o recebimento da Circular e qualquer pagamento, e o prazo começa a contar quando você confirma o recebimento no botão abaixo. A pré-venda fecha em ${fim.ddmm}, às ${fim.hora}. Quem confirma até <strong>${lim.ddmm}</strong> consegue reservar dentro do prazo.</p>
<a href="${esc(confirmar)}" style="display:block;text-align:center;padding:16px;background:#b04d0c;color:#f7f0e2;font-size:18px;font-weight:700;text-decoration:none;border-radius:7px">Confirmo que recebi a Circular</a>
<p style="margin:24px 0 0;font-size:16px;line-height:1.6">A live é ${live.diaSemana}, ${live.ddmm}, às ${live.hora}, pelo ${esc(opts.livePlataforma)}. O link chega pelo <a href="${esc(opts.grupoLink)}" style="color:#1f4a36">grupo da pré-venda</a>.</p>
<p style="margin:24px 0 0;font-family:Caladea,Cambria,Georgia,serif;font-style:italic;font-size:18px;color:#5a6b3a">${esc(opts.assinatura)}</p>
<p style="margin:32px 0 0;font-size:12px;line-height:1.5;color:#5a6b3a">Você recebe este e-mail porque se cadastrou na pré-venda da Konioca em <a href="${esc(opts.lpUrl)}" style="color:#5a6b3a">${esc(opts.lpUrl)}</a>. <a href="${esc(sair)}" style="color:#5a6b3a">Não quero mais receber mensagens da pré-venda</a>.</p>
</div></body></html>`;

  return { texto, html, limiteRecebimento: limite };
}

/** Envia a Circular para um lead e registra. Idempotente por padrão (não reenvia se já enviada). */
export async function enviarCircular(leadId: string, opts: { forcar?: boolean } = {}): Promise<{ ok: boolean; motivo?: string; envioId?: string }> {
  const sb = db();
  const { data: lead, error } = await sb.from("leads")
    .select("id, nome, email, token, optout_em, circular_enviada_em").eq("id", leadId).single<LeadMin>();
  if (error || !lead) return { ok: false, motivo: "lead não encontrado" };
  if (lead.optout_em) return { ok: false, motivo: "lead saiu" };
  if (lead.circular_enviada_em && !opts.forcar) return { ok: true, motivo: "já enviada" };

  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return { ok: false, motivo: "RESEND_API_KEY ausente" };

  const { todos } = await carregarConfig();
  const from = cfgText(todos, "email_from");
  if (!from || pendente(from)) return { ok: false, motivo: "config.email_from pendente" };
  const replyTo = cfgText(todos, "email_reply_to");
  const apiUrl = (Deno.env.get("SUPABASE_URL") ?? "") + "/functions/v1";

  // Anexo: PDF no bucket privado. Sem PDF, o e-mail vai sem anexo e o envio NÃO conta como Circular enviada.
  let anexo: { filename: string; content: string } | null = null;
  const caminho = cfgText(todos, "circular_storage_path");
  if (caminho && !pendente(caminho)) {
    const [bucket, ...resto] = caminho.split("/");
    const { data: arquivo, error: e2 } = await sb.storage.from(bucket).download(resto.join("/"));
    if (!e2 && arquivo) {
      anexo = { filename: resto[resto.length - 1], content: bytesToBase64(await arquivo.arrayBuffer()) };
    }
  }
  if (!anexo) return { ok: false, motivo: "PDF da Circular não disponível em " + caminho };

  const email = montarEmailCircular({
    nome: lead.nome,
    token: lead.token,
    lpUrl: cfgText(todos, "lp_url"),
    apiUrl,
    prevendaFimIso: cfgText(todos, "prevenda_fim"),
    prazoDias: cfgNum(todos, "circular_prazo_dias", 10),
    liveIso: cfgText(todos, "live_data"),
    livePlataforma: cfgText(todos, "live_plataforma", "Google Meet"),
    grupoLink: cfgText(todos, "whatsapp_grupo_link"),
    assinatura: cfgText(todos, "assinatura_time", "Time da Marcela"),
    anexoNome: anexo.filename,
  });

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "authorization": `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      from,
      to: [lead.email],
      reply_to: replyTo && !pendente(replyTo) ? replyTo : undefined,
      subject: cfgText(todos, "circular_assunto", "Sua Circular de Oferta de Franquia Konioca"),
      text: email.texto,
      html: email.html,
      attachments: [anexo],
      tags: [{ name: "tipo", value: "circular" }],
    }),
  });
  const corpo = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    await sb.from("circular_envios").insert({ lead_id: lead.id, email: lead.email, arquivo: anexo.filename, status: "falhou", erro: JSON.stringify(corpo).slice(0, 500) });
    return { ok: false, motivo: "resend " + resp.status };
  }

  const { data: envio } = await sb.from("circular_envios")
    .insert({ lead_id: lead.id, email: lead.email, arquivo: anexo.filename, provedor_id: corpo.id ?? null, status: "enviado" })
    .select("id").single();
  await sb.from("leads").update({
    circular_enviada_em: new Date().toISOString(),
    status_funil: "circular_enviada",
  }).eq("id", lead.id).in("status_funil", ["cadastrado"]);
  await sb.from("leads").update({ circular_enviada_em: new Date().toISOString() }).eq("id", lead.id).is("circular_enviada_em", null);
  await sb.from("lead_eventos").insert({ lead_id: lead.id, tipo: "circular_enviada", origem: "sistema", dados: { provedor_id: corpo.id ?? null } });
  return { ok: true, envioId: envio?.id };
}

/** Aplica um evento do provedor (delivered/opened/clicked/bounced) ao envio e ao lead. */
export async function aplicarEventoCircular(provedorId: string, tipo: string, quandoIso: string, bruto: unknown): Promise<boolean> {
  const sb = db();
  const { data: envio } = await sb.from("circular_envios").select("id, lead_id, status, eventos").eq("provedor_id", provedorId).maybeSingle();
  if (!envio) return false;

  const mapa: Record<string, { status: string; coluna: string; marco: string | null }> = {
    "email.delivered": { status: "entregue", coluna: "entregue_em", marco: "entrega" },
    "email.opened":    { status: "aberto",   coluna: "aberto_em",   marco: "abertura" },
    "email.clicked":   { status: "clicado",  coluna: "clicado_em",  marco: "clique" },
    "email.bounced":   { status: "devolvido", coluna: "devolvido_em", marco: null },
    "email.complained": { status: "devolvido", coluna: "devolvido_em", marco: null },
  };
  const m = mapa[tipo];
  if (!m) return false;

  const ordem = ["enviado", "entregue", "aberto", "clicado"];
  const novoStatus = m.status === "devolvido" ? "devolvido" : (ordem.indexOf(m.status) > ordem.indexOf(envio.status) ? m.status : envio.status);
  const eventos = Array.isArray(envio.eventos) ? envio.eventos : [];
  eventos.push({ tipo, em: quandoIso, bruto });
  await sb.from("circular_envios").update({ status: novoStatus, [m.coluna]: quandoIso, eventos }).eq("id", envio.id);
  await sb.from("lead_eventos").insert({ lead_id: envio.lead_id, tipo: "circular_" + m.status, origem: "sistema", dados: { provedor_id: provedorId } });
  if (m.marco) await sb.rpc("circular_marca_recebimento", { p_lead: envio.lead_id, p_evento: m.marco, p_quando: quandoIso });
  return true;
}

/** E-mail de lembrete para quem não confirmou o recebimento. Curto, um pedido só. */
export function montarEmailLembrete(opts: { nome: string; token: string; apiUrl: string; prevendaFimIso: string; prazoDias: number; assinatura: string; horas?: number }) {
  const ha = textoHaQuanto(opts.horas ?? 48);
  const confirmar = `${opts.apiUrl}/circular-confirmar?t=${encodeURIComponent(opts.token)}`;
  const sair = `${opts.apiUrl}/optout?t=${encodeURIComponent(opts.token)}`;
  const lim = partesData(limiteRecebimentoCircular(opts.prevendaFimIso, opts.prazoDias).toISOString());
  const nome = primeiroNome(opts.nome);
  const texto = [
    `${nome}, a Circular de Oferta de Franquia chegou no seu e-mail ${ha} e ainda falta um clique.`,
    ``,
    `O prazo de ${opts.prazoDias} dias que a lei pede só começa a contar quando você confirma o recebimento. Sem isso, a reserva não abre para você.`,
    ``,
    `Confirmo que recebi a Circular: ${confirmar}`,
    ``,
    `Quem confirma até ${lim.ddmm} ainda reserva dentro da pré-venda.`,
    ``,
    opts.assinatura,
    ``,
    `Para não receber mais mensagens da pré-venda: ${sair}`,
  ].join("\n");
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f4ebdb;font-family:Carlito,Calibri,'Segoe UI',sans-serif;color:#1f4a36">
<div style="max-width:560px;margin:0 auto;padding:32px 24px">
<h1 style="margin:0;font-family:Caladea,Cambria,Georgia,serif;font-weight:400;font-size:28px;line-height:1.1">${esc(nome)}, falta um clique.</h1>
<div style="width:120px;height:1px;background:#c9a227;margin:16px 0 20px 6px"></div>
<p style="margin:0 0 14px;font-size:17px;line-height:1.6">A Circular de Oferta de Franquia chegou no seu e-mail ${ha}. O prazo de ${opts.prazoDias} dias que a lei pede só começa a contar quando você confirma o recebimento. Sem isso, a reserva não abre para você.</p>
<a href="${esc(confirmar)}" style="display:block;text-align:center;padding:16px;background:#b04d0c;color:#f7f0e2;font-size:18px;font-weight:700;text-decoration:none;border-radius:7px">Confirmo que recebi a Circular</a>
<p style="margin:20px 0 0;font-size:16px;line-height:1.6">Quem confirma até <strong>${lim.ddmm}</strong> ainda reserva dentro da pré-venda.</p>
<p style="margin:24px 0 0;font-family:Caladea,Cambria,Georgia,serif;font-style:italic;font-size:18px;color:#5a6b3a">${esc(opts.assinatura)}</p>
<p style="margin:32px 0 0;font-size:12px;line-height:1.5;color:#5a6b3a"><a href="${esc(sair)}" style="color:#5a6b3a">Não quero mais receber mensagens da pré-venda</a>.</p>
</div></body></html>`;
  return { texto, html };
}

/** Envia o lembrete de confirmação para um lead. Um só por lead. */
export async function enviarLembreteCircular(lead: { id: string; nome: string; email: string; token: string }): Promise<{ ok: boolean; motivo?: string }> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return { ok: false, motivo: "RESEND_API_KEY ausente" };
  const { todos } = await carregarConfig();
  const from = cfgText(todos, "email_from");
  if (!from || pendente(from)) return { ok: false, motivo: "config.email_from pendente" };
  const apiUrl = (Deno.env.get("SUPABASE_URL") ?? "") + "/functions/v1";
  const email = montarEmailLembrete({
    nome: lead.nome, token: lead.token, apiUrl,
    prevendaFimIso: cfgText(todos, "prevenda_fim"), prazoDias: cfgNum(todos, "circular_prazo_dias", 10),
    assinatura: cfgText(todos, "assinatura_time", "Time da Marcela"), horas: cfgNum(todos, "circular_lembrete_horas", 48),
  });
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "authorization": `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ from, to: [lead.email], subject: cfgText(todos, "circular_lembrete_assunto", "Falta um clique: sua Circular de Oferta de Franquia"), text: email.texto, html: email.html, tags: [{ name: "tipo", value: "circular_lembrete" }] }),
  });
  if (!resp.ok) return { ok: false, motivo: "resend " + resp.status };
  const sb = db();
  await sb.from("leads").update({ circular_lembrete_em: new Date().toISOString() }).eq("id", lead.id);
  await sb.from("lead_eventos").insert({ lead_id: lead.id, tipo: "circular_lembrete", origem: "sistema", dados: { canal: "email" } });
  return { ok: true };
}
