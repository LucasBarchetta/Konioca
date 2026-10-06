// POST /secretaria-marcela — (interno, chave de serviço; cron a cada 5 min) secretária automática da Marcela por e-mail
// (pedido do Lucas, 6/10): agenda da semana (segunda 9h), convite .ics quando a turma ganha link do Meet, lembrete da
// véspera (10h) com a lista de inscritos, 2 horas antes (link e roteiro), 15 minutos antes, pedido de presença e reservas
// depois, e alerta de turma sem inscritos na véspera (para ela e para o Lucas). Regras puras em _shared/secretaria.ts.
// Corpo: { agenda_agora?: true } força a agenda da semana; { simular?: true } lista o que sairia sem mandar nada.
// Quem é a Marcela e quem é o Lucas vem de config.painel_aprovadores (papéis conteudo e principal). Nada fixo no código.
// Um registro por envio em secretaria_envios (chave única): nada repete. Tag "painel": sai pela exceção interna.
import { db, exigirServico } from "../_shared/db.ts";
import { carregarConfig, cfgBool, cfgText, pendente } from "../_shared/config.ts";
import { json, lerJson } from "../_shared/http.ts";
import { aprovadores, emailsDe } from "../_shared/aprovadores.ts";
import { enviarEmail } from "../_shared/email.ts";
import { base64Utf8, icsEvento } from "../_shared/ics.ts";
import { type EncontroSec, type InscritoSec, type MensagemSec, pendenciasSecretaria, textoAgenda, textoAlertaZero, textoDia15, textoDia2h, textoIcs, textoPos, textoVespera } from "../_shared/secretaria.ts";

