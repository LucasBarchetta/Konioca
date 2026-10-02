import { test } from "node:test";
import assert from "node:assert/strict";
import { quantidadeValida, textoCobranca, assinaturaAprovador, filtrarLeads, ddmm, botaoReservar, rotuloCanal, detalheCanal, filtrarCanal, canaisPresentes, rotuloTemperatura, filtrarTemperatura, ordenarPorTemperatura, temperaturasPresentes } from "../supabase/functions/_shared/painel_regras.ts";

test("Quantidade do 'Reservou': inteiro de 1 a 10", () => {
  assert.equal(quantidadeValida(1), 1); assert.equal(quantidadeValida("3"), 3); assert.equal(quantidadeValida(10), 10);
  assert.equal(quantidadeValida(0), null); assert.equal(quantidadeValida(11), null); assert.equal(quantidadeValida(2.5), null); assert.equal(quantidadeValida(""), null);
});

test("Texto de cobrança segue a view: sem Circular, faltam dias, pode cobrar", () => {
  assert.deepEqual(textoCobranca({ circular_confirmada_em: null }), { texto: "Circular não confirmada", tom: "vermelho" });
  assert.deepEqual(textoCobranca({ circular_confirmada_em: "2026-10-01T12:00:00Z", liberado_em: "2026-10-11T12:00:00Z", pode_cobrar: false, dias_faltam: 7 }), { texto: "Faltam 7 dias", tom: "cinza" });
  assert.deepEqual(textoCobranca({ circular_confirmada_em: "2026-10-01T12:00:00Z", liberado_em: "2026-10-11T12:00:00Z", pode_cobrar: false, dias_faltam: 1 }), { texto: "Falta 1 dia", tom: "cinza" });
  assert.deepEqual(textoCobranca({ circular_confirmada_em: "2026-09-20T12:00:00Z", liberado_em: "2026-09-30T12:00:00Z", pode_cobrar: true, dias_faltam: 0 }), { texto: "Pode cobrar desde 30/09", tom: "verde" });
});

test("ddmm no fuso de São Paulo", () => { assert.equal(ddmm("2026-10-01T02:30:00Z"), "30/09"); assert.equal(ddmm(null), ""); });

test("Assinatura do aprovador nos eventos", () => {
  assert.equal(assinaturaAprovador({ nome: "Lucas", papel: "principal" }), "Lucas (principal)");
  assert.equal(assinaturaAprovador({ email: "ana@x.com" }), "ana");
});

test("Filtros da lista", () => {
  const L = [
    { id: 1, pode_cobrar: true, circular_confirmada_em: "x", reservou_em: null, contato_manual_em: null, optout_em: null, base_antiga: false },
    { id: 2, pode_cobrar: false, circular_confirmada_em: null, reservou_em: null, contato_manual_em: "x", optout_em: null, base_antiga: false },
    { id: 3, pode_cobrar: true, circular_confirmada_em: "x", reservou_em: "x", contato_manual_em: null, optout_em: null, base_antiga: false },
    { id: 4, pode_cobrar: false, circular_confirmada_em: null, reservou_em: null, contato_manual_em: null, optout_em: "x", base_antiga: false },
    { id: 5, pode_cobrar: false, circular_confirmada_em: null, reservou_em: null, contato_manual_em: null, optout_em: null, base_antiga: true },
  ];
  assert.deepEqual(filtrarLeads(L, "todos").map((l) => l.id), [1, 2, 3, 4]);
  assert.deepEqual(filtrarLeads(L, "pode_cobrar").map((l) => l.id), [1]);
  assert.deepEqual(filtrarLeads(L, "sem_circular").map((l) => l.id), [2, 5]);
  assert.deepEqual(filtrarLeads(L, "reservados").map((l) => l.id), [3]);
  assert.deepEqual(filtrarLeads(L, "contatados").map((l) => l.id), [2]);
  assert.deepEqual(filtrarLeads(L, "sairam").map((l) => l.id), [4]);
  assert.deepEqual(filtrarLeads(L, "base_antiga").map((l) => l.id), [5]);
});

