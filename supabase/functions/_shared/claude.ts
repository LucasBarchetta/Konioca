// Rotinas que usam a API do Claude. Cada função lê estado, propõe e grava; nada muda sem aprovação humana
// onde a regra pede. Sem ANTHROPIC_API_KEY, cai na heurística e registra isso.
import Anthropic from "npm:@anthropic-ai/sdk@0.129.0";
import { z } from "npm:zod@4.6.5";
import { zodOutputFormat } from "npm:@anthropic-ai/sdk@0.129.0/helpers/zod";
import { selecionarHeuristica, type PerguntaCandidata, type PerguntaSelecionada } from "./perguntas.ts";

export { selecionarHeuristica, type PerguntaCandidata, type PerguntaSelecionada };

const Selecao = z.object({
  selecionadas: z.array(z.object({ lead_id: z.string(), motivo: z.string() })),
  observacao: z.string(),
});

/** Seleção com o modelo: variedade de casos de uso, perguntas que ajudam a plateia inteira, nome e cidade para a Marcela citar. */
export async function selecionarPerguntas(c: PerguntaCandidata[], n: number, modelo: string): Promise<{ selecionadas: PerguntaSelecionada[]; fonte: "claude" | "heuristica"; observacao: string }> {
  if (!Deno.env.get("ANTHROPIC_API_KEY") || c.length === 0) {
    return { selecionadas: selecionarHeuristica(c, n), fonte: "heuristica", observacao: c.length ? "ANTHROPIC_API_KEY ausente" : "sem candidatas" };
  }
  const client = new Anthropic();
  const lista = c.map((p) => `- lead_id=${p.lead_id} | ${p.nome}${p.cidade ? " (" + p.cidade + ")" : ""} | tem ponto: ${p.tem_negocio === null ? "não informado" : p.tem_negocio ? "sim" : "não"} | nota ${p.nota} | "${p.texto.replace(/\s+/g, " ").slice(0, 300)}"`).join("\n");
  const resp = await client.messages.parse({
    model: modelo,
    max_tokens: 4000,
    output_config: { effort: "medium", format: zodOutputFormat(Selecao) },
    system: [
      "Você seleciona perguntas de leads para a fundadora de uma franquia de máquinas de cone de tapioca responder ao vivo numa live de pré-venda.",
      "Critérios: perguntas que ajudam a plateia inteira (custo, operação, onde colocar, financiamento, entrega), variedade de casos de uso (academia, cafeteria, lanchonete, conveniência, eventos, começar do zero), e leads com sinal de compra maior.",
      "Nunca selecione texto ofensivo, dado pessoal sensível ou algo que exponha o lead. Devolva exatamente os lead_id recebidos.",
      `Selecione no máximo ${n}. Em 'motivo', uma frase curta de por que ajuda a plateia. Em 'observacao', o que faltou entre as candidatas (temas sem pergunta).`,
    ].join(" "),
    messages: [{ role: "user", content: `Candidatas:\n${lista}` }],
  });
  const parsed = resp.parsed_output;
  if (!parsed) return { selecionadas: selecionarHeuristica(c, n), fonte: "heuristica", observacao: "resposta do modelo sem parse" };
  const ids = new Set(c.map((p) => p.lead_id));
  const sel = parsed.selecionadas.filter((s) => ids.has(s.lead_id)).slice(0, n);
  return { selecionadas: sel, fonte: "claude", observacao: parsed.observacao };
}
