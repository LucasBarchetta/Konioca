// Montagem dos envios da fila: para cada tipo, qual template/texto e com quais variáveis.
// A parte pura (montarEnvio) é testável; o envio real fica no worker fila-processar.
import { type Config, cfgNum, cfgText, pendente } from "./cfg.ts";
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

function sufixoGrupo(link: string): string | undefined {
  // Botão de URL dinâmica: base https://chat.whatsapp.com/{{1}}
  const m = link.match(/chat\.whatsapp\.com\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : undefined;
}

function esc(s: string): string { return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string)); }

/** Monta o envio para um item da fila. Nunca inventa dados: o que está entre colchetes na config bloqueia o envio. */
export function montarEnvio(tipo: string, canal: string, lead: LeadFila, cfg: Config, apiUrl: string): Envio {
  const nome = primeiroNome(lead.nome);
  const turma = turmaDoLead(cfg, lead);
  const live = partesData(turma?.live ?? cfgText(cfg, "live_data"));
  const lote1 = String(cfgNum(cfg, "lote1_tamanho"));
  const grupo = turma?.subgrupo_link && !pendente(turma.subgrupo_link) ? turma.subgrupo_link : cfgText(cfg, "whatsapp_grupo_link");
  const assinatura = cfgText(cfg, "assinatura_time", "Time da Marcela");
  const idioma = cfgText(cfg, "wa_idioma", "pt_BR");
  void idioma;

  if (tipo === "convite") {
    if (canal === "email") {
      const lp = cfgText(cfg, "lp_url");
      const texto = [
        `${nome}, seu nome está na lista da pré-venda da nova Konioca.`,
        `A live é fechada para quem está na lista: ${live.diaSemana}, ${live.ddmm}, às ${live.hora}. A pré-venda tem ${lote1} máquinas.`,
        `O link chega pelo grupo da pré-venda: ${grupo}`,
        `Você consegue estar lá?`, ``, assinatura, ``,
        `Para não receber mais mensagens da pré-venda: ${apiUrl}/optout?t=${encodeURIComponent(lead.token)}`,
      ].join("\n");
      const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f4ebdb;font-family:Carlito,Calibri,'Segoe UI',sans-serif;color:#1f4a36"><div style="max-width:560px;margin:0 auto;padding:32px 24px">
<p style="margin:0 0 14px;font-size:17px;line-height:1.6">${esc(nome)}, seu nome está na lista da pré-venda da nova Konioca.</p>
<p style="margin:0 0 14px;font-size:17px;line-height:1.6">A live é fechada para quem está na lista: ${live.diaSemana}, ${live.ddmm}, às ${live.hora}. A pré-venda tem ${lote1} máquinas.</p>
<a href="${esc(grupo)}" style="display:block;text-align:center;padding:16px;background:#b04d0c;color:#f7f0e2;font-size:18px;font-weight:700;text-decoration:none;border-radius:7px">Entrar no grupo da pré-venda</a>
<p style="margin:20px 0 0;font-size:17px;line-height:1.6">Você consegue estar lá?</p>
<p style="margin:24px 0 0;font-family:Caladea,Cambria,Georgia,serif;font-style:italic;font-size:18px;color:#5a6b3a">${esc(assinatura)}</p>
<p style="margin:32px 0 0;font-size:12px;color:#5a6b3a"><a href="${esc(lp)}" style="color:#5a6b3a">${esc(lp)}</a> · <a href="${esc(apiUrl)}/optout?t=${encodeURIComponent(lead.token)}" style="color:#5a6b3a">Não quero mais receber</a></p></div></body></html>`;
      return { canal: "email", assunto: "Seu nome está na lista da pré-venda", texto, html };
    }
    const suf = sufixoGrupo(grupo);
    if (!suf) return { canal: "nenhum", motivo: "whatsapp_grupo_link pendente" };
    return { canal: "whatsapp", modo: "template", nome: cfgText(cfg, "wa_tpl_convite"), params: [nome, live.diaSemana, live.ddmm, live.hora, lote1], botaoUrlSufixo: suf };
  }

  if (tipo === "lembrete_live" || tipo === "lembrete_live_pergunta") {
    const link = cfgText(cfg, "live_link");
    if (pendente(link) || !link) return { canal: "nenhum", motivo: "live_link pendente" };
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