test("'Reservou' só com pode cobrar; fora disso, desativado com o motivo", () => {
  assert.deepEqual(botaoReservar({ circular_confirmada_em: null }), { ativo: false, texto: "Circular não confirmada" });
  assert.deepEqual(botaoReservar({ circular_confirmada_em: "x", pode_cobrar: false, dias_faltam: 4 }), { ativo: false, texto: "Faltam 4 dias" });
  assert.deepEqual(botaoReservar({ circular_confirmada_em: "x", pode_cobrar: true, liberado_em: "2026-09-30T12:00:00Z" }), { ativo: true, texto: "Reservou" });
  assert.equal(botaoReservar({ circular_confirmada_em: "x", pode_cobrar: true, reservou_em: "x" }).ativo, false);
  assert.equal(botaoReservar({ circular_confirmada_em: "x", pode_cobrar: true, optout_em: "x" }).ativo, false);
});

test("Etiqueta de canal: mesma gaveta da aba Desempenho, com o link específico ao tocar", () => {
  assert.equal(rotuloCanal("stories"), "Stories"); assert.equal(rotuloCanal("base_p34"), "E-mail base antiga P3-P4");
  assert.equal(rotuloCanal(null), "Outros"); assert.equal(rotuloCanal("inventado"), "Outros");
  assert.equal(detalheCanal({ utm_source: "instagram", utm_medium: "stories", utm_campaign: "prevenda_captacao", utm_content: "roteiro_01_preco" }), "Link: roteiro_01_preco · instagram / stories / prevenda_captacao");
  assert.equal(detalheCanal({ utm_source: "instagram", utm_medium: "stories" }), "Sem link específico · instagram / stories");
  assert.equal(detalheCanal({}), "Sem link específico · sem UTM");
  const leads = [{ canal: "stories" }, { canal: "stories" }, { canal: "direto" }, { canal: null }, { canal: "base_p1" }];
  assert.equal(filtrarCanal(leads, "todos").length, 5); assert.equal(filtrarCanal(leads, "stories").length, 2); assert.equal(filtrarCanal(leads, "outros").length, 1);
  assert.deepEqual(canaisPresentes(leads).map((c) => c.canal + ":" + c.n), ["stories:2", "base_p1:1", "direto:1", "outros:1"]);
});

test("Temperatura: rótulo, filtro, contagem e ordem (quentes primeiro, depois o mais novo)", () => {
  assert.equal(rotuloTemperatura("quente"), "Quente"); assert.equal(rotuloTemperatura(null), "Frio");
  const leads = [{ id: 1, temperatura: "frio", criado_em: "2026-10-01T10:00:00Z" }, { id: 2, temperatura: "quente", criado_em: "2026-09-30T10:00:00Z", tem_negocio: true }, { id: 3, temperatura: "morno", criado_em: "2026-10-01T12:00:00Z" }, { id: 4, temperatura: "quente", criado_em: "2026-10-01T11:00:00Z", tem_negocio: false }];
  // Tem negócio só ordena dentro do grupo: o 2 (mais antigo, com negócio) vem antes do 4.
  assert.deepEqual(ordenarPorTemperatura(leads).map((l) => l.id), [2, 4, 3, 1]);
  assert.equal(filtrarTemperatura(leads, "quente").length, 2); assert.equal(filtrarTemperatura(leads, "todas").length, 4);
  assert.deepEqual(temperaturasPresentes(leads).map((t) => t.temp + ":" + t.n), ["quente:2", "morno:1", "frio:1"]);
});

import { permissoesDe, podeAcao, regraAprovacao, papeisDaRegra, estadoAprovacao, podeDecidirItem, textoRegra, revisarConteudo } from "../supabase/functions/_shared/painel_regras.ts";

