import { carregarConfig } from "./config.ts";

export async function corsHeaders(req: Request): Promise<Record<string, string>> {
  const origem = req.headers.get("origin") ?? "";
  let permitidas: string[] = [];
  try {
    const { todos } = await carregarConfig();
    const v = todos["cors_origens"];
    permitidas = Array.isArray(v) ? v.map(String) : [];
  } catch { /* sem config, sem CORS */ }
  const ok = permitidas.includes(origem) || permitidas.includes("*");
  return {
    "Access-Control-Allow-Origin": ok ? origem : (permitidas[0] ?? "null"),
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, authorization, x-client-info, apikey",
    "Access-Control-Max-Age": "600",
    "Vary": "Origin",
  };
}

export function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...extra },
  });
}

export function html(body: string, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", ...extra } });
}

export function ipDe(req: Request): string {
  const xf = req.headers.get("x-forwarded-for") ?? "";
  const ip = xf.split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "";
  return ip;
}

export async function lerJson<T = Record<string, unknown>>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

/** Página curta no padrão visual da LP, para confirmações por link (Circular, opt-out). */
export function paginaSimples(titulo: string, texto: string, linkTexto?: string, linkHref?: string): string {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Konioca · ${esc(titulo)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Caladea:ital,wght@0,400;0,700;1,400&family=Carlito:wght@400;700&display=swap">
<style>body{margin:0;background:#19422d;font-family:Carlito,Calibri,"Segoe UI",sans-serif;color:#dce4d6;display:flex;justify-content:center}
main{width:100%;max-width:390px;padding:40px 24px;box-sizing:border-box;display:flex;flex-direction:column;gap:20px}
h1{margin:0;font-family:Caladea,Cambria,Georgia,serif;font-weight:400;font-size:34px;line-height:1.1;color:#f7f0e2}
.linha{width:120px;height:1px;background:#c9a227;margin-left:6px}p{margin:0;font-size:17px;line-height:1.6}
a.btn{display:flex;align-items:center;justify-content:center;height:56px;background:#b04d0c;color:#f7f0e2;font-size:19px;font-weight:700;text-decoration:none;border-radius:7px}</style></head>
<body><main><h1>${esc(titulo)}</h1><div class="linha"></div><p>${esc(texto)}</p>${linkHref ? `<a class="btn" href="${esc(linkHref)}">${esc(linkTexto ?? "Voltar")}</a>` : ""}</main></body></html>`;
}
