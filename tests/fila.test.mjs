import { test } from "node:test";
import assert from "node:assert/strict";
import { conviteWhatsappVencido, emailImagens, montarEnvio } from "../supabase/functions/_shared/fila.ts";
import { selecionarHeuristica } from "../supabase/functions/_shared/perguntas.ts";
import { textoHaQuanto } from "../supabase/functions/_shared/datas.ts";

const CFG = {
  live_data: "2026-10-15T19:00:00-03:00", prevenda_fim: "2026-10-30T23:59:59-03:00", circular_prazo_dias: 10, lote1_tamanho: 250,
  whatsapp_grupo_link: "https://chat.whatsapp.com/AbCdEf123", lp_url: "https://prevenda.konioca.com", assinatura_time: "Time da Marcela",
  wa_tpl_convite: "konioca_convite_live", wa_tpl_lembrete_live: "konioca_lembrete_live", wa_tpl_lembrete_live_pergunta: "konioca_lembrete_live_pergunta",
  wa_tpl_gravacao: "konioca_gravacao", wa_tpl_circular_lembrete: "konioca_circular_lembrete", wa_tpl_base_antiga: "konioca_base_antiga",
  live_link: "[LINK DA LIVE]", live_gravacao_link: "[LINK DA GRAVAÇÃO]", instagram_url: "https://www.instagram.com/konioca",
  turmas: [{ nome: "Turma de quinta · 15/10", live: "2026-10-15T19:00:00-03:00", subgrupo_link: "https://chat.whatsapp.com/[SUBGRUPO-15-10]" }],
  wa_audios: {},
};
const LEAD = { id: "l1", nome: "Ana Paula", whatsapp: "+5511990000000", email: "ana@exemplo.com", token: "tok", turma: "Turma de quinta · 15/10", pergunta_live: "Cabe numa academia pequena?", estado_conversa: "inicio" };
const API = "https://x.supabase.co/functions/v1";

test("Convite por WhatsApp: template com nome, data, hora e lote; botão de URL fixa (Instagram); sem 'escolhido'", () => {
  const e = montarEnvio("convite", "whatsapp", LEAD, CFG, API);
  assert.equal(e.canal, "whatsapp");
  assert.equal(e.nome, "konioca_convite_live");
  assert.deepEqual(e.params, ["Ana", "quinta", "15/10", "19h", "250"]);
  assert.equal(e.botaoUrlSufixo, undefined, "botão de URL fixa: nada de sufixo dinâmico");
});

test("Convite por e-mail: Instagram da Konioca, termina em 'Você consegue estar lá?' e tem saída", () => {
  const e = montarEnvio("convite", "email", LEAD, CFG, API);
  assert.equal(e.canal, "email");
  assert.match(e.texto, /instagram\.com\/konioca/);
  assert.match(e.texto, /Você consegue estar lá\?/);
  assert.match(e.texto, /optout\?t=tok/);
  assert.ok(!/escolhid/i.test(e.texto + e.html), "nada de exclusividade falsa");
  assert.equal(e.assunto, "Ana, seu acesso à pré-venda está garantido!");
  assert.match(e.texto, /^Ana, você está na lista da nova Konioca\./);
  assert.match(e.texto, /No dia 15\/10, às 19h, a Marcela/);
  assert.match(e.texto, /só quem está na lista pode reservar uma das 250 máquinas/);
  assert.match(e.html, /A pré-venda das 250 máquinas é só para quem está na lista\./, "texto de pré-visualização");
  assert.ok(!/pague|pagamento|pix|boleto/i.test(e.texto), "convite não fala em pagar");
});

test("Convite por e-mail: logo no topo, foto da máquina hospedada com texto alternativo, sem emoji", () => {
  const e = montarEnvio("convite", "email", LEAD, CFG, API);
  assert.match(e.html, /<img src="https:\/\/prevenda\.konioca\.com\/assets\/img\/email\/logo-360\.png" width="180" alt="Konioca"/);
  assert.match(e.html, /<img src="https:\/\/prevenda\.konioca\.com\/assets\/img\/email\/maquina-600\.jpg" width="600" alt="Máquina Konioca"/);
  assert.ok(e.html.indexOf("logo-360.png") < e.html.indexOf("maquina-600.jpg"), "logo acima da foto");
  assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(e.html + e.texto), "sem emoji");
  const outra = emailImagens({ email_imagens_url: "https://claude-x.konioca.pages.dev/assets/img/email/" });
  assert.equal(outra.maquina, "https://claude-x.konioca.pages.dev/assets/img/email/maquina-600.jpg");
});

test("Reaquecimento de quem foi contatado à mão: só WhatsApp, só com o nome, e só com o modelo aprovado", () => {
  const cfg = { ...CFG, wa_tpl_reaquecimento_manual: "konioca_reaquecimento_manual" };
  assert.equal(montarEnvio("reaquecimento_manual", "whatsapp", LEAD, cfg, API).canal, "nenhum", "sem aprovação da Meta nada sai");
  assert.equal(montarEnvio("reaquecimento_manual", "email", LEAD, { ...cfg, wa_tpl_reaquecimento_manual_aprovado: true }, API).canal, "nenhum");
  const e = montarEnvio("reaquecimento_manual", "whatsapp", LEAD, { ...cfg, wa_tpl_reaquecimento_manual_aprovado: true }, API);
  assert.equal(e.canal, "whatsapp");
  assert.equal(e.nome, "konioca_reaquecimento_manual");
  assert.deepEqual(e.params, ["Ana"]);
});

test("Convite e lembrete param com o Instagram entre colchetes", () => {
  const cfg = { ...CFG, instagram_url: "[INSTAGRAM DA KONIOCA]" };
  assert.equal(montarEnvio("convite", "email", LEAD, cfg, API).canal, "nenhum");
  assert.equal(montarEnvio("lembrete_live", "whatsapp", LEAD, cfg, API).canal, "nenhum");
});