test("Papel growth: vê tudo, marca contato e resposta, decide, comenta e propõe A/B; não reserva, não mexe em e-mail, turma ou presença", () => {
  const g = permissoesDe("growth");
  assert.equal(g.ver, true); assert.equal(g.contato, true); assert.equal(g.respondeu, true); assert.equal(g.decidir, true); assert.equal(g.comentar, true); assert.equal(g.propor_ab, true);
  assert.equal(g.reservar, false); assert.equal(g.corrigir_email, false); assert.equal(g.turmas_editar, false); assert.equal(g.presenca, false);
  for (const a of ["quem", "leads", "eventos", "aprovacoes", "encontros", "encontro_leads", "contato_manual", "respondeu", "comentar", "propor_ab", "decidir"]) assert.equal(podeAcao("growth", a), true, a);
  for (const a of ["reservar", "reserva_cancelar", "corrigir_email", "encontro_salvar", "presenca", "link", "inventada"]) assert.equal(podeAcao("growth", a), false, a);
});

test("Operacional comenta e propõe, não aprova conteúdo; papel desconhecido só vê", () => {
  const o = permissoesDe("operacional");
  assert.equal(o.decidir, false); assert.equal(o.comentar, true); assert.equal(o.propor_ab, true); assert.equal(o.turmas_editar, true);
  assert.equal(podeAcao("operacional", "decidir"), false);
  const x = permissoesDe("estagiario");
  assert.equal(x.ver, true); assert.equal(x.contato, false); assert.equal(x.comentar, false); assert.equal(x.decidir, false);
  assert.equal(podeAcao("estagiario", "leads"), true); assert.equal(podeAcao("estagiario", "respondeu"), false);
});

test("Regra de aprovação por tipo e uso da Marcela (ordem do Lucas, 2/10 à noite)", () => {
  assert.deepEqual(regraAprovacao("email", false), { qualquer_um_de: ["principal", "growth"], tambem: [] });
  assert.deepEqual(regraAprovacao("whatsapp", true), { qualquer_um_de: ["principal", "growth"], tambem: ["conteudo"] });
  assert.deepEqual(regraAprovacao("roteiro_video", false), { qualquer_um_de: ["principal", "growth"], tambem: [] });
  assert.deepEqual(regraAprovacao("roteiro_video", true), { qualquer_um_de: ["principal", "growth"], tambem: ["conteudo"] });
  for (const t of ["email", "whatsapp", "texto", "roteiro_video", "peca", "proposta_ab", "config"]) assert.ok(regraAprovacao(t, true).qualquer_um_de.includes("principal"), "principal aprova " + t);
  assert.deepEqual(regraAprovacao("peca", true), { qualquer_um_de: ["principal", "growth"], tambem: ["conteudo"] });
  assert.deepEqual(regraAprovacao("proposta_ab", false), { qualquer_um_de: ["principal", "growth"], tambem: [] });
  assert.deepEqual(regraAprovacao("config", true), { qualquer_um_de: ["principal"], tambem: [] });
  assert.deepEqual(papeisDaRegra(regraAprovacao("email", true)), ["principal", "growth", "conteudo"]);
  assert.equal(textoRegra(regraAprovacao("email", true), { principal: "Lucas", growth: "LG", conteudo: "Marcela" }), "Lucas ou LG; e Marcela (usa voz ou imagem dela)");
});

test("Estado do item: basta um de qualquer_um_de e todos de tambem; recusa fecha; edição vira editado", () => {
  const r = regraAprovacao("email", true);
  assert.deepEqual(estadoAprovacao(r, []), { status: "pendente", faltam: ["principal", "growth", "conteudo"] });
  assert.deepEqual(estadoAprovacao(r, [{ papel: "growth", decisao: "aprovado" }]), { status: "pendente", faltam: ["conteudo"] });
  assert.deepEqual(estadoAprovacao(r, [{ papel: "conteudo", decisao: "aprovado" }]), { status: "pendente", faltam: ["principal", "growth"] });
  assert.deepEqual(estadoAprovacao(r, [{ papel: "growth", decisao: "aprovado" }, { papel: "conteudo", decisao: "editado" }]), { status: "editado", faltam: [] });
  assert.deepEqual(estadoAprovacao(r, [{ papel: "principal", decisao: "aprovado" }, { papel: "conteudo", decisao: "recusado" }]), { status: "recusado", faltam: [] });
  assert.deepEqual(estadoAprovacao(regraAprovacao("roteiro_video", false), [{ papel: "principal", decisao: "aprovado" }]), { status: "aprovado", faltam: [] });
  assert.deepEqual(estadoAprovacao(regraAprovacao("roteiro_video", true), [{ papel: "principal", decisao: "aprovado" }]), { status: "pendente", faltam: ["conteudo"] });
});

