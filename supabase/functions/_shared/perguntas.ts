// Seleção de perguntas para a live: tipos e heurística sem modelo. Puro, testado no Node.

export interface PerguntaCandidata { lead_id: string; nome: string; cidade: string | null; texto: string; tem_negocio: boolean | null; nota: number }
export interface PerguntaSelecionada { lead_id: string; motivo: string }

/** Heurística sem modelo: pergunta clara, variedade de casos, prioridade para quem tem ponto e nota maior. */
export function selecionarHeuristica(c: PerguntaCandidata[], n: number): PerguntaSelecionada[] {
  const pont = (p: PerguntaCandidata) => (p.texto.includes("?") ? 2 : 0) + (p.tem_negocio ? 2 : 0) + Math.min(3, p.nota / 25) + Math.min(2, p.texto.length / 60);
  const usados = new Set<string>();
  const out: PerguntaSelecionada[] = [];
  for (const p of [...c].sort((a, b) => pont(b) - pont(a))) {
    const tema = p.texto.toLowerCase().replace(/[^a-zà-ú ]/g, "").split(" ").filter((w) => w.length > 5)[0] ?? p.lead_id;
    if (usados.has(tema) && out.length < n - 2) continue;
    usados.add(tema);
    out.push({ lead_id: p.lead_id, motivo: "heurística: pergunta clara e caso representativo" });
    if (out.length >= n) break;
  }
  return out;
}
