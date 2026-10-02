// Arquivo de agenda (.ics) do encontro no Google Meet. Puro, testado no Node.
export interface Evento { uid: string; inicio: Date; duracaoMin: number; titulo: string; descricao: string; url?: string; local?: string; alarmeMin?: number }

export function icsData(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}
export function icsEsc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}
/** Linhas com mais de 75 bytes são dobradas (RFC 5545). */
function dobrar(linha: string): string {
  const partes: string[] = [];
  let atual = "";
  for (const ch of linha) {
    if (new TextEncoder().encode(atual + ch).length > 73) { partes.push(atual); atual = " " + ch; } else atual += ch;
  }
  partes.push(atual);
  return partes.join("\r\n");
}

export function icsEvento(e: Evento): string {
  const fim = new Date(e.inicio.getTime() + e.duracaoMin * 60_000);
  const linhas = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Konioca//Pre-venda//PT", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${e.uid}`,
    `DTSTAMP:${icsData(new Date())}`,
    `DTSTART:${icsData(e.inicio)}`,
    `DTEND:${icsData(fim)}`,
    `SUMMARY:${icsEsc(e.titulo)}`,
    `DESCRIPTION:${icsEsc(e.descricao)}`,
    ...(e.url ? [`URL:${icsEsc(e.url)}`] : []),
    ...(e.local ? [`LOCATION:${icsEsc(e.local)}`] : []),
    "BEGIN:VALARM", `TRIGGER:-PT${e.alarmeMin ?? 60}M`, "ACTION:DISPLAY", `DESCRIPTION:${icsEsc(e.titulo)}`, "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ];
  return linhas.map(dobrar).join("\r\n") + "\r\n";
}

/** Base64 de texto UTF-8 (anexo do Resend). */
export function base64Utf8(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = ""; for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
