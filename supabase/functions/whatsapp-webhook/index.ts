// Webhook da WhatsApp Cloud API.
// GET: verificação do endpoint (hub.challenge). POST: mensagens e status, com assinatura X-Hub-Signature-256.
// Conversa mínima da etapa 2: resposta ao convite, pergunta "o que você imagina fazer", "Sair", passagem ao humano.
import { db } from "../_shared/db.ts";
import { carregarConfig, cfgBool, cfgNum, cfgText, pendente } from "../_shared/config.ts";
import { json } from "../_shared/http.ts";
import { parseWebhook, verificarAssinaturaMeta, enviarTexto, enviarAudio, marcarLida } from "../_shared/whatsapp.ts";
import { classificarResposta, proximoPasso, situacaoHorario, textoPassagemHumano, primeiroNome, type Estado, type HorarioComercial } from "../_shared/conversa.ts";
import { enviarEmail } from "../_shared/email.ts";

const STATUS_MAPA: Record<string, string> = { sent: "enviado", delivered: "entregue", read: "lido", failed: "falhou" };

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === "GET") {
    const modo = url.searchParams.get("hub.mode"), token = url.searchParams.get("hub.verify_token"), challenge = url.searchParams.get("hub.challenge");
    if (modo === "subscribe" && token && token === Deno.env.get("WHATSAPP_VERIFY_TOKEN")) return new Response(challenge ?? "", { status: 200 });
    return new Response("forbidden", { status: 403 });
  }
  if (req.method !== "POST") return json({ erro: "método" }, 405);
  const corpo = await req.text();
  if (!(await verificarAssinaturaMeta(req, corpo))) return json({ erro: "assinatura inválida" }, 401);
  let payload: unknown;
  try { payload = JSON.parse(corpo); } catch { return json({ erro: "json" }, 400); }

  const sb = db();
  const { todos } = await carregarConfig();
  const { mensagens, status } = parseWebhook(payload);

  // Status de envios: entregue / lido / falhou (qualidade do número)
  for (const s of status) {
    const novo = STATUS_MAPA[s.status];
    if (!novo || !s.wamid) continue;
    const { data: m } = await sb.from("mensagens").select("id, lead_id, status").eq("provedor_id", s.wamid).maybeSingle();
    if (!m) continue;
    const ordem = ["enviado", "entregue", "lido"];
    const aplicar = novo === "falhou" || ordem.indexOf(novo) > ordem.indexOf(m.status);
    if (aplicar) await sb.from("mensagens").update({ status: novo, erro: s.erro }).eq("id", m.id);
    if (novo === "falhou" && m.lead_id) {
      await sb.from("lead_eventos").insert({ lead_id: m.lead_id, tipo: "wa_falhou", origem: "sistema", dados: { codigo: s.codigo, erro: s.erro } });
      // 131026 = número não está no WhatsApp; 131047 = fora da janela; 131048/131049/131056 = limites/qualidade
      if (s.codigo === 131026) await sb.from("leads").update({ wa_invalido_em: s.quando }).eq("id", m.lead_id);
    }
    if (novo === "lido" && m.lead_id) await sb.from("lead_eventos").insert({ lead_id: m.lead_id, tipo: "wa_lido", origem: "lead" });
  }

  // Mensagens recebidas
  for (const m of mensagens) {
    if (!m.wamid) continue;
    const { data: ja } = await sb.from("mensagens").select("id").eq("provedor_id", m.wamid).maybeSingle();
    if (ja) continue; // reentrega da Meta
    const lead = m.e164 ? (await sb.from("leads").select("id, nome, estado_conversa, optout_em, grupo_controle, pergunta_live").eq("whatsapp", m.e164).maybeSingle()).data : null;
    await sb.from("mensagens").insert({
      lead_id: lead?.id ?? null, canal: "whatsapp", direcao: "in", tipo: m.tipo, modelo: m.botaoId, corpo: m.texto || `[${m.tipo}]`,
      provedor_id: m.wamid, status: "recebido", bruto: m.bruto, criado_em: m.quando,
    });
    if (!lead) {
      // Número desconhecido: registra e alerta; não responde automaticamente.
      await sb.from("alertas").insert({ tipo: "humano_necessario", resumo: `Mensagem de número fora da lista (${m.de}): ${m.texto.slice(0, 120)}`, cartao: { de: m.de, nome: m.nome, texto: m.texto } });
      continue;
    }
    await marcarLida(m.wamid);
    await sb.from("leads").update({ ultima_msg_lead_em: m.quando }).eq("id", lead.id);
    await sb.from("lead_eventos").insert({ lead_id: lead.id, tipo: "wa_respondeu", origem: "lead", dados: { texto: m.texto.slice(0, 200), botao: m.botaoId } });
    if (lead.optout_em) continue; // saiu: silêncio, salvo pedido explícito de voltar (humano)

    const classe = classificarResposta(m.texto, m.botaoId);
    const passo = proximoPasso(lead.estado_conversa as Estado, classe, m.texto, primeiroNome(lead.nome));
    const upd: Record<string, unknown> = { estado_conversa: passo.novoEstado };
    if (passo.presenca === true) { upd.presenca_confirmada_em = m.quando; upd.status_funil = "confirmou_presenca"; }
    if (passo.registrarPergunta && m.texto.trim()) {
      upd.pergunta_live = m.texto.trim().slice(0, 500);
      if (!lead.pergunta_live) {
        const { data: l2 } = await sb.from("leads").select("cidade, turma").eq("id", lead.id).single();
        await sb.from("perguntas_live").upsert({ lead_id: lead.id, turma: l2?.turma ?? null, texto: m.texto.trim().slice(0, 500), nome: lead.nome, cidade: l2?.cidade ?? null }, { onConflict: "lead_id" });
      }
    }
    if (passo.statusFunil) upd.status_funil = passo.statusFunil;
    if (classe === "sair") { upd.optout_em = m.quando; upd.optout_motivo = "whatsapp_sair"; upd.status_funil = "saiu"; }

    let resposta = passo.resposta;
    if (passo.humano) {
      const hc = (todos["horario_comercial"] as HorarioComercial | undefined) ?? { dias: [1, 2, 3, 4, 5], inicio: "09:00", fim: "18:00", fuso: "America/Sao_Paulo" };
      const sit = situacaoHorario(hc, new Date());
      resposta = textoPassagemHumano(sit.aberto, sit.retomaTexto, cfgNum(todos, "humano_meta_min", 15));
      upd.humano_pendente_em = m.quando;
      const { data: cartao } = await sb.rpc("lead_cartao", { p_lead: lead.id });
      await sb.from("alertas").insert({ lead_id: lead.id, tipo: "humano_necessario", resumo: `${lead.nome}: ${m.texto.slice(0, 140)}`, cartao });
      const alertaEmail = cfgText(todos, "alerta_email");
      if (alertaEmail && !pendente(alertaEmail)) {
        const c = cartao as Record<string, unknown> | null;
        const linhas = [`Lead: ${lead.nome} · ${c?.cidade ?? ""} · ${c?.whatsapp ?? ""}`, `Negócio: ${c?.tem_negocio === true ? "tem ponto" : c?.tem_negocio === false ? "quer começar" : "não informado"} · Nota ${c?.nota ?? 0} (${c?.faixa ?? ""})`, `Intenção: ${c?.intencao ?? ""} · Pergunta: ${c?.pergunta_live ?? ""}`, ``, `Mensagem: ${m.texto}`, ``, sit.aberto ? `Meta: responder em ${cfgNum(todos, "humano_meta_min", 15)} min.` : `Fora do horário: o lead foi avisado que o time retoma ${sit.retomaTexto}.`];
        enviarEmail(alertaEmail, `[Konioca] ${lead.nome} precisa de você`, linhas.join("\n"), `<pre style="font-family:Carlito,Calibri,sans-serif;font-size:15px;white-space:pre-wrap">${linhas.map((l) => l.replace(/[&<>]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[ch] as string))).join("\n")}</pre>`, "alerta").catch((e) => console.error("alerta", e));
      }
    }
    await sb.from("leads").update(upd).eq("id", lead.id);

    // Chave mestra: com envios_ativos = false, o estado é registrado mas nenhuma resposta sai.
    if (resposta && cfgBool(todos, "envios_ativos", false)) {
      const r = await enviarTexto((await sb.from("leads").select("whatsapp").eq("id", lead.id).single()).data!.whatsapp, resposta);
      await sb.from("mensagens").insert({ lead_id: lead.id, canal: "whatsapp", direcao: "out", tipo: "texto", corpo: resposta, provedor_id: r.wamid ?? null, status: r.ok ? "enviado" : "falhou", erro: r.erro ?? null, iniciada_pela_empresa: false });
      if (r.ok) await sb.from("leads").update({ ultima_msg_empresa_em: new Date().toISOString() }).eq("id", lead.id);
      // Áudio da Marcela: só dentro da janela de 24h (o lead acabou de responder) e só na primeira resposta ao convite.
      const audios = (todos["wa_audios"] as Record<string, string> | undefined) ?? {};
      if (r.ok && audios["convite"] && lead.estado_conversa === "convidado" && passo.novoEstado === "aguardando_intencao") {
        const { data: l3 } = await sb.from("leads").select("whatsapp").eq("id", lead.id).single();
        const a = await enviarAudio(l3!.whatsapp, audios["convite"]);
        await sb.from("mensagens").insert({ lead_id: lead.id, canal: "whatsapp", direcao: "out", tipo: "audio", modelo: "convite", corpo: "[áudio da Marcela]", provedor_id: a.wamid ?? null, status: a.ok ? "enviado" : "falhou", erro: a.erro ?? null, iniciada_pela_empresa: false });
      }
    }
  }
  return json({ ok: true, mensagens: mensagens.length, status: status.length });
});
