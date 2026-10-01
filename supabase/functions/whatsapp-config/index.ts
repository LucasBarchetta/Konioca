// POST /whatsapp-config — (interno, chave de serviço) operações de configuração do WhatsApp oficial.
// { acao: "estado" } diz qual provedor está ativo e se os segredos necessários existem (sem mostrar valores).
// { acao: "registrar_webhook" } registra o nosso webhook na 360dialog (com o segredo na URL). Nada de mensagem sai daqui.
import { exigirServico } from "../_shared/db.ts";
import { json, lerJson } from "../_shared/http.ts";
import { provedor, registrarWebhook360, whatsappConfigurado } from "../_shared/whatsapp.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ erro: "método" }, 405);
  if (!(await exigirServico(req))) return json({ erro: "não autorizado" }, 401);
  const b = (await lerJson<{ acao?: string }>(req)) ?? {};
  if (b.acao === "registrar_webhook") return json(await registrarWebhook360());
  const tem = (n: string) => !!Deno.env.get(n);
  return json({
    ok: true, provedor: provedor(), configurado: whatsappConfigurado(),
    segredos: { WHATSAPP_TOKEN: tem("WHATSAPP_TOKEN"), WHATSAPP_PHONE_NUMBER_ID: tem("WHATSAPP_PHONE_NUMBER_ID"), WHATSAPP_WEBHOOK_SEGREDO: tem("WHATSAPP_WEBHOOK_SEGREDO"), WHATSAPP_APP_SECRET: tem("WHATSAPP_APP_SECRET"), WHATSAPP_VERIFY_TOKEN: tem("WHATSAPP_VERIFY_TOKEN") },
  });
});