const ROTEIRO_PADRAO = `0 a 3 min · Abertura: encontro fechado, só quem está na lista; 30 minutos; o que mudou, a conta da operação e as condições.
3 a 12 min · O que mudou na máquina: a atual e por que refizemos; a nova geração em uso (abastecer, assar, limpar); uma pessoa opera. Sem prazo de entrega fora da Circular.
12 a 18 min · A conta da operação: o que vem na máquina, o que a pessoa precisa ter no ponto, custo por cone, energia, manutenção. Nenhuma projeção de faturamento ("depende do ponto; a gente mostra o custo e você faz a sua conta").
18 a 24 min · Condições da pré-venda: 250 máquinas, só para quem está na lista; pré-reserva de R$ 1.000 no PIX; financiamento pela parceria; fecha em 30/10 às 23h59 (conferir na config no dia).
A fala da Circular: "Quem já confirmou que recebeu a Circular de Oferta de Franquia há dez dias pode reservar agora, no fim deste encontro. Quem se cadastrou agora recebe a Circular por e-mail e a reserva abre dez dias depois de confirmar o recebimento. É a lei, e a gente cumpre."
24 a 29 min · Perguntas, em ordem de chat. O que não couber: "o time responde por e-mail ou WhatsApp até amanhã".
29 a 30 min · Fechamento: quem já pode reservar, o time chama no WhatsApp ou responde o e-mail de hoje com "quero reservar"; quem ainda não pode, confirma a Circular e em dez dias a reserva abre.`;

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ erro: "método" }, 405);
  if (!(await exigirServico(req))) return json({ erro: "não autorizado" }, 401);
  const b = (await lerJson<{ agenda_agora?: boolean; simular?: boolean }>(req)) ?? {};
  const { todos: cfg } = await carregarConfig();
  if (!cfgBool(cfg, "secretaria_ativa", true)) return json({ ok: true, pausada: "config.secretaria_ativa = false", envios: 0 });
  const lista = aprovadores(cfg);
  const marcela = lista.find((a) => a.papel === "conteudo");
  const lucas = lista.find((a) => a.papel === "principal");
  if (!marcela) return json({ erro: "sem aprovador de conteúdo (Marcela) em painel_aprovadores" }, 400);
  const sb = db();
  const { data: enc, error } = await sb.from("v_encontros").select("id, inicio, duracao_min, capacidade, meet_link, ativo, inscritos");
  if (error) return json({ erro: error.message }, 500);
  const encontros = (enc ?? []) as EncontroSec[];
  const { data: feitas } = await sb.from("secretaria_envios").select("chave");
  const ja = new Set((feitas ?? []).map((f) => String(f.chave)));
  const agora = new Date();
  const pend = pendenciasSecretaria(agora, encontros, ja, { agendaAgora: b.agenda_agora === true });
  if (b.simular) return json({ ok: true, simulacao: true, pendencias: pend.map((p) => ({ tipo: p.tipo, chave: p.chave, encontro: p.encontro?.id ?? null })) });

  const nome = marcela.nome.split(" ")[0];
  const roteiro = (() => { const r = cfgText(cfg, "secretaria_roteiro"); return r && !pendente(r) ? r : ROTEIRO_PADRAO; })();
  const apiUrl = (Deno.env.get("SUPABASE_URL") ?? "") + "/functions/v1";
  const chave = req.headers.get("authorization") ?? "";
  let painelUrl: string | null = null;
  const linkPainel = async () => {
    if (painelUrl) return painelUrl;
    const r0 = await fetch(`${apiUrl}/painel-api`, { method: "POST", headers: { "content-type": "application/json", authorization: chave }, body: JSON.stringify({ acao: "link", email: marcela.email }) });
    const l = (await r0.json().catch(() => ({}))) as { url?: string };
    painelUrl = l.url ?? cfgText(cfg, "painel_url", "https://prevenda.konioca.com/painel/");
    return painelUrl;
  };

  const resultados: Record<string, string> = {};
  for (const p of pend) {
    let msg: MensagemSec; let anexos: { filename: string; content: string }[] | undefined; let destinos = [marcela];
    const e = p.encontro;
    if (p.tipo === "agenda") msg = textoAgenda(nome, agora, encontros);
    else if (!e) continue;
    else if (p.tipo === "ics") {
      msg = textoIcs(nome, e);
      anexos = [{ filename: "encontro-konioca.ics", content: base64Utf8(icsEvento({ uid: `encontro-${e.id}-marcela@konioca`, inicio: new Date(e.inicio), duracaoMin: e.duracao_min || 30, titulo: "Konioca · turma da pré-venda (Google Meet)", descricao: `Encontro fechado com a lista da pré-venda. Link: ${e.meet_link}`, url: e.meet_link ?? undefined, local: "Google Meet", alarmeMin: 120 })) }];
    } else if (p.tipo === "vespera") {
      const { data: ins } = await sb.from("leads").select("nome, cidade, tem_negocio").eq("encontro_id", e.id).is("optout_em", null).order("nome");
      msg = textoVespera(nome, e, (ins ?? []) as InscritoSec[]);
    } else if (p.tipo === "alerta_zero") { msg = textoAlertaZero(nome, e); if (lucas) destinos = [marcela, lucas]; }
    else if (p.tipo === "dia_2h") msg = textoDia2h(nome, e, roteiro);
    else if (p.tipo === "dia_15min") msg = textoDia15(nome, e);
    else msg = textoPos(nome, e, await linkPainel());

    const para: Record<string, string> = {};
    for (const a of destinos) {
      // O alerta vai ao Lucas com o nome dele na abertura; o resto é só da Marcela.
      const texto = a === marcela ? msg.texto : msg.texto.replace(new RegExp("^" + nome + ","), a.nome.split(" ")[0] + ",");
      const html = a === marcela ? msg.html : msg.html.replace(">" + nome + ",", ">" + a.nome.split(" ")[0] + ",");
      for (const em of emailsDe(a)) {
        const r = await enviarEmail(em, "[Konioca] " + msg.assunto, texto, html, "painel", anexos);
        para[em] = r.ok ? "enviado" : (r.motivo ?? "falhou");
      }
    }
    const ok = Object.values(para).includes("enviado");
    if (ok) await sb.from("secretaria_envios").insert({ chave: p.chave, tipo: p.tipo, encontro_id: e?.id ?? null, para: Object.keys(para).filter((k) => para[k] === "enviado").join(", "), detalhe: { assunto: msg.assunto, semana: p.semana ?? null, inscritos: e?.inscritos ?? null } });
    resultados[p.chave] = ok ? "enviado" : JSON.stringify(para);
  }
  return json({ ok: true, envios: Object.values(resultados).filter((v) => v === "enviado").length, resultados });
});