test("Lembrete da live: cita a pergunta só na variante de pergunta selecionada", () => {
  const a = montarEnvio("lembrete_live", "whatsapp", LEAD, CFG, API);
  assert.equal(a.nome, "konioca_lembrete_live");
  assert.ok(a.params.includes("https://www.instagram.com/konioca"), "lembrete leva ao perfil do Instagram");
  assert.ok(!a.params.some((p) => p.includes("academia")));
  const b = montarEnvio("lembrete_live_pergunta", "whatsapp", LEAD, CFG, API);
  assert.equal(b.nome, "konioca_lembrete_live_pergunta");
  assert.ok(b.params.includes("Cabe numa academia pequena?"));
});

test("Colchete na config bloqueia o envio, nunca manda placeholder", () => {
  const e = montarEnvio("gravacao", "whatsapp", LEAD, CFG, API);
  assert.equal(e.canal, "nenhum");
  const sem = montarEnvio("convite", "whatsapp", LEAD, { ...CFG, instagram_url: "https://www.instagram.com/[PERFIL]" }, API);
  assert.equal(sem.canal, "nenhum");
});

test("Lembrete da Circular pelo WhatsApp usa a data-limite calculada", () => {
  const e = montarEnvio("circular_lembrete", "whatsapp", LEAD, CFG, API);
  assert.equal(e.params[1], "20/10");
  assert.match(e.params[2], /circular-confirmar\?t=tok$/);
});

test("Seleção de perguntas sem modelo: respeita o limite e prioriza pergunta clara de quem tem ponto", () => {
  const c = [
    { lead_id: "a", nome: "A", cidade: null, texto: "oi", tem_negocio: false, nota: 0 },
    { lead_id: "b", nome: "B", cidade: "Campinas", texto: "Quanto rende por dia numa academia com 300 alunos?", tem_negocio: true, nota: 60 },
    { lead_id: "c", nome: "C", cidade: null, texto: "Dá para financiar o restante pelo banco?", tem_negocio: false, nota: 20 },
  ];
  const s = selecionarHeuristica(c, 2);
  assert.equal(s.length, 2);
  assert.equal(s[0].lead_id, "b");
});

test("Texto do lembrete acompanha as horas configuradas", () => {
  assert.equal(textoHaQuanto(48), "há dois dias");
  assert.equal(textoHaQuanto(24), "há um dia");
  assert.equal(textoHaQuanto(6), "há 6 horas");
});

test("Base antiga: gancho personaliza e leva à LP, sem oferta de preço", async () => {
  const { ganchoTexto } = await import("../supabase/functions/_shared/datas.ts");
  const agora = new Date("2026-10-06T12:00:00-03:00");
  assert.equal(ganchoTexto("fev/26", agora), "em fevereiro");
  assert.equal(ganchoTexto("set/25", agora), "em setembro de 2025");
  assert.equal(ganchoTexto("xyz", agora), "");
  const lead = { ...LEAD, base_antiga_gancho: "fev/26", base_antiga_prioridade: "P1" };
  const e = montarEnvio("base_antiga_email", "email", lead, CFG, API);
  assert.equal(e.canal, "email");
  assert.match(e.texto, /você procurou a Konioca em (fevereiro|fevereiro de 2026) e a gente guardou o seu contato/);
  assert.match(e.texto, /utm_campaign=base_antiga&utm_content=p1/);
  assert.match(e.texto, /ao vivo no Instagram\. A live é aberta/);
  assert.ok(!/fechada/.test(e.texto), "live aberta, decisão de 1/10");
  assert.ok(!/R\$/.test(e.texto), "convite sem oferta de produto");
  assert.equal(e.assunto, "Ana, você procurou a Konioca mais de uma vez");
  assert.match(e.html, /A máquina mudou\. E você está entre as primeiras pessoas que estamos chamando\./);
  assert.match(e.html, /cones-600x240\.jpg/);
  assert.ok(!/maquina-600\.jpg/.test(e.html), "base antiga usa a faixa de cones, não a máquina");
  const e3 = montarEnvio("base_antiga_email", "email", { ...lead, base_antiga_prioridade: "P3" }, CFG, API);
  assert.match(e3.texto, /utm_content=p34/);
  assert.ok(!/guardou o seu contato/.test(e3.texto), "abertura do P1 só no P1");
  const w = montarEnvio("base_antiga", "whatsapp", lead, CFG, API);
  assert.equal(w.nome, "konioca_base_antiga");
  assert.equal(w.params.length, 5);
});

test("Convite por WhatsApp vence em convite_whatsapp_ate só se o WhatsApp oficial não estiver ativo", () => {
  const cfg = { convite_whatsapp_ate: "2026-10-12T23:59:59-03:00" };
  assert.equal(conviteWhatsappVencido(cfg, false, new Date("2026-10-12T20:00:00-03:00")), false, "antes da data: espera");
  assert.equal(conviteWhatsappVencido(cfg, false, new Date("2026-10-13T00:00:01-03:00")), true, "depois da data, sem WhatsApp: cancela");
  assert.equal(conviteWhatsappVencido(cfg, true, new Date("2026-10-20T00:00:00-03:00")), false, "WhatsApp ativo: nunca cancela");
  assert.equal(conviteWhatsappVencido({}, false, new Date("2026-12-01T00:00:00-03:00")), false, "sem data na config: nunca cancela");
  assert.equal(conviteWhatsappVencido({ convite_whatsapp_ate: "[DATA]" }, false, new Date("2026-12-01T00:00:00-03:00")), false);
});
