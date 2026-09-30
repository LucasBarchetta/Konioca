// Página de obrigado: conversão (uma vez, só para cadastro novo), pergunta de um toque, WhatsApp do time e agenda.
(function () {
  var K = window.K;
  var q = new URLSearchParams(location.search), token = q.get("t") || "", novo = q.get("n") === "1";
  var sessao = null;
  try { sessao = JSON.parse(sessionStorage.getItem("k_lead") || "null"); } catch (e) { sessao = null; }
  if (!token && sessao) token = sessao.token;

  K.config().then(function (cfg) {
    if (cfg) { K.preencher(K.tokens(cfg)); K.preencherLinks(cfg); }
    K.pronto();
    window.KPixels.init(cfg);

    // Conversão: uma vez por token, só para cadastro novo.
    var chave = "k_conv_" + token, ja = false;
    try { ja = !!localStorage.getItem(chave); } catch (e) { ja = false; }
    if (novo && token && !ja) {
      window.KPixels.lead({ event_id: (sessao && sessao.event_id) || "", origem: sessao && sessao.origem, grupo_controle: sessao && sessao.grupo_controle });
      try { localStorage.setItem(chave, "1"); } catch (e) { /* sem storage */ }
      if (token) K.post("lead-evento", { token: token, tipo: "viu_obrigado" }).catch(function () { /* ignora */ });
    }

    // Agenda: Google Agenda com os dados da configuração; o .ics fica como alternativa no mesmo botão (clique longo/desktop).
    var agenda = document.getElementById("btn-agenda");
    if (agenda && cfg && cfg.live_data) {
      var ini = new Date(cfg.live_data), fim = new Date(ini.getTime() + Number(cfg.live_duracao_min || 60) * 60000);
      function g(d) { return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z"); }
      var titulo = "Live Konioca · pré-lançamento da nova geração";
      var det = "Ao vivo pelo " + (cfg.live_plataforma || "") + ". O link chega no WhatsApp que você cadastrou.";
      agenda.href = "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + encodeURIComponent(titulo) + "&dates=" + g(ini) + "/" + g(fim) + "&details=" + encodeURIComponent(det) + "&ctz=America/Sao_Paulo";
      agenda.target = "_blank";
      agenda.addEventListener("click", function () { if (token) K.post("lead-evento", { token: token, tipo: "clicou_agenda" }).catch(function () {}); });
      // iOS/desktop com app de calendário: oferece o .ics via atributo, sem mudar o botão.
      agenda.setAttribute("data-ics", K.API + "/live-ics");
    }

    var time = document.getElementById("btn-time");
    if (time) time.addEventListener("click", function () { if (token) K.post("lead-evento", { token: token, tipo: "clicou_whatsapp_time" }).catch(function () {}); });
  });

  // Pergunta de um toque
  var opcoes = document.querySelectorAll(".opcao"), anotado = document.getElementById("anotado");
  opcoes.forEach(function (b) {
    b.addEventListener("click", function () {
      opcoes.forEach(function (o) { o.style.background = "#fdfdfd"; o.style.color = "#1f4a36"; o.style.borderColor = "#c4a77d"; });
      b.style.background = "#1f4a36"; b.style.color = "#f7f0e2"; b.style.borderColor = "#1f4a36";
      if (anotado) anotado.classList.remove("oculto");
      if (token) K.post("lead-evento", { token: token, tipo: "intencao", valor: b.textContent.trim() }).catch(function () {});
    });
  });
})();
