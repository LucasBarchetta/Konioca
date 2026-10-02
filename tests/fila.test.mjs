import { test } from "node:test";
import assert from "node:assert/strict";
import { conviteWhatsappVencido, emailImagens, montarEnvio } from "../supabase/functions/_shared/fila.ts";
import { selecionarHeuristica } from "../supabase/functions/_shared/perguntas.ts";
import { textoHaQuanto } from "../supabase/functions/_shared/datas.ts";

const CFG = {
  encontros_ativos: true, // formato de 2/10 (migração 800); sem a chave, a fila usa o convite legado da live
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

test("Convite por WhatsApp (formato de 2/10): template do encontro, com minutos, pessoas por grupo e lote; botão de URL dinâmica com o token", () => {
  const e = montarEnvio("convite", "whatsapp", LEAD, CFG, API);
  assert.equal(e.canal, "whatsapp");
  assert.equal(e.nome, "konioca_convite_live");
  assert.deepEqual(e.params, ["Ana", "30", "35", "250"]);
  assert.equal(e.botaoUrlSufixo, "tok", "botão 'Escolher meu horário' leva o token do lead");
  const c = montarEnvio("convite", "whatsapp", LEAD, { ...CFG, encontro_duracao_min: 25, encontro_capacidade: 20 }, API);
  assert.deepEqual(c.params, ["Ana", "25", "20", "250"], "duração e capacidade vêm da config");
});

test("Convite por e-mail (formato de 2/10): encontros fechados no Google Meet, botão 'Escolher meu horário', sem Instagram e sem live", () => {
  const e = montarEnvio("convite", "email", LEAD, CFG, API);
  assert.equal(e.canal, "email");
  assert.equal(e.assunto, "Ana, seu acesso à pré-venda está garantido!", "assunto mantido");
  assert.match(e.texto, /^Ana, você está na lista da nova Konioca\./);
  assert.match(e.texto, /A Marcela vai apresentar a nova geração em encontros fechados pelo Google Meet: 30 minutos, no máximo 35 pessoas por grupo\. Só quem está na lista participa e pode reservar uma das 250 máquinas da pré-venda\./);
  assert.match(e.texto, /Até o seu encontro, é por aqui que você vê primeiro os bastidores/);
  assert.match(e.texto, /Escolher meu horário: https:\/\/prevenda\.konioca\.com\/horario\/\?t=tok/);
  assert.match(e.html, /href="https:\/\/prevenda\.konioca\.com\/horario\/\?t=tok"[^>]*>Escolher meu horário<\/a>/);
  assert.match(e.texto, /optout\?t=tok/);
  assert.ok(!/instagram|live|15\/10|19h/i.test(e.texto + e.html.replace(/<[^>]+>/g, " ")), "sem Instagram, live, 15/10 ou 19h");
  assert.ok(!/escolhid/i.test(e.texto + e.html), "nada de exclusividade falsa");
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

test("Convite não depende mais do Instagram; o lembrete da live (a trocar pelo lembrete do encontro) ainda para com o Instagram entre colchetes", () => {
  const cfg = { ...CFG, instagram_url: "[INSTAGRAM DA KONIOCA]" };
  assert.equal(montarEnvio("convite", "email", LEAD, cfg, API).canal, "email");
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
  assert.equal(montarEnvio("lembrete_live", "whatsapp", LEAD, { ...CFG, instagram_url: "[X]" }, API).canal, "nenhum");
  // Convite do encontro (2/10) não usa mais o Instagram: um perfil entre colchetes não bloqueia o convite.
  const sem = montarEnvio("convite", "whatsapp", LEAD, { ...CFG, instagram_url: "https://www.instagram.com/[PERFIL]" }, API);
  assert.equal(sem.canal, "whatsapp");
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

test("Base antiga: três versões (texto do Lucas de 1/10), preços da config, abertura por grupo", async () => {
  const { ganchoTexto, ganchoMesesAtras } = await import("../supabase/functions/_shared/datas.ts");
  const agora = new Date("2026-10-06T12:00:00-03:00");
  assert.equal(ganchoTexto("fev/26", agora), "em fevereiro");
  assert.equal(ganchoTexto("set/25", agora), "em setembro de 2025");
  assert.equal(ganchoTexto("xyz", agora), "");
  assert.equal(ganchoMesesAtras("set/26", agora), 1);
  assert.equal(ganchoMesesAtras("fev/26", agora), 8);
  assert.equal(ganchoMesesAtras("set/25", agora), 13);
  const cfg = { ...CFG, preco_atual: 25900, preco_prevenda: 9900, financiamento_parceiro: "Bradesco" };
  const base = { ...LEAD, base_antiga_gancho: "fev/26", base_antiga_prioridade: "P1" };
  const e = montarEnvio("base_antiga_email", "email", base, cfg, API);
  assert.equal(e.canal, "email");
  assert.equal(e.assunto, "Ana, você procurou a Konioca mais de uma vez");
  assert.match(e.texto, /^Ana, você procurou a Konioca mais de uma vez, e a gente guardou o seu contato\./);
  assert.match(e.texto, /A nova geração custa R\$ 9\.900\. A atual custa R\$ 25\.900\./);
  assert.match(e.texto, /São R\$ 16 mil a menos, com financiamento pelo Bradesco\./);
  // Formato de 2/10: parágrafo do encontro no lugar da live, nas três versões.
  assert.match(e.texto, /A Marcela vai apresentar a nova geração em encontros fechados pelo Google Meet: 30 minutos, no máximo 35 pessoas por grupo\. Só quem está na lista participa e pode reservar uma das 250 máquinas da pré-venda\./);
  assert.ok(!/instagram|live|15\/10|19h/i.test(e.texto), "sem Instagram, live, 15/10 ou 19h");
  assert.match(e.texto, /utm_campaign=base_antiga&utm_content=p1/);
  assert.ok(!/não existe mais|entra primeiro/.test(e.texto), "frases retiradas em 1/10");
  assert.match(e.html, /A máquina mudou\. E você está entre as primeiras pessoas que estamos chamando\./);
  assert.match(e.html, /<strong>A nova geração custa/);
  assert.match(e.html, /cones-600x240\.jpg/);
  // P1 recente (gancho nos últimos 3 meses): abertura pelo mês
  const hoje = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", month: "numeric", year: "2-digit" }).formatToParts(new Date());
  const mm = Number(hoje.find((x) => x.type === "month").value), aa = hoje.find((x) => x.type === "year").value;
  const ganchoAtual = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][mm - 1] + "/" + aa;
  const r = montarEnvio("base_antiga_email", "email", { ...base, base_antiga_gancho: ganchoAtual }, cfg, API);
  assert.match(r.texto, /^Ana, você procurou a Konioca em [a-zç]+ e a gente guardou o seu contato\./);
  // P2: pelo mês; P3/P4 com mais de um ano: "faz mais de um ano"
  const p2 = montarEnvio("base_antiga_email", "email", { ...base, base_antiga_prioridade: "P2" }, cfg, API);
  assert.match(p2.texto, /^Ana, você procurou a Konioca em fevereiro e a gente guardou o seu contato\./);
  assert.match(p2.texto, /utm_content=p2\b/);
  // Teste A/B do P2 (2/10): A = texto aprovado com link p2_a; B = assunto e abertura pelo preço, na voz da Marcela, link p2_b.
  const p2a = montarEnvio("base_antiga_email", "email", { ...base, base_antiga_prioridade: "P2", base_antiga_variante: "a" }, cfg, API);
  assert.equal(p2a.assunto, p2.assunto); assert.equal(p2a.texto.replace("utm_content=p2_a", "utm_content=p2"), p2.texto);
  const p2b = montarEnvio("base_antiga_email", "email", { ...base, base_antiga_prioridade: "P2", base_antiga_variante: "b" }, cfg, API);
  assert.equal(p2b.assunto, "Ana, a nova Konioca custa R$ 9.900");
  assert.match(p2b.texto, /^Ana, quando você procurou a Konioca em fevereiro, a máquina custava R\$ 25\.900\./);
  assert.match(p2b.texto, /A nova geração custa R\$ 9\.900, com financiamento pelo Bradesco\. A atual continua custando R\$ 25\.900: são máquinas diferentes\./);
  assert.match(p2b.texto, /utm_content=p2_b/); assert.doesNotMatch(p2b.texto, /de R\$|por R\$|últimas|restam/i);
  assert.match(p2b.html, /Entrar na lista agora/); assert.match(p2b.html, /cones-600x240\.jpg/);
  assert.match(p2b.texto, /Eu vou apresentar a nova geração em encontros fechados pelo Google Meet: 30 minutos, no máximo 35 pessoas por grupo\. Só quem está na lista participa e pode reservar uma das 250 máquinas da pré-venda\./);
  assert.ok(!/instagram|live|15\/10|19h/i.test(p2b.texto + p2.texto), "A e B sem Instagram, live, 15/10 ou 19h");
  assert.match(p2.html, /A Marcela mostra a nova geração em encontros fechados no Google Meet\./, "prévia da A");
  assert.match(p2b.html, /Eu mostro o que mudou em encontros fechados no Google Meet\./, "prévia da B");
  // P1 e P3/P4 não têm variante: o link continua p1 / p34 mesmo se a coluna vier preenchida.
  assert.match(montarEnvio("base_antiga_email", "email", { ...base, base_antiga_prioridade: "P1", base_antiga_variante: "b" }, cfg, API).texto, /utm_content=p1\b/);
  const p3 = montarEnvio("base_antiga_email", "email", { ...base, base_antiga_prioridade: "P3", base_antiga_gancho: "set/25" }, cfg, API);
  assert.match(p3.texto, /^Ana, faz mais de um ano que você procurou a Konioca, em setembro de 2025, e a gente guardou o seu contato\./);
  assert.match(p3.texto, /utm_content=p34/);
  // Sem preço na config, nada sai
  assert.equal(montarEnvio("base_antiga_email", "email", base, CFG, API).canal, "nenhum");
  const w = montarEnvio("base_antiga", "whatsapp", base, cfg, API);
  assert.equal(w.nome, "konioca_base_antiga");
  assert.deepEqual(w.params.slice(2), ["30", "35"], "formato de 2/10: minutos e pessoas por grupo, sem data");
});

test("Convite por WhatsApp vence em convite_whatsapp_ate só se o WhatsApp oficial não estiver ativo", () => {
  const cfg = { convite_whatsapp_ate: "2026-10-12T23:59:59-03:00" };
  assert.equal(conviteWhatsappVencido(cfg, false, new Date("2026-10-12T20:00:00-03:00")), false, "antes da data: espera");
  assert.equal(conviteWhatsappVencido(cfg, false, new Date("2026-10-13T00:00:01-03:00")), true, "depois da data, sem WhatsApp: cancela");
  assert.equal(conviteWhatsappVencido(cfg, true, new Date("2026-10-20T00:00:00-03:00")), false, "WhatsApp ativo: nunca cancela");
  assert.equal(conviteWhatsappVencido({}, false, new Date("2026-12-01T00:00:00-03:00")), false, "sem data na config: nunca cancela");
  assert.equal(conviteWhatsappVencido({ convite_whatsapp_ate: "[DATA]" }, false, new Date("2026-12-01T00:00:00-03:00")), false);
});

test("Encontro no Google Meet (2/10): confirmação com .ics anexado, lembretes da véspera e de 1 h; sem link do Meet nada sai", () => {
  const en = { id: 7, inicio: "2026-10-15T13:00:00Z", duracao_min: 30, meet_link: "https://meet.google.com/abc-defg-hij" };
  const c = montarEnvio("encontro_confirmacao", "email", { ...LEAD, encontro: en }, CFG, API);
  assert.equal(c.canal, "email");
  assert.equal(c.assunto, "Ana, seu horário com a Marcela: quinta, 15/10, às 10h");
  assert.match(c.texto, /^Ana, seu encontro está confirmado: quinta, 15\/10, às 10h \(horário de Brasília\), pelo Google Meet, 30 minutos\./);
  assert.match(c.texto, /No fim do encontro, a Marcela explica como garantir uma das 250 máquinas da pré-venda\./);
  assert.doesNotMatch(c.texto, /Circular/, "a regra dos 10 dias fica só no roteiro (decisão de 2/10)");
  assert.match(c.texto, /Entrar no Meet: https:\/\/meet\.google\.com\/abc-defg-hij/);
  assert.match(c.texto, /Trocar de horário|trocar de horário/);
  assert.equal(c.anexos.length, 1); assert.equal(c.anexos[0].filename, "encontro-konioca.ics");
  const ics = Buffer.from(c.anexos[0].content, "base64").toString("utf8");
  assert.match(ics, /DTSTART:20261015T130000Z/); assert.match(ics, /DTEND:20261015T133000Z/); assert.match(ics, /meet\.google\.com\/abc-defg-hij/);
  const v = montarEnvio("encontro_lembrete_vespera", "email", { ...LEAD, encontro: en }, CFG, API);
  assert.equal(v.assunto, "Ana, amanhã às 10h: seu encontro com a Marcela"); assert.equal(v.anexos, undefined);
  const h = montarEnvio("encontro_lembrete_1h", "email", { ...LEAD, encontro: en }, CFG, API);
  assert.equal(h.assunto, "Ana, começa em 1 hora: 10h"); assert.match(h.texto, /meet\.google\.com\/abc-defg-hij/);
  assert.equal(montarEnvio("encontro_confirmacao", "email", { ...LEAD, encontro: { ...en, meet_link: null } }, CFG, API).canal, "nenhum");
  assert.equal(montarEnvio("encontro_confirmacao", "email", { ...LEAD, encontro: null }, CFG, API).canal, "nenhum");
  assert.ok(!/instagram|live/i.test(c.texto + v.texto + h.texto), "sem Instagram ou live");
  // WhatsApp: template com o código do Meet no botão de URL dinâmica
  const w = montarEnvio("encontro_confirmacao", "whatsapp", { ...LEAD, encontro: en }, { ...CFG, wa_tpl_encontro_confirmacao: "konioca_encontro_confirmacao" }, API);
  assert.equal(w.nome, "konioca_encontro_confirmacao"); assert.deepEqual(w.params, ["Ana", "quinta, 15/10, às 10h"]); assert.equal(w.botaoUrlSufixo, "abc-defg-hij");
  assert.equal(montarEnvio("encontro_confirmacao", "whatsapp", { ...LEAD, encontro: en }, CFG, API).canal, "nenhum", "sem modelo configurado nada sai");
});

test("Sem live_data na config, o convite e os e-mails do encontro continuam saindo (formato de 2/10)", () => {
  const { live_data: _l, ...semLive } = CFG;
  const c = montarEnvio("convite", "email", LEAD, semLive, API);
  assert.equal(c.canal, "email");
  const lead = { ...LEAD, encontro: { id: 2, inicio: "2026-10-15T13:00:00.000Z", duracao_min: 30, meet_link: "https://meet.google.com/abc-defg-hij" } };
  assert.equal(montarEnvio("encontro_confirmacao", "email", lead, semLive, API).canal, "email");
});

test("Sem encontros_ativos (antes da migração 800), o convite é o legado da live e não aponta para /horario/", () => {
  const { encontros_ativos: _e, ...antes } = CFG;
  const e = montarEnvio("convite", "email", LEAD, antes, API);
  assert.equal(e.canal, "email");
  assert.doesNotMatch(e.texto, /horario\//, "sem a página publicada, nada de link para /horario/");
  assert.match(e.texto, /Instagram/);
  const w = montarEnvio("convite", "whatsapp", LEAD, antes, API);
  assert.equal(w.params.length, 5);
  assert.equal(w.botaoUrlSufixo, undefined);
  // A base antiga (P2 aprovado em 1/10 à noite) já sai com o texto dos encontros no Meet mesmo sem a chave
  const base = { ...LEAD, base_antiga_prioridade: "P2", base_antiga_gancho: null, base_antiga_variante: "b" };
  const b = montarEnvio("base_antiga_email", "email", base, { ...antes, preco_atual: 25900, preco_prevenda: 9900, financiamento_parceiro: "Bradesco" }, API);
  assert.match(b.texto, /encontros fechados pelo Google Meet/);
  assert.doesNotMatch(b.texto, /Instagram/);
});
