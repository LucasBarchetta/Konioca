// Secretária automática da Marcela (pedido do Lucas, 6/10): o que mandar e quando, por e-mail, a partir das turmas.
// Parte pura (sem banco, sem rede), testada no Node. O envio fica na function secretaria-marcela (cron a cada 5 min).
//
// Regras (horário de São Paulo, UTC-3 fixo):
//   agenda      toda segunda às 9h: turmas da semana, horário e inscritos. A primeira sai assim que todas as turmas
//               abertas dos próximos 21 dias tiverem link do Meet (pedido do Lucas: "comecem pela agenda desta semana").
//   ics         quando o link do Meet de uma turma é preenchido: convite de calendário (.ics) com data, hora e link.
//   vespera     véspera, às 10h: data, hora, link, inscritos e a lista (nome, cidade, se já tem negócio).
//   alerta_zero véspera, às 10h, turma com zero inscritos: alerta para a Marcela e para o Lucas decidirem se mantém.
//   dia_2h      2 horas antes: link e roteiro de 30 minutos (com a fala da Circular).
//   dia_15min   15 minutos antes: "começa em 15 minutos", com o link.
//   pos         depois do encontro: pedido para marcar presença e reservas no painel, com o link do painel.
// Inscrições e cancelamentos até o envio entram na contagem do próprio envio (a lista é lida na hora).
import { partesData } from "./datas.ts";
import { quandoEncontro } from "./encontros.ts";

export interface EncontroSec { id: number; inicio: string; duracao_min: number; capacidade: number; meet_link: string | null; ativo: boolean; inscritos: number }
export interface InscritoSec { nome: string; cidade: string | null; tem_negocio: boolean | null }
export type TipoSec = "agenda" | "ics" | "vespera" | "alerta_zero" | "dia_2h" | "dia_15min" | "pos";
export interface PendenteSec { tipo: TipoSec; chave: string; encontro?: EncontroSec; semana?: string }

const SP_MS = 3 * 3600_000;
const DIA_MS = 86400_000;

/** Partes de uma data no fuso de São Paulo: dia (AAAA-MM-DD), hora, minuto e dia da semana (0 = domingo). */
export function partesSP(d: Date): { dia: string; hora: number; minuto: number; dow: number } {
  const sp = new Date(d.getTime() - SP_MS);
  return { dia: sp.toISOString().slice(0, 10), hora: sp.getUTCHours(), minuto: sp.getUTCMinutes(), dow: sp.getUTCDay() };
}

/** Segunda-feira da semana (SP) de uma data, como AAAA-MM-DD. */
export function segundaDaSemana(d: Date): string {
  const sp = new Date(d.getTime() - SP_MS);
  const dow = sp.getUTCDay();
  const recuo = (dow + 6) % 7; // segunda = 0 dias de recuo
  return new Date(sp.getTime() - recuo * DIA_MS).toISOString().slice(0, 10);
}

export function meetValido(link: string | null | undefined): boolean {
  return /^https:\/\/meet\.google\.com\/[a-z0-9-]+$/i.test(String(link ?? "").trim());
}

function diaSP(iso: string): string { return partesSP(new Date(iso)).dia; }

/** Turmas abertas que começam depois de `agora` e dentro de `dias` dias. */
export function proximasTurmas(agora: Date, encontros: EncontroSec[], dias = 21): EncontroSec[] {
  const fim = agora.getTime() + dias * DIA_MS;
  return encontros.filter((e) => e.ativo && Date.parse(e.inicio) > agora.getTime() && Date.parse(e.inicio) <= fim)
    .sort((a, b) => a.inicio.localeCompare(b.inicio));
}

/**
 * O que está para sair agora. `jaEnviadas` são as chaves já registradas (uma por envio); nada repete.
 * `agendaAgora` força a agenda da semana atual (pedido manual).
 */
