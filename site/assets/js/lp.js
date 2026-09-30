// LP da pré-venda: animação do preço, botões, validação e envio do cadastro.
(function () {
  var K = window.K, V = window.KValid;

  // ---- Animação do preço (portada da visualização aprovada; valores vêm da configuração)
  function animar(A, N) {
    function f(n) { return K.fmtReais(n); }
    var o = document.getElementById("kOld"), s = document.getElementById("kStrike"), ar = document.getElementById("kArrow"), nw = document.getElementById("kNew"), b = document.getElementById("kBadge"), c = document.getElementById("kCounter");
    if (!o || !c) return;
    function ph(p) { o.style.opacity = p >= 1 ? (p >= 3 ? 0.5 : 1) : 0; o.style.transform = p >= 3 ? "scale(0.8)" : "scale(1)"; s.style.transform = "rotate(-7deg) scaleX(" + (p >= 2 ? 1 : 0) + ")"; ar.style.opacity = p >= 3 ? 1 : 0; nw.style.opacity = p >= 3 ? 1 : 0; nw.style.transform = "translateY(" + (p >= 3 ? 0 : 24) + "px)"; b.style.opacity = p >= 4 ? 1 : 0; b.style.transform = "scale(" + (p >= 4 ? 1 : 0.6) + ")"; }
    var reduzir = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduzir) { ph(4); c.textContent = f(N); return; }
    function play() {
      ph(0); c.textContent = f(A);
      setTimeout(function () { ph(1); }, 300); setTimeout(function () { ph(2); }, 1400);
      setTimeout(function () { ph(3); var i = 0, st = 36, iv = setInterval(function () { i++; var t = i / st, e = 1 - Math.pow(1 - t, 3); c.textContent = f(A - (A - N) * e); if (i >= st) { clearInterval(iv); c.textContent = f(N); } }, 40); }, 2300);
      setTimeout(function () { ph(4); }, 4000); setTimeout(play, 9500);
    }
    setTimeout(play, 1500);
  }

  // ---- "Você já tem um negócio?"
  var negocio = document.getElementById("f-negocio");
  document.querySelectorAll(".pill").forEach(function (p) {
    p.addEventListener("click", function () {
      document.querySelectorAll(".pill").forEach(function (q) { q.style.background = "#f4ebdb"; q.style.color = "#1f4a36"; q.style.borderColor = "#c4a77d"; q.setAttribute("aria-pressed", "false"); });
      p.style.background = "#1f4a36"; p.style.color = "#f7f0e2"; p.style.borderColor = "#1f4a36"; p.setAttribute("aria-pressed", "true");
      if (negocio) negocio.value = p.getAttribute("data-valor") || "";
    });
  });

  // ---- Máscara leve do WhatsApp enquanto digita
  var whats = document.getElementById("f-whats");
  if (whats) whats.addEventListener("input", function () {
    var d = whats.value.replace(/\D+/g, "").replace(/^55(?=\d{10,11}$)/, "").slice(0, 11);
    if (d.length <= 2) whats.value = d.length ? "(" + d : "";
    else if (d.length <= 7) whats.value = "(" + d.slice(0, 2) + ") " + d.slice(2);
    else whats.value = "(" + d.slice(0, 2) + ") " + d.slice(2, 7) + "-" + d.slice(7);
  });

  // ---- Cloudflare Turnstile: só quando ativo na configuração e com site key preenchida
  var turnstile = { ativo: false, widget: null, token: "" };
  function iniciarTurnstile(cfg) {
    var ok = (cfg.turnstile_ativo === true || cfg.turnstile_ativo === "true") && typeof cfg.turnstile_site_key === "string" && cfg.turnstile_site_key && !/\[[^\]]*\]/.test(cfg.turnstile_site_key);
    if (!ok) return;
    turnstile.ativo = true;
    var caixa = document.getElementById("f-turnstile"); if (caixa) caixa.classList.remove("oculto");
    var s = document.createElement("script"); s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=kTurnstilePronto"; s.async = true; s.defer = true;
    window.kTurnstilePronto = function () {
      turnstile.widget = window.turnstile.render("#f-turnstile", {
        sitekey: cfg.turnstile_site_key, theme: "light", language: "pt-BR",
        callback: function (t) { turnstile.token = t; }, "expired-callback": function () { turnstile.token = ""; }, "error-callback": function () { turnstile.token = ""; }
      });
    };
    document.head.appendChild(s);
  }
  function cookie(nome) { var m = document.cookie.match(new RegExp("(?:^|; )" + nome + "=([^;]*)")); return m ? decodeURIComponent(m[1]) : ""; }

  // ---- Formulário
  var form = document.getElementById("cadastro"), erroBox = document.getElementById("f-erro"), btn = document.getElementById("f-enviar");
  function marcar(id, msg) {
    var el = document.getElementById(id); if (!el) return;
    el.classList.toggle("campo-erro", !!msg);
    var m = el.parentNode.querySelector(".msg-erro");
    if (msg) { if (!m) { m = document.createElement("div"); m.className = "msg-erro"; el.parentNode.appendChild(m); } m.textContent = msg; }
    else if (m) m.remove();
  }
  function erroGeral(msg) { if (!erroBox) return; if (msg) { erroBox.textContent = msg; erroBox.classList.remove("oculto"); } else erroBox.classList.add("oculto"); }

  if (form) form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    erroGeral("");
    var nome = V.validarNome(form.nome.value), w = V.normalizarWhatsapp(form.whatsapp.value), em = V.validarEmail(form.email.value);
    var consent = document.getElementById("f-consent").checked;
    marcar("f-nome", nome.ok ? "" : nome.motivo); marcar("f-whats", w.ok ? "" : w.motivo); marcar("f-email", em.ok ? "" : em.motivo);
    if (!consent) erroGeral("Marque o aceite para receber o link da live.");
    if (!nome.ok || !w.ok || !em.ok || !consent) { var primeiro = form.querySelector(".campo-erro"); if (primeiro) primeiro.focus(); return; }
    if (turnstile.ativo && !turnstile.token) { erroGeral("Aguarde a verificação de segurança terminar e tente de novo."); return; }

    var r = K.rastreio(), consentTexto = form.querySelector("label span") ? form.querySelector("label span").textContent.replace(/\s+/g, " ").trim() : "";
    var corpo = {
      nome: nome.nome, whatsapp: w.e164, email: em.email, cidade: form.cidade.value.trim(), tem_negocio: negocio ? negocio.value || null : null,
      consentimento: true, consentimento_texto: consentTexto, site: form.site ? form.site.value : "",
      utm_source: r.utm_source, utm_medium: r.utm_medium, utm_campaign: r.utm_campaign, utm_content: r.utm_content, utm_term: r.utm_term,
      fbclid: r.fbclid, gclid: r.gclid, ttclid: r.ttclid, referrer: r.referrer, landing_url: r.landing_url,
      fbp: cookie("_fbp"), fbc: cookie("_fbc"), turnstile_token: turnstile.token
    };
    btn.disabled = true; var txt = btn.textContent; btn.textContent = "Enviando…";
    K.post("lead-intake", corpo).then(function (j) {
      if (j && j.ok && j.token) {
        try { sessionStorage.setItem("k_lead", JSON.stringify({ token: j.token, novo: !!j.novo, event_id: j.event_id || "", grupo_controle: !!j.grupo_controle, origem: r.utm_source || "" })); } catch (e) { /* sem storage */ }
        location.href = "obrigado.html?t=" + encodeURIComponent(j.token) + "&n=" + (j.novo ? 1 : 0);
        return;
      }
      if (j && j.campos) { Object.keys(j.campos).forEach(function (k) { marcar({ nome: "f-nome", whatsapp: "f-whats", email: "f-email" }[k] || "", j.campos[k]); }); }
      erroGeral((j && j.erro && j.erro !== "validação") ? j.erro : "Confira os campos marcados.");
      if (turnstile.ativo && window.turnstile && turnstile.widget !== null) { turnstile.token = ""; window.turnstile.reset(turnstile.widget); }
      btn.disabled = false; btn.textContent = txt;
    }).catch(function () { erroGeral("Sem conexão agora. Tente de novo em instantes."); btn.disabled = false; btn.textContent = txt; });
  });

  // ---- Configuração: preenche textos, links, contagem e contador; liga pixels; roda animação
  K.rastreio();
  K.config().then(function (cfg) {
    if (!cfg) { K.pronto(); erroGeral("A página está sem os dados da pré-venda agora. Recarregue em instantes."); return; }
    K.preencher(K.tokens(cfg)); K.preencherLinks(cfg); K.pronto();
    K.iniciarContagem(cfg); K.mostrarContador(cfg);
    window.KPixels.init(cfg);
    iniciarTurnstile(cfg);
    animar(Number(cfg.preco_atual), Number(cfg.preco_prevenda));
  });
})();
