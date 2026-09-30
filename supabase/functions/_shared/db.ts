import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

let cliente: SupabaseClient | null = null;

/** Cliente com a chave de serviço. Só roda dentro das functions; nunca vai ao navegador. */
export function db(): SupabaseClient {
  if (cliente) return cliente;
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios");
  cliente = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return cliente;
}

const validadas = new Map<string, number>();

/**
 * Exige a chave de serviço no Authorization (rotinas internas, cron, operadores).
 * O cron manda a chave legada (JWT service_role) guardada no Vault; o runtime pode injetar em
 * SUPABASE_SERVICE_ROLE_KEY a chave nova (sb_secret_...). Por isso, quando não bate com o ambiente,
 * a chave é validada no próprio PostgREST: a tabela config tem RLS fechado e sem políticas, então
 * só uma chave service_role deste projeto enxerga linhas. Resultado positivo fica 10 min em memória.
 */
export async function exigirServico(req: Request): Promise<boolean> {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return false;
  const token = auth.slice(7).trim();
  if (!token) return false;
  const env = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (env && token === env) return true;
  const ate = validadas.get(token);
  if (ate && ate > Date.now()) return true;
  const url = Deno.env.get("SUPABASE_URL");
  if (!url) return false;
  try {
    const r = await fetch(`${url}/rest/v1/config?select=chave&limit=1`, { headers: { apikey: token, authorization: `Bearer ${token}` } });
    if (!r.ok) return false;
    const linhas = await r.json();
    const ok = Array.isArray(linhas) && linhas.length > 0;
    if (ok) validadas.set(token, Date.now() + 10 * 60_000);
    return ok;
  } catch {
    return false;
  }
}