export function pendenciasSecretaria(agora: Date, encontros: EncontroSec[], jaEnviadas: Set<string>, opts: { agendaAgora?: boolean } = {}): PendenteSec[] {
  const out: PendenteSec[] = [];
  const sp = partesSP(agora);
  const semana = segundaDaSemana(agora);
  const chaveAgenda = `agenda:${semana}`;
  const proximas = proximasTurmas(agora, encontros);
  const horarioComercial = sp.hora >= 8 && sp.hora < 20;
  if (!jaEnviadas.has(chaveAgenda)) {
    const segundaNove = sp.dow === 1 && sp.hora >= 9 && sp.hora < 19;
    const inicial = proximas.length > 0 && proximas.every((e) => meetValido(e.meet_link)) && horarioComercial;
    if (opts.agendaAgora || segundaNove || inicial) out.push({ tipo: "agenda", chave: chaveAgenda, semana });
  }
  const amanha = partesSP(new Date(agora.getTime() + DIA_MS)).dia;
  for (const e of encontros) {
    if (!e.ativo) continue;
    const ini = Date.parse(e.inicio);
    if (!Number.isFinite(ini)) continue;
    const faltam = ini - agora.getTime();
    const fim = ini + (e.duracao_min || 30) * 60_000;
    if (faltam > 0 && meetValido(e.meet_link)) {
      const chave = `ics:${e.id}:${String(e.meet_link).trim().toLowerCase()}`;
      if (!jaEnviadas.has(chave)) out.push({ tipo: "ics", chave, encontro: e });
    }
    if (diaSP(e.inicio) === amanha && sp.hora >= 10 && sp.hora < 19) {
      const chave = `vespera:${e.id}`;
      if (!jaEnviadas.has(chave)) out.push({ tipo: e.inscritos > 0 ? "vespera" : "alerta_zero", chave, encontro: e });
    }
    if (e.inscritos > 0) {
      if (faltam <= 120 * 60_000 && faltam > 90 * 60_000 && !jaEnviadas.has(`dia2h:${e.id}`)) out.push({ tipo: "dia_2h", chave: `dia2h:${e.id}`, encontro: e });
      if (faltam <= 15 * 60_000 && faltam > 3 * 60_000 && !jaEnviadas.has(`dia15:${e.id}`)) out.push({ tipo: "dia_15min", chave: `dia15:${e.id}`, encontro: e });
      const depois = agora.getTime() - fim;
      if (depois >= 10 * 60_000 && depois < 90 * 60_000 && !jaEnviadas.has(`pos:${e.id}`)) out.push({ tipo: "pos", chave: `pos:${e.id}`, encontro: e });
    }
  }
  return out;
}

function esc(s: string): string { return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string)); }

