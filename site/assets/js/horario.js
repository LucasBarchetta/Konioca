// Página /horario/: escolha (ou troca) da turma do encontro no Google Meet, pelo token do lead (?t=).
(function () {
  var K = window.K;
  var TZ = "America/Sao_Paulo", DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  var q = new URLSearchParams(location.search), token = q.get("t") || "";
  var el = function (id) { return document.getElementById(id); };
  var estado = { atual: null, opcoes: [], trocando: false, nome: "" };

  function partes(iso) {
    var d = new Date(iso);
    var f = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
    var p = {}; f.formatToParts(d).forEach(function (x) { p[x.type] = x.value; });
    var wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
    var hh = p.hour === "24" ? "00" : p.hour, hora = Number(hh) + "h" + (p.minute === "00" ? "" : p.minute);
    return { dia: DIAS[wd], diaCap: DIAS[wd].charAt(0).toUpperCase() + DIAS[wd].slice(1), ddmm: p.day + "/" + p.month, hora: hora, chave: p.day + "/" + p.month };
  }
  function erro(msg) { var e = el("h-erro"); if (!msg) { e.classList.add("oculto"); return; } e.textContent = msg; e.classList.remove("oculto"); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function render() {
    var a = estado.atual;
    el("h-atual").classList.toggle("oculto", !a || estado.trocando);
    el("h-lista").classList.toggle("oculto", !!a && !estado.trocando);
    el("h-vazio").classList.add("oculto");
    el("h-titulo").textContent = a && !estado.trocando ? (estado.nome ? estado.nome + ", seu horário está confirmado." : "Seu horário está confirmado.") : (estado.nome ? estado.nome + ", escolha o seu horário com a Marcela." : "Escolha o seu horário com a Marcela.");
    if (a) {
      var p = partes(a.inicio);
      el("h-atual-quando").textContent = p.diaCap + ", " + p.ddmm + ", às " + p.hora + " · " + (a.duracao_min || 30) + " min";
      el("h-atual-link").innerHTML = a.meet_link ? 'Link do Meet: <a href="' + esc(a.meet_link) + '" target="_blank" rel="noopener">' + esc(a.meet_link) + "</a>. Ele também está no seu e-mail." : "O link do Meet chega no seu e-mail antes do encontro.";
      el("h-agenda").href = K.API + "/encontro-ics?t=" + encodeURIComponent(token);
    }
    if (!a || estado.trocando) {
      var grupos = {}, ordem = [];
      estado.opcoes.slice().sort(function (x, y) { return x.inicio < y.inicio ? -1 : 1; }).forEach(function (o) {
        var p = partes(o.inicio); if (!grupos[p.chave]) { grupos[p.chave] = { titulo: p.diaCap + ", " + p.ddmm, itens: [] }; ordem.push(p.chave); }
        grupos[p.chave].itens.push({ o: o, hora: p.hora });
      });
      if (!ordem.length) { el("h-lista").classList.add("oculto"); el("h-vazio").classList.remove("oculto"); return; }
      el("h-lista").innerHTML = ordem.map(function (k) {
        var g = grupos[k];
        return '<div class="h-dia">' + esc(g.titulo) + '</div><div class="h-opcoes">' + g.itens.map(function (it) {
          var esc_ = a && a.id === it.o.id;
          return '<button type="button" class="h-opcao' + (esc_ ? " escolhida" : "") + '" data-id="' + it.o.id + '">' + esc(it.hora) + "<small>" + (it.o.vagas === 1 ? "1 vaga" : it.o.vagas + " vagas") + "</small></button>";
        }).join("") + "</div>";
      }).join("") + (a ? '<button type="button" id="h-cancelar" style="min-height:44px;font:inherit;font-size:15px;color:#c9c9b8;background:none;border:0;text-decoration:underline;cursor:pointer">Manter o meu horário</button>' : "");
    }
  }
  function carregar() {
    return K.post("encontro-escolher", { t: token, acao: "listar" }).then(function (j) {
      if (!j.ok) { erro(j.erro || "Não deu para carregar os horários."); return; }
      estado.nome = j.nome || ""; estado.atual = j.atual; estado.opcoes = j.opcoes || [];
      erro(""); render();
    }).catch(function () { erro("Sem conexão. Tente de novo em instantes."); });
  }
  document.addEventListener("click", function (ev) {
    var b = ev.target.closest("button"); if (!b) return;
    if (b.id === "h-trocar") { estado.trocando = true; render(); return; }
    if (b.id === "h-cancelar") { estado.trocando = false; render(); return; }
    var id = b.getAttribute("data-id"); if (!id) return;
    document.querySelectorAll(".h-opcao").forEach(function (x) { x.disabled = true; });
    K.post("encontro-escolher", { t: token, acao: "escolher", encontro_id: Number(id) }).then(function (j) {
      if (!j.ok) { erro(j.erro || "Não deu para salvar."); return carregar(); }
      estado.trocando = false; erro(""); return carregar();
    }).catch(function () { erro("Sem conexão. Tente de novo."); document.querySelectorAll(".h-opcao").forEach(function (x) { x.disabled = false; }); });
  });

  K.config().then(function (cfg) {
    if (cfg) K.preencher(K.tokens(cfg));
    K.pronto();
    if (!token) { erro("Abra esta página pelo link do seu e-mail de convite."); el("h-rodape").classList.add("oculto"); return; }
    carregar();
  });
})();
