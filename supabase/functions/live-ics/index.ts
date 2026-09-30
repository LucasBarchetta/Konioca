// GET /live-ics — convite de agenda (.ics) da live, gerado da configuração.
import { carregarConfig, cfgNum, cfgText } from "../_shared/config.ts";
import { corsHeaders } from "../_shared/http.ts";

function icsData(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}
function icsEsc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

Deno.serve(async (req) => {
  const cors = await corsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const { publicos } = await carregarConfig();
  const inicio = new Date(cfgText(publicos, "live_data"));
  const fim = new Date(inicio.getTime() + cfgNum(publicos, "live_duracao_min", 60) * 60000);
  const plataforma = cfgText(publicos, "live_plataforma", "online");
  const grupo = cfgText(publicos, "whatsapp_grupo_link");
  const lp = cfgText(publicos, "lp_url");
  const linhas = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Konioca//Pre-venda//PT", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:live-prevenda-${icsData(inicio)}@konioca`,
    `DTSTAMP:${icsData(new Date())}`,
    `DTSTART:${icsData(inicio)}`,
    `DTEND:${icsData(fim)}`,
    `SUMMARY:${icsEsc("Live Konioca · pré-lançamento da nova geração")}`,
    `DESCRIPTION:${icsEsc(`Ao vivo pelo ${plataforma}. O link chega pelo grupo da pré-venda: ${grupo}`)}`,
    `URL:${icsEsc(lp)}`,
    "BEGIN:VALARM", "TRIGGER:-PT60M", "ACTION:DISPLAY", "DESCRIPTION:Live Konioca em 1 hora", "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ];
  return new Response(linhas.join("\r\n") + "\r\n", {
    headers: { ...cors, "content-type": "text/calendar; charset=utf-8", "content-disposition": 'attachment; filename="live-konioca.ics"', "cache-control": "public, max-age=300" },
  });
});