/** HTML simples e legível no celular, a partir do texto (parágrafos separados por linha em branco; links viram <a>). */
export function htmlDeTexto(texto: string): string {
  const paras = texto.split(/\n\n+/).map((p) => esc(p).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#1f4a36">$1</a>').replace(/\n/g, "<br>"));
  return `<div style="font-family:Carlito,Calibri,'Segoe UI',sans-serif;font-size:16px;line-height:1.5;color:#1f4a36;max-width:560px">${paras.map((p) => `<p style="margin:0 0 14px">${p}</p>`).join("")}</div>`;
}

function linhaTurma(e: EncontroSec): string {
  const p = partesData(e.inicio);
  const ins = e.inscritos === 1 ? "1 inscrito" : `${e.inscritos} inscritos`;
  return `${p.diaSemanaCap}, ${p.ddmm}, às ${p.hora} · ${ins} de ${e.capacidade}${meetValido(e.meet_link) ? "" : " · sem link do Meet"}`;
}

export interface MensagemSec { assunto: string; texto: string; html: string }

export function textoAgenda(nome: string, agora: Date, encontros: EncontroSec[]): MensagemSec {
  const segunda = segundaDaSemana(agora);
  const ini = Date.parse(segunda + "T03:00:00Z"); // 0h SP
  const fim = ini + 7 * DIA_MS;
  const daSemana = encontros.filter((e) => e.ativo && Date.parse(e.inicio) >= ini && Date.parse(e.inicio) < fim).sort((a, b) => a.inicio.localeCompare(b.inicio));
  const proximas = proximasTurmas(agora, encontros, 21);
  const lista = daSemana.length ? daSemana : proximas;
  const titulo = daSemana.length ? "Suas turmas desta semana" : "Nenhuma turma nesta semana. As próximas:";
  const linhas = lista.length ? lista.map((e) => "- " + linhaTurma(e)) : ["- nenhuma turma aberta nos próximos 21 dias"];
  const total = lista.reduce((s, e) => s + e.inscritos, 0);
  const texto = [
    `${nome}, bom dia.`,
    `${titulo}`,
    linhas.join("\n"),
    `Total de inscritos: ${total}. Cada turma recebe lembrete na véspera (10h), 2 horas antes e 15 minutos antes, sempre com o link. A lista de quem vai estar na sala vai no lembrete da véspera.`,
    `Secretária automática da Konioca`,
  ].join("\n\n");
  const p = partesData(segunda + "T12:00:00Z");
  return { assunto: `Agenda da semana de ${p.ddmm}: ${lista.length === 1 ? "1 turma" : lista.length + " turmas"}, ${total} inscrito${total === 1 ? "" : "s"}`, texto, html: htmlDeTexto(texto) };
}

export function textoIcs(nome: string, e: EncontroSec): MensagemSec {
  const quando = quandoEncontro(e.inicio);
  const texto = [
    `${nome}, a turma de ${quando} ganhou link do Meet.`,
    `Link: ${e.meet_link}\nDuração: ${e.duracao_min || 30} minutos. Inscritos até agora: ${e.inscritos}.`,
    `O convite de calendário vai anexado (encontro-konioca.ics): abra e salve na sua agenda.`,
    `Secretária automática da Konioca`,
  ].join("\n\n");
  return { assunto: `Agenda: turma de ${quando} com link do Meet`, texto, html: htmlDeTexto(texto) };
}

function linhaInscrito(i: InscritoSec): string {
  const neg = i.tem_negocio === true ? "já tem negócio" : i.tem_negocio === false ? "ainda não tem negócio" : "negócio não informado";
  return `- ${i.nome.trim()}${i.cidade ? ", " + i.cidade.trim() : ""} · ${neg}`;
}

export function textoVespera(nome: string, e: EncontroSec, inscritos: InscritoSec[]): MensagemSec {
  const quando = quandoEncontro(e.inicio);
  const n = inscritos.length;
  const texto = [
    `${nome}, amanhã você tem turma: ${quando} (horário de Brasília), Google Meet, ${e.duracao_min || 30} minutos.`,
    `Link do Meet: ${e.meet_link ?? "ainda sem link (preencher no painel, aba Turmas)"}`,
    `${n === 1 ? "1 pessoa inscrita" : n + " pessoas inscritas"} até agora, para você conhecer quem vai estar na sala:\n${inscritos.map(linhaInscrito).join("\n")}`,
    `Quem se inscrever ou cancelar até 2 horas antes entra na contagem do lembrete seguinte.`,
    `Secretária automática da Konioca`,
  ].join("\n\n");
  return { assunto: `Amanhã, ${quando}: ${n} inscrito${n === 1 ? "" : "s"} na sua turma`, texto, html: htmlDeTexto(texto) };
}

export function textoAlertaZero(nome: string, e: EncontroSec): MensagemSec {
  const quando = quandoEncontro(e.inicio);
  const texto = [
    `${nome}, a turma de amanhã, ${quando}, está com zero inscritos.`,
    `Decisão para vocês dois: manter a turma (alguém ainda pode escolher esse horário até 30 minutos antes) ou desativar no painel, aba Turmas. Sem inscritos, nenhum lembrete do dia sai.`,
    `Secretária automática da Konioca`,
  ].join("\n\n");
  return { assunto: `Turma de amanhã (${quando}) sem inscritos: manter ou desativar?`, texto, html: htmlDeTexto(texto) };
}

export function textoDia2h(nome: string, e: EncontroSec, roteiro: string): MensagemSec {
  const quando = quandoEncontro(e.inicio);
  const hora = partesData(e.inicio).hora;
  const texto = [
    `${nome}, sua turma começa em 2 horas: ${quando}, Google Meet, ${e.duracao_min || 30} minutos. ${e.inscritos} inscrito${e.inscritos === 1 ? "" : "s"}.`,
    `Link do Meet: ${e.meet_link}`,
    `Roteiro de 30 minutos:\n${roteiro.trim()}`,
    `Lembrete de 15 minutos antes chega às ${hora.replace(/h(\d*)$/, (_m, mm) => "h" + (mm || "00"))} menos quinze, com o link.`,
    `Secretária automática da Konioca`,
  ].join("\n\n");
  return { assunto: `Em 2 horas: turma de ${quando} (link e roteiro)`, texto, html: htmlDeTexto(texto) };
}

export function textoDia15(nome: string, e: EncontroSec): MensagemSec {
  const quando = quandoEncontro(e.inicio);
  const texto = [
    `${nome}, começa em 15 minutos: ${quando}. ${e.inscritos} inscrito${e.inscritos === 1 ? "" : "s"}.`,
    `Entrar no Meet: ${e.meet_link}`,
    `Secretária automática da Konioca`,
  ].join("\n\n");
  return { assunto: `Começa em 15 minutos: ${quando}`, texto, html: htmlDeTexto(texto) };
}

export function textoPos(nome: string, e: EncontroSec, painelUrl: string): MensagemSec {
  const quando = quandoEncontro(e.inicio);
  const texto = [
    `${nome}, obrigada pela turma de ${quando}.`,
    `Faltam dois registros no painel, aba Turmas, na lista desta turma: marcar presença ("Presente" ou "Faltou") de cada inscrito e registrar as reservas de quem já pode reservar (botão "Reservar" no cartão do lead).`,
    `Abrir o painel: ${painelUrl}`,
    `Esse link é seu, não repasse.`,
    `Secretária automática da Konioca`,
  ].join("\n\n");
  return { assunto: `Depois da turma de ${quando}: presença e reservas no painel`, texto, html: htmlDeTexto(texto) };
}
