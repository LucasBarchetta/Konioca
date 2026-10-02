// Montagem dos envios da fila: para cada tipo, qual template/texto e com quais variáveis.
// A parte pura (montarEnvio) é testável; o envio real fica no worker fila-processar.
import { type Config, cfgBool, cfgNum, cfgText, pendente } from "./cfg.ts";
import { formatarReais, ganchoMesesAtras, ganchoTexto, limiteRecebimentoCircular, partesData } from "./datas.ts";
import { primeiroNome } from "./conversa.ts";
import { base64Utf8, icsEvento } from "./ics.ts";
import { codigoMeet, type EncontroLead, quandoEncontro } from "./encontros.ts";

export interface LeadFila {
  id: string; nome: string; whatsapp: string | null; email: string; token: string; turma: string | null;
  pergunta_live: string | null; estado_conversa: string; base_antiga_gancho?: string | null; base_antiga_prioridade?: string | null;
  base_antiga_variante?: string | null; // teste A/B do P2 (2/10): "a" = texto aprovado, "b" = versão de impacto; links p2_a / p2_b
  encontro?: EncontroLead | null;       // turma escolhida (encontro fechado no Google Meet, formato de 2/10)
}
export interface Turma { nome: string; live: string; subgrupo_link: string }

export type Envio =
  | { canal: "whatsapp"; modo: "template"; nome: string; params: string[]; botaoUrlSufixo?: string; audio?: string }
  | { canal: "whatsapp"; modo: "texto"; texto: string }
  | { canal: "email"; assunto: string; texto: string; html: string; anexos?: { filename: string; content: string }[] }
  | { canal: "nenhum"; motivo: string };

export function turmaDoLead(cfg: Config, lead: LeadFila): Turma | null {
  const turmas = (cfg["turmas"] as Turma[] | undefined) ?? [];
  return turmas.find((t) => t.nome === lead.turma) ?? turmas[0] ?? null;
}

/** Imagens hospedadas dos e-mails (logo e foto da máquina). Base em config.email_imagens_url; nunca anexo. */
export function emailImagens(cfg: Config): { logo: string; maquina: string; cones: string; arte6: string } {
  const base = cfgText(cfg, "email_imagens_url", "https://prevenda.konioca.com/assets/img/email").replace(/\/$/, "");
  // maquina: corte horizontal aprovado (convite). cones: faixa 600 x 240 com três cones reais sobre o verde (base antiga, as três versões).
  // arte6: arte do LG aprovada em 2/10 ("não deveria começar com uma fortuna"), 600 px, até 150 KB; entra depois do primeiro parágrafo.
  return { logo: `${base}/logo-360.png`, maquina: `${base}/maquina-600.jpg`, cones: `${base}/cones-600x240.jpg`, arte6: `${base}/arte6-600.jpg` };
}

/** Texto alternativo da arte 6 (regra do Lucas: descritivo, para quem não carrega imagem ou usa leitor de tela). */
export const ARTE6_ALT = "Arte da Konioca: 'Empreender com alimentação não deveria começar com uma fortuna.' Uma pilha de caixas com o que uma loja exige (loja, reforma, cozinha, equipe, equipamentos) e a pergunta 'Precisa de tudo isso?'. A Marcela responde 'Não.' ao lado do carrinho Konioca, com a frase 'Mais que tapioca, liberdade.'";

function esc(s: string): string { return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string)); }

/**
 * Convite da live por WhatsApp: se o número oficial ainda não está ativo depois de config.convite_whatsapp_ate,
 * o item é cancelado e o e-mail sozinho dá conta (decisão de 1/10). Sem data na config, nunca cancela.
 */
export function conviteWhatsappVencido(cfg: Config, whatsappAtivo: boolean, agora: Date = new Date()): boolean {
  if (whatsappAtivo) return false;
  const ate = cfgText(cfg, "convite_whatsapp_ate");
  if (!ate || pendente(ate)) return false;
  const limite = new Date(ate).getTime();
  return Number.isFinite(limite) && agora.getTime() > limite;
}

