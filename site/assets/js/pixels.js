// Pixels Meta, TikTok e GA4. IDs vêm da configuração pública; sem ID, nada é carregado.
(function () {
  var ativo = { meta: false, tiktok: false, ga4: false };
  function idOk(v) { return typeof v === "string" && v.trim() && !/\[[^\]]*\]/.test(v); }

  function init(cfg) {
    if (!cfg) return;
    if (idOk(cfg.meta_pixel_id)) {
      !function (f, b, e, v, n, t, s) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); }; if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = "2.0"; n.queue = []; t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s); }(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
      window.fbq("init", cfg.meta_pixel_id.trim()); window.fbq("track", "PageView"); ativo.meta = true;
    }
    if (idOk(cfg.tiktok_pixel_id)) {
      !function (w, d, t) { w.TiktokAnalyticsObject = t; var ttq = w[t] = w[t] || []; ttq.methods = ["page", "track", "identify", "instances", "debug", "on", "off", "once", "ready", "alias", "group", "enableCookie", "disableCookie"]; ttq.setAndDefer = function (t, e) { t[e] = function () { t.push([e].concat(Array.prototype.slice.call(arguments, 0))); }; }; for (var i = 0; i < ttq.methods.length; i++) ttq.setAndDefer(ttq, ttq.methods[i]); ttq.instance = function (t) { for (var e = ttq._i[t] || [], n = 0; n < ttq.methods.length; n++) ttq.setAndDefer(e, ttq.methods[n]); return e; }; ttq.load = function (e, n) { var i = "https://analytics.tiktok.com/i18n/pixel/events.js"; ttq._i = ttq._i || {}; ttq._i[e] = []; ttq._i[e]._u = i; ttq._t = ttq._t || {}; ttq._t[e] = +new Date; ttq._o = ttq._o || {}; ttq._o[e] = n || {}; var o = document.createElement("script"); o.type = "text/javascript"; o.async = !0; o.src = i + "?sdkid=" + e + "&lib=" + t; var a = document.getElementsByTagName("script")[0]; a.parentNode.insertBefore(o, a); }; ttq.load(cfg.tiktok_pixel_id.trim()); ttq.page(); }(window, document, "ttq");
      ativo.tiktok = true;
    }
    if (idOk(cfg.ga4_id)) {
      var s = document.createElement("script"); s.async = true; s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(cfg.ga4_id.trim()); document.head.appendChild(s);
      window.dataLayer = window.dataLayer || []; window.gtag = function () { window.dataLayer.push(arguments); };
      window.gtag("js", new Date()); window.gtag("config", cfg.ga4_id.trim(), { send_page_view: true }); ativo.ga4 = true;
    }
  }

  /** Evento de conversão do cadastro. Disparar uma vez por lead novo (página de obrigado). */
  function lead(dados) {
    dados = dados || {};
    try { if (ativo.meta) window.fbq("track", "Lead", { content_name: "prevenda_nova_geracao" }); } catch (e) { /* ignora */ }
    try { if (ativo.tiktok) window.ttq.track("SubmitForm", { content_name: "prevenda_nova_geracao" }); } catch (e) { /* ignora */ }
    try { if (ativo.ga4) window.gtag("event", "generate_lead", { origem: dados.origem || "", grupo_controle: !!dados.grupo_controle }); } catch (e) { /* ignora */ }
  }
  window.KPixels = { init: init, lead: lead };
})();
