// POST /visita — contador de visitas da LP (docs/17). Pública, sem JWT, CORS da LP. Recebe o sinal de lp.js e
// obrigado.js (sendBeacon em text/plain, sem preflight) e soma contadores por dia e origem em visitas_dia.
// Nada por pessoa: não guarda IP, user agent, cookie nem o corpo. Responde 204 sempre (o navegador nem lê).
// Só conta o domínio oficial (config.lp_url): prévia *.pages.dev e testes ficam de fora. utm_source teste/monitor não conta.
// utm_content vai junto (1/10): separa P1/P2/P3-P4 da base antiga e as versões A/B do P2 (p2_a / p2_b).
import { db } from "../_shared/db.ts";
import { carregarConfig, cfgText } from "../_shared/config.ts";
import { corsHeaders } from "../_shared/http.ts";

const LIMITE = 1024;
const IGNORAR = /^(teste|monitor)$/i;

function texto(v: unknown, max = 100): string { return typeof v === "string" ? v.trim().slice(0, max) : ""; }
function host(url: string): string { try { return new URL(url).hostname.toLowerCase(); } catch { return ""; } }

Deno.serve(async (req) => {
  const cors = await corsHeaders(req);
  const vazio = () => new Response(null, { status: 204, headers: cors });
  if (req.method === "OPTIONS") return vazio();
  if (req.method !== "POST") return new Response(null, { status: 405, headers: cors });
  let b: Record<string, unknown> = {};
  try {
    const bruto = await req.text();
    if (!bruto || bruto.length > LIMITE) return vazio();
    b = JSON.parse(bruto) as Record<string, unknown>;
  } catch { return vazio(); }
  const { todos: cfg } = await carregarConfig();
  const oficial = host(cfgText(cfg, "lp_url", "https://prevenda.konioca.com"));
  if (!oficial || texto(b.host).toLowerCase() !== oficial) return vazio();
  if (b.robo === true) return vazio();
  const pt = (b.primeiro ?? {}) as Record<string, unknown>;
  const vs = (b.visita ?? {}) as Record<string, unknown>;
  if (IGNORAR.test(texto(pt.utm_source)) || IGNORAR.test(texto(vs.utm_source))) return vazio();
  const { error } = await db().rpc("visita_registrar", {
    p_pagina: texto(b.pagina, 10) || "lp",
    p_src: texto(pt.utm_source), p_med: texto(pt.utm_medium), p_ref: host(texto(pt.referrer, 500)), p_content: texto(pt.utm_content, 60),
    p_src_v: texto(vs.utm_source), p_med_v: texto(vs.utm_medium), p_ref_v: host(texto(vs.referrer, 500)), p_content_v: texto(vs.utm_content, 60),
    p_nova: b.nova === true,
  });
  if (error) console.error("visita_registrar", error.message);
  return vazio();
});