/** Monta o envio para um item da fila. Nunca inventa dados: o que está entre colchetes na config bloqueia o envio. */
export function montarEnvio(tipo: string, canal: string, lead: LeadFila, cfg: Config, apiUrl: string): Envio {
  const nome = primeiroNome(lead.nome);
  const turma = turmaDoLead(cfg, lead);
  // Dados da live antiga (só os tipos legados lembrete_live e gravacao usam). Sem live_data na config, não pode quebrar os outros envios.
  const liveIso = turma?.live ?? cfgText(cfg, "live_data");
  const live = partesData(liveIso && Number.isFinite(Date.parse(liveIso)) ? liveIso : "1970-01-01T00:00:00Z");
  const lote1 = String(cfgNum(cfg, "lote1_tamanho"));
  // Encontros fechados no Google Meet (formato de 2/10, substitui a live): duração e capacidade vêm da config.
  const encontroDuracao = String(cfgNum(cfg, "encontro_duracao_min", 30));
  const encontroCapacidade = String(cfgNum(cfg, "encontro_capacidade", 35));
  const escolherUrl = `${cfgText(cfg, "lp_url", "https://prevenda.konioca.com").replace(/\/$/, "")}/horario/?t=${encodeURIComponent(lead.token)}`;
  const grupo = turma?.subgrupo_link && !pendente(turma.subgrupo_link) ? turma.subgrupo_link : cfgText(cfg, "whatsapp_grupo_link");
  // Live aberta no Instagram da Konioca (decisão de 1/10): convite e lembrete apontam para o perfil, não para link de sala.
  const instagram = cfgText(cfg, "instagram_url");
  void grupo;
  const assinatura = cfgText(cfg, "assinatura_time", "Time da Marcela");
  const idioma = cfgText(cfg, "wa_idioma", "pt_BR");
  void idioma;

  if (tipo === "convite" && !cfgBool(cfg, "encontros_ativos", false)) {
    // Convite legado (live aberta no Instagram, 1/10). Fica em uso até a migração 800 ligar config.encontros_ativos,
    // porque a página /horario/ só existe depois da publicação das turmas: sem isso o convite novo apontaria para um link morto.
    if (pendente(instagram) || !instagram) return { canal: "nenhum", motivo: "instagram_url pendente" };
    if (canal === "email") {
      const lp = cfgText(cfg, "lp_url");
      // Texto aprovado em 1/10 (consolidado + ajuste do assunto). A data e a hora vêm da config (live_data / turma), nunca fixas.
      const assunto = `${nome}, seu acesso à pré-venda está garantido!`;
      const previa = `A pré-venda das ${lote1} máquinas é só para quem está na lista.`;
      const p1 = `${nome}, você está na lista da nova Konioca.`;
      const p2 = `No dia ${live.ddmm}, às ${live.hora}, a Marcela apresenta a nova geração ao vivo no Instagram. A live é aberta, e muita gente vai assistir. Mas só quem está na lista pode reservar uma das ${lote1} máquinas da pré-venda.`;
      const p3 = `Você já está dentro. Até a live, é por aqui que você vê primeiro os bastidores da nova máquina e as novidades da Marcela.`;
      const p4 = `Uma hora antes, a gente avisa por aqui e no seu WhatsApp. Você consegue estar lá?`;
      const texto = [p1, p2, p3, `Seguir o Instagram da Konioca: ${instagram}`, p4, ``, assinatura, ``,
        `Para não receber mais mensagens da pré-venda: ${apiUrl}/optout?t=${encodeURIComponent(lead.token)}`].join("\n");
      const img = emailImagens(cfg);
      // Visual aprovado em 1/10: faixa verde com a logo centralizada, foto real da máquina atual, inteira (sem recorte),
      // na largura toda (600 px, hospedada, não anexo), texto em seguida. Sem emoji. Tabelas e estilos inline por causa do Gmail e do Outlook.
      const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(assunto)}</title></head>
<body style="margin:0;padding:0;background:#f4ebdb;font-family:Carlito,Calibri,'Segoe UI',sans-serif;color:#1f4a36">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f4ebdb;font-size:1px;line-height:1px">${esc(previa)}&#8204;&nbsp;&#8204;&nbsp;&#8204;&nbsp;&#8204;&nbsp;&#8204;&nbsp;&#8204;&nbsp;&#8204;&nbsp;&#8204;&nbsp;&#8204;&nbsp;&#8204;&nbsp;&#8204;&nbsp;&#8204;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4ebdb"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:10px;overflow:hidden">
<tr><td align="center" style="background:#1f4a36;padding:22px 24px"><img src="${esc(img.logo)}" width="180" alt="Konioca" style="display:block;width:180px;height:auto;border:0"></td></tr>
<tr><td style="padding:0;line-height:0"><img src="${esc(img.maquina)}" width="600" alt="Máquina Konioca" style="display:block;width:100%;max-width:600px;height:auto;border:0"></td></tr>
<tr><td style="padding:28px 24px 32px">
<p style="margin:0 0 14px;font-size:17px;line-height:1.6">${esc(p1)}</p>
<p style="margin:0 0 14px;font-size:17px;line-height:1.6">${esc(p2)}</p>
<p style="margin:0 0 20px;font-size:17px;line-height:1.6">${esc(p3)}</p>
<a href="${esc(instagram)}" style="display:block;text-align:center;padding:16px;background:#b04d0c;color:#f7f0e2;font-size:18px;font-weight:700;text-decoration:none;border-radius:7px">Seguir o Instagram da Konioca</a>
<p style="margin:20px 0 0;font-size:17px;line-height:1.6">${esc(p4)}</p>
<p style="margin:24px 0 0;font-family:Caladea,Cambria,Georgia,serif;font-style:italic;font-size:18px;color:#5a6b3a">${esc(assinatura)}</p>
<p style="margin:32px 0 0;font-size:12px;line-height:1.6;color:#5a6b3a"><a href="${esc(lp)}" style="color:#5a6b3a">${esc(lp)}</a> · <a href="${esc(apiUrl)}/optout?t=${encodeURIComponent(lead.token)}" style="color:#5a6b3a">Não quero mais receber</a></p>
</td></tr></table></td></tr></table></body></html>`;
      return { canal: "email", assunto, texto, html };
    }
    // Template konioca_convite_live_ig: {{1}} nome, {{2}} dia, {{3}} dd/mm, {{4}} hora, {{5}} máquinas; botão de URL fixa para o Instagram.
    return { canal: "whatsapp", modo: "template", nome: cfgText(cfg, "wa_tpl_convite"), params: [nome, live.diaSemana, live.ddmm, live.hora, lote1] };
  }

  if (tipo === "convite") {
    if (canal === "email") {
      const lp = cfgText(cfg, "lp_url");
      // Texto aprovado em 1/10 (consolidado + ajuste do assunto). A data e a hora vêm da config (live_data / turma), nunca fixas.
      const assunto = `${nome}, seu acesso à pré-venda está garantido!`;
      const previa = `A pré-venda das ${lote1} máquinas é só para quem está na lista.`;
      const p1 = `${nome}, você está na lista da nova Konioca.`;
      // Formato novo (2/10): encontros fechados no Google Meet, no lugar da live; botão "Escolher meu horário".
      const p2 = `A Marcela vai apresentar a nova geração em encontros fechados pelo Google Meet: ${encontroDuracao} minutos, no máximo ${encontroCapacidade} pessoas por grupo. Só quem está na lista participa e pode reservar uma das ${lote1} máquinas da pré-venda.`;
      const p3 = `Você já está dentro. Até o seu encontro, é por aqui que você vê primeiro os bastidores da nova máquina e as novidades da Marcela.`;
      const p4 = `Escolha o seu horário. Depois, a gente confirma por e-mail com o link do Meet e avisa na véspera e uma hora antes.`;
      const texto = [p1, p2, p3, p4, `Escolher meu horário: ${escolherUrl}`, ``, assinatura, ``,
        `Para não receber mais mensagens da pré-venda: ${apiUrl}/optout?t=${encodeURIComponent(lead.token)}`].join("\n");
      const img = emailImagens(cfg);
      // Visual aprovado em 1/10: faixa verde com a logo centralizada, foto real da máquina atual, inteira (sem recorte),
      // na largura toda (600 px, hospedada, não anexo), texto em seguida. Sem emoji. Tabelas e estilos inline por causa do Gmail e do Outlook.
      const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(assunto)}</title></head>
<body style="margin:0;padding:0;background:#f4ebdb;font-family:Carlito,Calibri,'Segoe UI',sans-serif;color:#1f4a36">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f4ebdb;font-size:1px;line-height:1px">${esc(previa)}&#8204;&nbsp;&#8204;&nbsp;&#8204;&nbsp;&#8204;&nbsp;&#8204;&nbsp;&#8204;&nbsp;&#8204;&nbsp;&#8204;&nbsp;&#8204;&nbsp;&#8204;&nbsp;&#8204;&nbsp;&#8204;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4ebdb"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:10px;overflow:hidden">
<tr><td align="center" style="background:#1f4a36;padding:22px 24px"><img src="${esc(img.logo)}" width="180" alt="Konioca" style="display:block;width:180px;height:auto;border:0"></td></tr>
<tr><td style="padding:0;line-height:0"><img src="${esc(img.maquina)}" width="600" alt="Máquina Konioca" style="display:block;width:100%;max-width:600px;height:auto;border:0"></td></tr>
<tr><td style="padding:28px 24px 32px">
<p style="margin:0 0 14px;font-size:17px;line-height:1.6">${esc(p1)}</p>
<p style="margin:0 0 14px;font-size:17px;line-height:1.6">${esc(p2)}</p>
<p style="margin:0 0 20px;font-size:17px;line-height:1.6">${esc(p3)}</p>
<p style="margin:0 0 20px;font-size:17px;line-height:1.6">${esc(p4)}</p>
<a href="${esc(escolherUrl)}" style="display:block;text-align:center;padding:16px;background:#b04d0c;color:#f7f0e2;font-size:18px;font-weight:700;text-decoration:none;border-radius:7px">Escolher meu horário</a>
<p style="margin:24px 0 0;font-family:Caladea,Cambria,Georgia,serif;font-style:italic;font-size:18px;color:#5a6b3a">${esc(assinatura)}</p>
<p style="margin:32px 0 0;font-size:12px;line-height:1.6;color:#5a6b3a"><a href="${esc(lp)}" style="color:#5a6b3a">${esc(lp)}</a> · <a href="${esc(apiUrl)}/optout?t=${encodeURIComponent(lead.token)}" style="color:#5a6b3a">Não quero mais receber</a></p>
</td></tr></table></td></tr></table></body></html>`;
      return { canal: "email", assunto, texto, html };
    }
    // Template konioca_convite_encontro (2/10): {{1}} nome, {{2}} minutos, {{3}} pessoas por grupo, {{4}} máquinas; botão de URL
    // dinâmica "Escolher meu horário" (URL fixa https://prevenda.konioca.com/horario/?t= + token do lead).
    return { canal: "whatsapp", modo: "template", nome: cfgText(cfg, "wa_tpl_convite"), params: [nome, encontroDuracao, encontroCapacidade, lote1], botaoUrlSufixo: lead.token };
  }

  if (tipo === "reaquecimento_manual") {
    // Quem foi contatado à mão no WhatsApp não recebe o convite padrão: recebe este modelo, só com o nome, quando o
    // WhatsApp oficial ligar. Sem aprovação da Meta (config.wa_tpl_reaquecimento_manual_aprovado) nada sai sozinho.
    if (canal !== "whatsapp") return { canal: "nenhum", motivo: "reaquecimento_manual só por WhatsApp" };
    if (!cfgBool(cfg, "wa_tpl_reaquecimento_manual_aprovado")) return { canal: "nenhum", motivo: "modelo de reaquecimento ainda não aprovado na Meta" };
    const modelo = cfgText(cfg, "wa_tpl_reaquecimento_manual");
    if (!modelo || pendente(modelo)) return { canal: "nenhum", motivo: "wa_tpl_reaquecimento_manual pendente" };
    return { canal: "whatsapp", modo: "template", nome: modelo, params: [nome] };
  }

  if (tipo === "lembrete_live" || tipo === "lembrete_live_pergunta") {
    // Lembrete de 1 h antes: o "link" é o perfil do Instagram (live aberta). live_link fica como alternativa se um dia houver sala.
    const link = !pendente(instagram) && instagram ? instagram : cfgText(cfg, "live_link");
    if (pendente(link) || !link) return { canal: "nenhum", motivo: "instagram_url pendente" };
    if (tipo === "lembrete_live_pergunta" && lead.pergunta_live) {
      return { canal: "whatsapp", modo: "template", nome: cfgText(cfg, "wa_tpl_lembrete_live_pergunta"), params: [nome, live.hora, lead.pergunta_live.slice(0, 120), link] };
    }
    return { canal: "whatsapp", modo: "template", nome: cfgText(cfg, "wa_tpl_lembrete_live"), params: [nome, live.hora, link] };
  }

  if (tipo === "gravacao") {
    const link = cfgText(cfg, "live_gravacao_link");
    if (pendente(link) || !link) return { canal: "nenhum", motivo: "live_gravacao_link pendente" };
    return { canal: "whatsapp", modo: "template", nome: cfgText(cfg, "wa_tpl_gravacao"), params: [nome, link] };
  }

  if (tipo === "circular_lembrete") {
    const lim = partesData(limiteRecebimentoCircular(cfgText(cfg, "prevenda_fim"), cfgNum(cfg, "circular_prazo_dias", 10)).toISOString());
    const confirmar = `${apiUrl}/circular-confirmar?t=${encodeURIComponent(lead.token)}`;
    return { canal: "whatsapp", modo: "template", nome: cfgText(cfg, "wa_tpl_circular_lembrete"), params: [nome, lim.ddmm, confirmar] };
  }

  if (tipo === "base_antiga" || tipo === "base_antiga_email") {
    // Base antiga ainda não está na lista: o convite leva à LP (cadastro, aceite e Circular). Sem oferta de produto.
    // Calendário de 1/10: P1 em 1/10, P2 em 2/10, P3 e P4 em 5/10, cada versão com o "sim" do Lucas no teste.
    const lp = cfgText(cfg, "lp_url");
    if (!lp || pendente(lp)) return { canal: "nenhum", motivo: "lp_url pendente" };
    const quando = ganchoTexto(lead.base_antiga_gancho);
    const prio = String(lead.base_antiga_prioridade ?? "").toUpperCase();
    const versao = prio === "P1" ? "p1" : prio === "P2" ? "p2" : (prio === "P3" || prio === "P4") ? "p34" : "p1";
    if (tipo === "base_antiga") {
      // Template konioca_base_antiga (formato de 2/10): {{1}} nome, {{2}} "em fevereiro" (ou "antes"), {{3}} minutos, {{4}} pessoas por grupo.
      // Botão de URL fixa para a LP com UTMs. Sem data: a pessoa escolhe o horário depois do cadastro.
      return { canal: "whatsapp", modo: "template", nome: cfgText(cfg, "wa_tpl_base_antiga"), params: [nome, quando || "antes", encontroDuracao, encontroCapacidade] };
    }
    // Teste A/B do P2 (2/10): a variante vai no link (p2_a / p2_b) para o painel e a aba Desempenho separarem os resultados.
    const variante = versao === "p2" && (lead.base_antiga_variante === "a" || lead.base_antiga_variante === "b") ? lead.base_antiga_variante : null;
    // Teste do P3/P4 (5/10, pedido do Lucas em 2/10): mesmo texto; a = faixa de cones (atual), b = arte 6 do LG depois do
    // primeiro parágrafo, sem a faixa. Cada metade com o seu utm_content (p34_cones / p34_arte6).
    const arteP34 = versao === "p34" && lead.base_antiga_variante === "b";
    const content = variante ? `p2_${variante}` : versao === "p34" && lead.base_antiga_variante === "a" ? "p34_cones" : arteP34 ? "p34_arte6" : versao;
    const url = `${lp.replace(/\/$/, "")}/?utm_source=base&utm_medium=email&utm_campaign=base_antiga&utm_content=${content}`;
    const precoNovo = formatarReais(cfgNum(cfg, "preco_prevenda"));
    const precoAtual = formatarReais(cfgNum(cfg, "preco_atual"));
    const diferencaMil = Math.floor((cfgNum(cfg, "preco_atual") - cfgNum(cfg, "preco_prevenda")) / 1000);
    const parceiro = cfgText(cfg, "financiamento_parceiro");
    if (!parceiro || pendente(parceiro) || !(cfgNum(cfg, "preco_atual") > cfgNum(cfg, "preco_prevenda"))) return { canal: "nenhum", motivo: "preco_atual, preco_prevenda ou financiamento_parceiro pendente" };
    const optout = `${apiUrl}/optout?t=${encodeURIComponent(lead.token)}`;
    const l6 = `Se não fizer mais sentido para você, é só ignorar este e-mail ou clicar em sair, aqui embaixo.`;
    const img = emailImagens(cfg);
    const P = (t: string) => `<p style="margin:0 0 14px;font-size:17px;line-height:1.6">${t}</p>`;
    // Mesmo visual para A e B: faixa verde com a logo, faixa de cones, parágrafos, botão, linha de saída, assinatura, opt-out.
    // Com `arte`: sem a faixa de cones; a arte (600 px) entra depois do primeiro parágrafo, nunca no topo (regra do Lucas, 2/10).
    const montarHtml = (assunto: string, previa: string, paragrafos: string[], chamada: string, botao: string, assina: string, arte?: { src: string; alt: string }) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(assunto)}</title></head>
