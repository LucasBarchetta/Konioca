// Konioca · comum: configuração pública, tokens de texto, UTMs, chamadas à API.
(function () {
  var API = (window.KONIOCA_API || "").replace(/\/$/, "");
  var TZ = "America/Sao_Paulo";
  var DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

  function fmtReais(n) { return "R$ " + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, "."); }
  function fmtReaisCent(n) {
    var c = Math.round(n * 100), r = String(Math.floor(c / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, "."), d = String(c % 100);
    return "R$ " + r + (d === "0" ? "" : "," + (d.length < 2 ? "0" + d : d));
  }
  function partes(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return { dia: "", diaMin: "", ddmm: "", hora: "" };
    var f = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
    var p = {}; f.formatToParts(d).forEach(function (x) { p[x.type] = x.value; });
    var wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
    var diaMin = DIAS[wd] || "", hh = p.hour === "24" ? "00" : p.hour;
    return { dia: diaMin.charAt(0).toUpperCase() + diaMin.slice(1), diaMin: diaMin, ddmm: p.day + "/" + p.month, hora: p.minute === "00" ? Number(hh) + "h" : Number(hh) + "h" + p.minute };
  }
  function num(v, padrao) { var n = Number(v); return isFinite(n) ? n : (padrao || 0); }
  function contagem(fimIso, agoraMs) {
    var ms = new Date(fimIso).getTime() - agoraMs;
    if (!(ms > 0)) return { encerrada: true, texto: "encerrada" };
    var DIA = 86400000, dias = Math.floor(ms / DIA), horas = Math.floor((ms % DIA) / 3600000), mins = Math.floor((ms % 3600000) / 60000);
    if (dias >= 1) return { encerrada: false, texto: dias + (dias === 1 ? " dia" : " dias") + " e " + horas + (horas === 1 ? " hora" : " horas") };
    if (horas >= 1) return { encerrada: false, texto: horas + (horas === 1 ? " hora" : " horas") + " e " + mins + " min" };
    return { encerrada: false, texto: mins + " min" };
  }

  /** Mapa de tokens usado nos textos aprovados ({reserva}, {fim_ddmm}, ...). */
  function tokens(cfg) {
    var live = partes(cfg.live_data), fim = partes(cfg.prevenda_fim);
    var novo = num(cfg.preco_prevenda), reserva = num(cfg.reserva_valor), entrada = num(cfg.entrada_valor), nParc = num(cfg.parcelas_qtd);
    var parcelado = Math.max(0, novo - reserva - entrada);
    var parceiro = cfg.financiamento_parceiro || "";
    var lote1 = num(cfg.lote1_tamanho);
    var reservas = num(cfg.reservas_lote1);
    return {
      preco_atual: fmtReais(num(cfg.preco_atual)),
      preco_prevenda: fmtReais(novo),
      reserva: fmtReais(reserva),
      entrada: fmtReais(entrada),
      pago_assinatura: fmtReais(reserva + entrada),
      parcelado: nParc > 0 ? nParc + "x de " + fmtReaisCent(parcelado / nParc) : fmtReais(parcelado),
      financiado: fmtReais(Math.max(0, novo - reserva)),
      desconto_pct: String(num(cfg.desconto_pct)),
      desconto_valor: fmtReais(num(cfg.desconto_valor)),
      lote1: String(lote1),
      entrega_dias: String(num(cfg.entrega_prazo_dias)),
      live_dia: live.dia, live_dia_min: live.diaMin, live_ddmm: live.ddmm, live_hora: live.hora,
      live_plataforma: cfg.live_plataforma || "",
      fim_ddmm: fim.ddmm, fim_hora: fim.hora,
      parceiro: parceiro, parceiro_maiusc: parceiro.toUpperCase(),
      empresa_razao: cfg.empresa_razao || "", empresa_cnpj: cfg.empresa_cnpj || "",
      contador: String(reservas).replace(/^(\d)$/, "00$1").replace(/^(\d\d)$/, "0$1") + (lote1 ? " de " + lote1 : ""),
      contagem: contagem(cfg.prevenda_fim, Date.now()).texto
    };
  }

  function preencher(T) {
    document.querySelectorAll("[data-t]").forEach(function (el) { el.textContent = T[el.getAttribute("data-t")] != null ? T[el.getAttribute("data-t")] : ""; });
    document.querySelectorAll("[data-tpl]").forEach(function (el) {
      el.textContent = el.getAttribute("data-tpl").replace(/\{(\w+)\}/g, function (_, k) { return T[k] != null ? T[k] : ""; });
    });
  }
  function preencherLinks(cfg) {
    document.querySelectorAll("[data-href]").forEach(function (a) {
      var v = cfg[a.getAttribute("data-href")];
      if (typeof v === "string" && v && !/\[[^\]]*\]/.test(v)) a.setAttribute("href", v);
    });
  }

  // UTMs e identificadores de clique: primeira visita vence (first touch), guardados por 30 dias.
  var CHAVES = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid", "gclid", "ttclid"];
  function rastreio() {
    var salvo = null;
    try { salvo = JSON.parse(localStorage.getItem("k_rastreio") || "null"); } catch (e) { salvo = null; }
    if (salvo && salvo.em && Date.now() - salvo.em < 30 * 86400000) return salvo;
    var q = new URLSearchParams(location.search), r = { em: Date.now() };
    var tem = false;
    CHAVES.forEach(function (k) { var v = q.get(k); if (v) { r[k] = v.slice(0, 200); tem = true; } });
    r.referrer = (document.referrer || "").slice(0, 500);
    r.landing_url = location.href.slice(0, 1000);
    if (!tem && salvo) return salvo;
    try { localStorage.setItem("k_rastreio", JSON.stringify(r)); } catch (e) { /* sem storage */ }
    return r;
  }

  // Contador de visitas (docs/17): um sinal por carregamento, sem cookie e sem dado pessoal. Manda o primeiro toque
  // (k_rastreio) e o link desta visita; "nova" = primeira vez neste navegador (marca k_visitou). text/plain evita preflight.
  function visita(pagina) {
    try {
      if (navigator.webdriver) return;
      var nova = false;
      try { nova = !localStorage.getItem("k_visitou"); if (nova) localStorage.setItem("k_visitou", "1"); } catch (e) { nova = false; }
      var q = new URLSearchParams(location.search), p = rastreio();
      var corpo = JSON.stringify({
        pagina: pagina, host: location.hostname, nova: nova,
        primeiro: { utm_source: p.utm_source || "", utm_medium: p.utm_medium || "", referrer: p.referrer || "" },
        visita: { utm_source: q.get("utm_source") || "", utm_medium: q.get("utm_medium") || "", referrer: document.referrer || "" }
      });
      if (navigator.sendBeacon) navigator.sendBeacon(API + "/visita", corpo);
      else fetch(API + "/visita", { method: "POST", body: corpo, keepalive: true }).catch(function () {});
    } catch (e) { /* contador nunca atrapalha a página */ }
  }

  var cfgCache = null;
  function config() {
    if (cfgCache) return cfgCache;
    cfgCache = fetch(API + "/public-config", { headers: { accept: "application/json" } })
      .then(function (r) { if (!r.ok) throw new Error("config " + r.status); return r.json(); })
      .catch(function (e) { console.error(e); return null; });
    return cfgCache;
  }
  function post(rota, corpo, limiteMs) {
    var ctrl = window.AbortController ? new AbortController() : null, t = null;
    if (ctrl && limiteMs) t = setTimeout(function () { ctrl.abort(); }, limiteMs);
    return fetch(API + "/" + rota, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(corpo), signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { return r.json().then(function (j) { j._status = r.status; return j; }); })
      .finally(function () { if (t) clearTimeout(t); });
  }

  function iniciarContagem(cfg) {
    var el = document.getElementById("kContagem"), rot = document.getElementById("kFaltamRotulo");
    if (!el || !cfg.prevenda_fim) return;
    // Compensa relógio do aparelho com a hora do servidor.
    var desvio = cfg.agora ? new Date(cfg.agora).getTime() - Date.now() : 0;
    function tick() {
      var c = contagem(cfg.prevenda_fim, Date.now() + desvio);
      if (c.encerrada) { el.textContent = "Pré-venda encerrada"; if (rot) rot.textContent = "PRAZO"; return; }
      el.textContent = c.texto;
    }
    tick(); setInterval(tick, 30000);
  }
  function mostrarContador(cfg) {
    var linha = document.getElementById("kContadorLinha");
    if (!linha) return;
    var visivel = cfg.contador_visivel === true || cfg.contador_visivel === "true";
    if (visivel && num(cfg.reservas_lote1) > 0) linha.classList.remove("oculto");
  }

  window.K = {
    API: API, config: config, post: post, tokens: tokens, preencher: preencher, preencherLinks: preencherLinks,
    rastreio: rastreio, visita: visita, iniciarContagem: iniciarContagem, mostrarContador: mostrarContador, fmtReais: fmtReais, partes: partes,
    pronto: function () { document.documentElement.classList.add("pronto"); }
  };
})();
