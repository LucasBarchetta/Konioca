// Montagem dos envios da fila: para cada tipo, qual template/texto e com quais variáveis.
// A parte pura (montarEnvio) é testável; o envio real fica no worker fila-processar.
import { type Config, cfgBool, cfgNum, cfgText, pendente } from "./cfg.ts";
import { ganchoTexto, limiteRecebimentoCircular, partesData } from "./datas.ts";
import { primeiroNome } from "./conversa.ts";

export interface LeadFila {
  id: string; nome: string; whatsapp: string | null; email: string; token: string; turma: string | null;
  pergunta_live: string | null; estado_conversa: string; base_antiga_gancho?: string | null;
}
export interface Turma { nome: string; live: string; subgrupo_link: string }

export type Envio =
  | { canal: "whatsapp"; modo: "template"; nome: string; params: string[]; botaoUrlSufixo?: string; audio?: string }
  | { canal: "whatsapp"; modo: "texto"; texto: string }
  | { canal: "email"; assunto: string; texto: string; html: string }
  | { canal: "nenhum"; motivo: string };

export function turmaDoLead(cfg: Config, lead: LeadFila): Turma | null {
  const turmas = (cfg["turmas"] as Turma[] | undefined) ?? [];
  return turmas.find((t) => t.nome === lead.turma) ?? turmas[0] ?? null;
}

/** Imagens hospedadas dos e-mails (logo e foto da máquina). Base em config.email_imagens_url; nunca anexo. */
export function emailImagens(cfg: Config): { logo: string; maquina: string } {
  const base = cfgText(cfg, "email_imagens_url", "https://prevenda.konioca.com/assets/img/email").replace(/\/$/, "");
  return { logo: `${base}/logo-360.png`, maquina: `${base}/maquina-600.jpg` };
}

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
  const live = partesData(turma?.live ?? cfgText(cfg, "live_data"));
  const lote1 = String(cfgNum(cfg, "lote1_tamanho"));
  const grupo = turma?.subgrupo_link && !pendente(turma.subgrupo_link) ? turma.subgrupo_link : cfgText(cfg, "whatsapp_grupo_link");
  // Live aberta no Instagram da Konioca (decisão de 1/10): convite e lembrete apontam para o perfil, não para link de sala.
  const instagram = cfgText(cfg, "instagram_url");
  void grupo;
  const assinatura = cfgText(cfg, "assinatura_time", "Time da Marcela");
  const idioma = cfgText(cfg, "wa_idioma", "pt_BR");
  void idioma;

  if (tipo === "convite") {
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
    const lp = cfgText(cfg, "lp_url");
    if (!lp || pendente(lp)) return { canal: "nenhum", motivo: "lp_url pendente" };
    const quando = ganchoTexto(lead.base_antiga_gancho);
    const abertura = quando ? `${nome}, você procurou a Konioca ${quando}.` : `${nome}, você já procurou a Konioca.`;
    if (tipo === "base_antiga") {
      // Template: {{1}} nome, {{2}} "em fevereiro" (ou "antes"), {{3}} dia, {{4}} dd/mm, {{5}} hora. Botão de URL fixa para a LP com UTMs.
      return { canal: "whatsapp", modo: "template", nome: cfgText(cfg, "wa_tpl_base_antiga"), params: [nome, quando || "antes", live.diaSemana, live.ddmm, live.hora] };
    }
    const url = `${lp.replace(/\/$/, "")}/?utm_source=base&utm_medium=email&utm_campaign=base_antiga`;
    const texto = [
      abertura,
      `A gente refez a máquina. A Marcela mostra a nova geração numa live fechada para quem está na lista: ${live.diaSemana}, ${live.ddmm}, às ${live.hora}. A pré-venda tem ${lote1} máquinas.`,
      `Quer entrar na lista? ${url}`, ``, assinatura, ``,
      `Para não receber mais mensagens: ${apiUrl}/optout?t=${encodeURIComponent(lead.token)}`,
    ].join("\n");
    const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f4ebdb;font-family:Carlito,Calibri,'Segoe UI',sans-serif;color:#1f4a36"><div style="max-width:560px;margin:0 auto;padding:32px 24px">
<p style="margin:0 0 14px;font-size:17px;line-height:1.6">${esc(abertura)}</p>
<p style="margin:0 0 20px;font-size:17px;line-height:1.6">A gente refez a máquina. A Marcela mostra a nova geração numa live fechada para quem está na lista: ${live.diaSemana}, ${live.ddmm}, às ${live.hora}. A pré-venda tem ${lote1} máquinas.</p>
<a href="${esc(url)}" style="display:block;text-align:center;padding:16px;background:#b04d0c;color:#f7f0e2;font-size:18px;font-weight:700;text-decoration:none;border-radius:7px">Quero entrar na lista</a>
<p style="margin:24px 0 0;font-family:Caladea,Cambria,Georgia,serif;font-style:italic;font-size:18px;color:#5a6b3a">${esc(assinatura)}</p>
<p style="margin:32px 0 0;font-size:12px;color:#5a6b3a"><a href="${esc(apiUrl)}/optout?t=${encodeURIComponent(lead.token)}" style="color:#5a6b3a">Não quero mais receber mensagens</a></p></div></body></html>`;
    return { canal: "email", assunto: "A gente refez a máquina. Live fechada com a Marcela", texto, html };
  }

  if (tipo === "texto") {
    return { canal: "whatsapp", modo: "texto", texto: "" };
  }
  return { canal: "nenhum", motivo: "tipo desconhecido: " + tipo };
}