test("Quem pode decidir agora: só quem está na regra, tem permissão e ainda não decidiu", () => {
  const email = { tipo: "email", usa_marcela: false, status: "pendente" };
  assert.equal(podeDecidirItem("growth", email), true); assert.equal(podeDecidirItem("principal", email), true);
  assert.equal(podeDecidirItem("conteudo", email), false); assert.equal(podeDecidirItem("operacional", email), false);
  assert.equal(podeDecidirItem("conteudo", { ...email, usa_marcela: true }), true);
  assert.equal(podeDecidirItem("growth", email, [{ papel: "growth", decisao: "aprovado" }]), false);
  assert.equal(podeDecidirItem("growth", { ...email, status: "aprovado" }), false);
  const roteiro = { tipo: "roteiro_video", usa_marcela: true, status: "pendente" };
  assert.equal(podeDecidirItem("growth", roteiro), true); assert.equal(podeDecidirItem("conteudo", roteiro), true); assert.equal(podeDecidirItem("principal", roteiro), true);
  assert.equal(podeDecidirItem("operacional", { tipo: "peca", usa_marcela: true, status: "pendente" }), false);
});

test("Revisor automático: preço fora da página, de/por, promessa de faturamento, imagem por IA", () => {
  const precos = { preco_prevenda: 9900, preco_atual: 25900 };
  assert.deepEqual(revisarConteudo({ texto: "A nova geração custa R$ 9.900. A atual custa R$ 25.900. São R$ 16 mil a menos." }, precos), { ok: true, problemas: [] });
  assert.deepEqual(revisarConteudo({ texto: "A nova geração custa R$ 8.900." }, precos).problemas, ["preço diferente do da página: R$ 8.900"]);
  assert.ok(revisarConteudo({ texto: "De R$ 25.900 por R$ 9.900." }, precos).problemas.includes('construção "de/por"'));
  assert.ok(revisarConteudo({ texto: "Preço de/por na capa" }, precos).problemas.includes('construção "de/por"'));
  assert.ok(revisarConteudo({ texto: "Fature R$ 10 mil por mês com a sua Konioca." }, precos).problemas.includes("promessa de faturamento, lucro ou renda"));
  assert.ok(revisarConteudo({ texto: "Lucro garantido no primeiro mês." }, precos).problemas.includes("promessa de faturamento, lucro ou renda"));
  assert.ok(revisarConteudo({ texto: "Renda extra de R$ 3.000 mensais." }, precos).problemas.includes("promessa de faturamento, lucro ou renda"));
  assert.equal(revisarConteudo({ texto: "Mais que tapioca, liberdade. A renda não é o assunto deste e-mail." }, precos).ok, true);
  assert.deepEqual(revisarConteudo({ texto: "Veja a máquina.", maquina_ia: true }, precos).problemas, ["máquina ou produto feito por IA"]);
  assert.deepEqual(revisarConteudo({ texto: "Veja a máquina.", imagens: [{ ia: true, tipo: "maquina" }] }, precos).problemas, ["máquina ou produto feito por IA"]);
  assert.equal(revisarConteudo({ texto: "Arte com a Marcela em desenho.", imagens: [{ ia: true, tipo: "pessoa" }] }, precos).ok, true, "ilustração de pessoa por IA não é barrada");
  assert.equal(revisarConteudo({ texto: "Sinal de R$ 1.000 para a pré-reserva." }, precos).ok, true, "R$ 1.000 é permitido");
  assert.equal(revisarConteudo({ texto: "Parcela de R$ 825." }, { ...precos, valores_permitidos: [825] }).ok, true, "valor extra da config");
  assert.equal(revisarConteudo({ texto: "Parcela de R$ 825." }, precos).ok, false);
  assert.equal(revisarConteudo({ html: "<p>A nova geração custa <strong>R$ 9.900</strong>.</p>" }, precos).ok, true);
  assert.equal(revisarConteudo({ assunto: "Ana, a nova Konioca custa R$ 9.900", texto: "" }, precos).ok, true);
});