<body style="margin:0;padding:0;background:#f4ebdb;font-family:Carlito,Calibri,'Segoe UI',sans-serif;color:#1f4a36">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f4ebdb;font-size:1px;line-height:1px">${esc(previa)}&#8204;&nbsp;&#8204;&nbsp;&#8204;&nbsp;&#8204;&nbsp;&#8204;&nbsp;&#8204;&nbsp;&#8204;&nbsp;&#8204;&nbsp;&#8204;&nbsp;&#8204;&nbsp;&#8204;&nbsp;&#8204;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4ebdb"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:10px;overflow:hidden">
<tr><td align="center" style="background:#1f4a36;padding:22px 24px"><img src="${esc(img.logo)}" width="180" alt="Konioca" style="display:block;width:180px;height:auto;border:0"></td></tr>
${arte ? "" : `<tr><td style="padding:0;line-height:0;background:#1f4a36"><img src="${esc(img.cones)}" width="600" alt="Cones Konioca: beijinho, pizza e brigadeiro" style="display:block;width:100%;max-width:600px;height:auto;border:0"></td></tr>`}
${arte ? `<tr><td style="padding:28px 24px 10px">${P(paragrafos[0])}</td></tr>
<tr><td style="padding:0;line-height:0"><img src="${esc(arte.src)}" width="600" alt="${esc(arte.alt)}" style="display:block;width:100%;max-width:600px;height:auto;border:0"></td></tr>
<tr><td style="padding:24px 24px 32px">
${paragrafos.slice(1).map(P).join("\n")}` : `<tr><td style="padding:28px 24px 32px">
${paragrafos.map(P).join("\n")}`}
<p style="margin:0 0 20px;font-size:17px;line-height:1.6">${esc(chamada)}</p>
<a href="${esc(url)}" style="display:block;text-align:center;padding:16px;background:#b04d0c;color:#f7f0e2;font-size:18px;font-weight:700;text-decoration:none;border-radius:7px">${esc(botao)}</a>
<p style="margin:20px 0 0;font-size:15px;line-height:1.6;color:#5a6b3a">${esc(l6)}</p>
<p style="margin:24px 0 0;font-family:Caladea,Cambria,Georgia,serif;font-style:italic;font-size:18px;color:#5a6b3a">${esc(assina)}</p>
<p style="margin:32px 0 0;font-size:12px;line-height:1.6;color:#5a6b3a"><a href="${esc(optout)}" style="color:#5a6b3a">Não quero mais receber mensagens</a></p>
</td></tr></table></td></tr></table></body></html>`;

    if (variante === "b") {
      // Versão B (proposta de 1/10 para o teste A/B do P2): assunto e abertura pelo preço, na voz da Marcela.
      // Preço só como na página (config), sem "de/por" (são máquinas diferentes), sem escassez falsa, sem promessa de ganho, sem emoji.
      const assinaB = cfgText(cfg, "assinatura_marcela", "Marcela, da Konioca");
      const assunto = `${nome}, a nova Konioca custa ${precoNovo}`;
      const previa = `A atual custa ${precoAtual}. Eu mostro o que mudou em encontros fechados no Google Meet.`;
      const b1 = `${nome}, quando você procurou a Konioca ${quando || "da última vez"}, a máquina custava ${precoAtual}. Para muita gente, esse número encerrava a conversa.`;
      const b2a = `Eu passei os últimos meses redesenhando a máquina para mudar isso. `;
      const b2b = `A nova geração custa ${precoNovo}, com financiamento pelo ${parceiro}.`;
      const b2c = ` A atual continua custando ${precoAtual}: são máquinas diferentes.`;
    // Formato novo (2/10): encontros fechados no Google Meet, no lugar da live. Na B, primeira pessoa da Marcela.
    const b3a = `Eu vou apresentar a nova geração em encontros fechados pelo Google Meet: ${encontroDuracao} minutos, no máximo ${encontroCapacidade} pessoas por grupo. `;
    const b3b = `Só quem está na lista participa e pode reservar uma das ${lote1} máquinas da pré-venda.`;
      const b4 = `Se a conversa parou no preço, ela pode recomeçar agora. Entrar na lista leva um minuto:`;
      const botao = `Entrar na lista agora`;
      const texto = [b1, b2a + b2b + b2c, b3a + b3b, b4, url, l6, ``, assinaB, ``, `Para não receber mais mensagens: ${optout}`].join("\n");
      const html = montarHtml(assunto, previa, [esc(b1), esc(b2a) + "<strong>" + esc(b2b) + "</strong>" + esc(b2c), esc(b3a) + "<strong>" + esc(b3b) + "</strong>"], b4, botao, assinaB);
      return { canal: "email", assunto, texto, html };
    }

    // Texto das três versões definido pelo Lucas em 1/10 (versão A no teste do P2). Só a abertura muda por grupo:
    //   P1: "procurou mais de uma vez"; P1 recente (gancho nos últimos 3 meses) e P2: "em {mês}";
    //   P3/P4: "faz mais de um ano, em {mês de ano}"; se o gancho tem menos de um ano, cai na abertura do P2.
    // Preços e parceiro vêm da config (preco_atual, preco_prevenda, financiamento_parceiro), nunca fixos.
    const recente = ganchoMesesAtras(lead.base_antiga_gancho) <= 3;
    const maisDeUmAno = ganchoMesesAtras(lead.base_antiga_gancho) > 12;
    const abertura = versao === "p1" && !recente
      ? `${nome}, você procurou a Konioca mais de uma vez, e a gente guardou o seu contato.`
      : versao === "p34" && maisDeUmAno && quando
      ? `${nome}, faz mais de um ano que você procurou a Konioca, ${quando}, e a gente guardou o seu contato.`
      : `${nome}, você procurou a Konioca ${quando || "há algum tempo"} e a gente guardou o seu contato.`;
    const assunto = versao === "p1" ? `${nome}, você procurou a Konioca mais de uma vez` : `${nome}, a Konioca que você procurou mudou`;
    const previa = versao === "p1" ? `A máquina mudou. E você está entre as primeiras pessoas que estamos chamando.` : `A máquina mudou. A Marcela mostra a nova geração em encontros fechados no Google Meet.`;
    const l1 = `Desde então, a Marcela redesenhou a máquina.`;
    const l2 = `A nova geração custa ${precoNovo}. A atual custa ${precoAtual}.`;
    const l3 = `São R$ ${diferencaMil} mil a menos, com financiamento pelo ${parceiro}.`;
    // Parágrafo do Lucas (2/10), no lugar do parágrafo da live.
    const l4a = `A Marcela vai apresentar a nova geração em encontros fechados pelo Google Meet: ${encontroDuracao} minutos, no máximo ${encontroCapacidade} pessoas por grupo. `;
    const l4b = `Só quem está na lista participa e pode reservar uma das ${lote1} máquinas da pré-venda.`;
    const l5 = `Entrar na lista leva um minuto:`;
    const texto = [abertura, l1, l2, l3, l4a + l4b, l5, url, l6, ``, assinatura, ``, `Para não receber mais mensagens: ${optout}`].join("\n");
    const html = montarHtml(assunto, previa, [esc(abertura), esc(l1), "<strong>" + esc(l2) + "</strong>", esc(l3), esc(l4a) + "<strong>" + esc(l4b) + "</strong>"], l5, "Quero entrar na lista", assinatura, arteP34 ? { src: img.arte6, alt: ARTE6_ALT } : undefined);
    return { canal: "email", assunto, texto, html };
  }

  if (tipo === "encontro_confirmacao" || tipo === "encontro_lembrete_vespera" || tipo === "encontro_lembrete_1h") {
    // Encontro fechado no Google Meet (formato de 2/10). Confirmação sai na hora da escolha; lembretes na véspera e 1 h antes.
    // Sem link do Meet na turma, nada sai (o item volta à fila em 10 min até o time preencher o link no painel).
    const en = lead.encontro;
    if (!en) return { canal: "nenhum", motivo: "lead sem turma" };
    if (!en.meet_link || pendente(en.meet_link) || !/^https:\/\/meet\.google\.com\//.test(en.meet_link)) return { canal: "nenhum", motivo: "link do Meet da turma pendente" };
    const quando = quandoEncontro(en.inicio);
    const hora = partesData(en.inicio).hora;
    const dur = String(en.duracao_min || cfgNum(cfg, "encontro_duracao_min", 30));
    const trocar = escolherUrl;
    if (canal === "whatsapp") {
      // Templates (docs/06): konioca_encontro_confirmacao {{1}} nome, {{2}} dia e hora; konioca_encontro_lembrete {{1}} nome, {{2}} hora.
      // Botão de URL dinâmica com o código do Meet (URL fixa https://meet.google.com/ + código).
      const nomeTpl = tipo === "encontro_confirmacao" ? cfgText(cfg, "wa_tpl_encontro_confirmacao") : cfgText(cfg, "wa_tpl_encontro_lembrete");
      if (!nomeTpl || pendente(nomeTpl)) return { canal: "nenhum", motivo: "modelo do encontro pendente" };
      return { canal: "whatsapp", modo: "template", nome: nomeTpl, params: tipo === "encontro_confirmacao" ? [nome, quando] : [nome, hora], botaoUrlSufixo: codigoMeet(en.meet_link) };
    }
    // Decisão do Lucas (2/10): a regra dos 10 dias da Circular fica só no roteiro do encontro (docs/19), não nos e-mails.
    const circular = `No fim do encontro, a Marcela explica como garantir uma das ${lote1} máquinas da pré-venda.`;
    let assunto: string, p1: string, p2: string, botao: string, rodape: string;
    if (tipo === "encontro_confirmacao") {
      assunto = `${nome}, seu horário com a Marcela: ${quando}`;
      p1 = `${nome}, seu encontro está confirmado: ${quando} (horário de Brasília), pelo Google Meet, ${dur} minutos.`;
      p2 = `Entre pelo link na hora marcada. O arquivo da agenda vai anexado, e a gente lembra na véspera e uma hora antes. ${circular}`;
      botao = "Entrar no Meet"; rodape = `Precisa trocar de horário? ${trocar}`;
    } else if (tipo === "encontro_lembrete_vespera") {
      assunto = `${nome}, amanhã às ${hora}: seu encontro com a Marcela`;
      p1 = `${nome}, amanhã, ${quando}, a Marcela apresenta a nova geração para a sua turma, pelo Google Meet, ${dur} minutos.`;
      p2 = `O link é o mesmo da confirmação. ${circular}`;
      botao = "Abrir o link do Meet"; rodape = `Não vai conseguir? Troque de horário: ${trocar}`;
    } else {
      assunto = `${nome}, começa em 1 hora: ${hora}`;
      p1 = `${nome}, seu encontro com a Marcela começa às ${hora}, pelo Google Meet.`;
      p2 = `Entre uns minutos antes. ${circular}`;
      botao = "Entrar no Meet"; rodape = "";
    }
    const texto = [p1, p2, `${botao}: ${en.meet_link}`, ...(rodape ? [rodape] : []), ``, assinatura].join("\n");
    const img = emailImagens(cfg);
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(assunto)}</title></head>
<body style="margin:0;padding:0;background:#f4ebdb;font-family:Carlito,Calibri,'Segoe UI',sans-serif;color:#1f4a36">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4ebdb"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:10px;overflow:hidden">
<tr><td align="center" style="background:#1f4a36;padding:22px 24px"><img src="${esc(img.logo)}" width="180" alt="Konioca" style="display:block;width:180px;height:auto;border:0"></td></tr>
<tr><td style="padding:28px 24px 32px">
<p style="margin:0 0 14px;font-size:17px;line-height:1.6"><strong>${esc(p1)}</strong></p>
<p style="margin:0 0 20px;font-size:17px;line-height:1.6">${esc(p2)}</p>
<a href="${esc(en.meet_link)}" style="display:block;text-align:center;padding:16px;background:#b04d0c;color:#f7f0e2;font-size:18px;font-weight:700;text-decoration:none;border-radius:7px">${esc(botao)}</a>
${rodape ? `<p style="margin:20px 0 0;font-size:15px;line-height:1.6;color:#5a6b3a">${esc(rodape.replace(trocar, "").trim())} <a href="${esc(trocar)}" style="color:#5a6b3a">Trocar de horário</a></p>` : ""}
<p style="margin:24px 0 0;font-family:Caladea,Cambria,Georgia,serif;font-style:italic;font-size:18px;color:#5a6b3a">${esc(assinatura)}</p>
</td></tr></table></td></tr></table></body></html>`;
    const anexos = tipo === "encontro_confirmacao"
      ? [{ filename: "encontro-konioca.ics", content: base64Utf8(icsEvento({ uid: `encontro-${en.id}-${lead.id}@konioca`, inicio: new Date(en.inicio), duracaoMin: Number(dur), titulo: "Konioca · encontro com a Marcela (Google Meet)", descricao: `Nova geração da Konioca, encontro fechado para quem está na lista. Link: ${en.meet_link}`, url: en.meet_link, local: "Google Meet", alarmeMin: 60 })) }]
      : undefined;
    return { canal: "email", assunto, texto, html, anexos };
  }

  if (tipo === "texto") {
    return { canal: "whatsapp", modo: "texto", texto: "" };
  }
  return { canal: "nenhum", motivo: "tipo desconhecido: " + tipo };
}
