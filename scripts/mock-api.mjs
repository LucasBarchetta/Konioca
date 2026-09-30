// Servidor local que imita as functions públicas (public-config, lead-intake, lead-evento, live-ics)
// e serve o site. Lê os valores do seed SQL para não duplicar configuração.
// Uso: node scripts/mock-api.mjs  ->  http://localhost:8080
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const seed = readFileSync(join(raiz, "supabase/migrations/20260930000200_seed_config.sql"), "utf8");
const cfg = {};
for (const m of seed.matchAll(/\('([a-z0-9_]+)',\s*'((?:[^']|'')*)',\s*(true|false)/g)) {
  const [, chave, bruto, publico] = m;
  if (publico !== "true") continue;
  try { cfg[chave] = JSON.parse(bruto.replace(/''/g, "'")); } catch { cfg[chave] = bruto; }
}
const overrides = process.env.MOCK_CFG ? JSON.parse(process.env.MOCK_CFG) : {};
Object.assign(cfg, overrides);
const leads = new Map();
let reservas = Number(overrides.reservas_lote1 ?? 0);

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".txt": "text/plain", ".ics": "text/calendar" };
const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET,POST,OPTIONS" };
const json = (res, obj, status = 200) => { res.writeHead(status, { "content-type": "application/json", ...cors }); res.end(JSON.stringify(obj)); };
const corpo = (req) => new Promise((ok) => { let s = ""; req.on("data", (c) => s += c); req.on("end", () => { try { ok(JSON.parse(s || "{}")); } catch { ok({}); } }); });

createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
  if (url.pathname === "/functions/v1/public-config") {
    const atual = Number(cfg.preco_atual), novo = Number(cfg.preco_prevenda), reserva = Number(cfg.reserva_valor), entrada = Number(cfg.entrada_valor);
    return json(res, { ...cfg, desconto_pct: Math.floor((atual - novo) / atual * 100), desconto_valor: atual - novo, parcelado_valor: novo - reserva - entrada, financiado_valor: novo - reserva, reservas_lote1: reservas, reservas_total: reservas, agora: new Date().toISOString() });
  }
  if (url.pathname === "/functions/v1/lead-intake" && req.method === "POST") {
    const b = await corpo(req);
    if (b.site) return json(res, { ok: true, novo: false, token: null });
    if (!b.nome || !b.whatsapp || !b.email || b.consentimento !== true) return json(res, { erro: "validação", campos: { nome: !b.nome ? "Informe seu nome." : undefined } }, 422);
    const existente = [...leads.values()].find((l) => l.whatsapp === b.whatsapp || l.email === b.email);
    if (existente) return json(res, { ok: true, novo: false, token: existente.token, obrigado_url: "/obrigado.html?t=" + existente.token + "&n=0" });
    const token = Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);
    leads.set(token, { ...b, token, criado_em: new Date().toISOString() });
    console.log("lead", b.nome, b.whatsapp, b.email, "origem?", b.utm_source, b.referrer);
    return json(res, { ok: true, novo: true, token, grupo_controle: Math.random() < 0.1, obrigado_url: "/obrigado.html?t=" + token + "&n=1" }, 201);
  }
  if (url.pathname === "/functions/v1/lead-evento" && req.method === "POST") {
    const b = await corpo(req); console.log("evento", b.tipo, b.valor ?? ""); return json(res, { ok: true });
  }
  if (url.pathname === "/functions/v1/live-ics") { res.writeHead(200, { "content-type": "text/calendar", ...cors }); return res.end("BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n"); }
  // estático
  let p = url.pathname === "/" ? "/index.html" : url.pathname;
  const arquivo = join(raiz, "site", p);
  if (!arquivo.startsWith(join(raiz, "site")) || !existsSync(arquivo)) { res.writeHead(404); return res.end("404"); }
  let conteudo = readFileSync(arquivo);
  if (p === "/assets/js/env.js") conteudo = Buffer.from(`window.KONIOCA_API = "http://localhost:${PORTA}/functions/v1";\n`);
  res.writeHead(200, { "content-type": MIME[extname(arquivo)] ?? "application/octet-stream" });
  res.end(conteudo);
}).listen(Number(process.env.PORTA ?? 8080), () => console.log("mock em http://localhost:" + PORTA));
const PORTA = Number(process.env.PORTA ?? 8080);
