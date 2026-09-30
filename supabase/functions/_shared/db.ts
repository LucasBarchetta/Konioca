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

/** Exige a chave de serviço no Authorization (rotinas internas, cron, operadores). */
export function exigirServico(req: Request): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  return key.length > 0 && auth === `Bearer ${key}`;
}
