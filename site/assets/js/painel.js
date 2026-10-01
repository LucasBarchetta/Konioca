// Konioca · painel da Fase A. Fala só com a painel-api, com o link assinado do aprovador (?t=...).
(function () {
  var API = (window.KONIOCA_API || "").replace(/\/$/, "");
  var TZ = "America/Sao_Paulo";
  var q = new URLSearchParams(location.search);
  var token = q.get("t") || "";
  try { if (token) sessionStorage.setItem("k_painel_t", token); else token = sessionStorage.getItem("k_painel_t") || ""; } catch (e) { /* sem storage */ }
  if (q.get("t")) { try { history.replaceState(null, "", location.pathname); } catch (e) { /* ok */ } }

  var estado = { quem: null, leads: [], filtro: "todos", canal: "todos", temp: "todas", busca: "", aba: "leads", aberto: {}, canalAberto: {}, aprovacoes: [], novos: {}, atualizadoEm: 0, digitando: false, carregando: false, adiada: false };
  // Etiqueta de canal (primeiro toque, mesma gaveta da aba Desempenho: v_painel_leads.canal). Espelho de painel_regras.ts.
  var CANAIS = [["stories", "Stories"], ["bio_instagram", "Bio do Instagram"], ["bio_tiktok", "Bio do TikTok"], ["whatsapp", "WhatsApp"], ["base_p1", "E-mail base antiga P1"], ["base_p2", "E-mail base antiga P2"], ["base_p2_a", "E-mail base antiga P2 (A)"], ["base_p2_b", "E-mail base antiga P2 (B)"], ["base_p34", "E-mail base antiga P3-P4"], ["base_email", "E-mail base antiga"], ["convite", "Convite"], ["direto", "Direto"], ["outros", "Outros"]];
  function rotuloCanal(c) { for (var i = 0; i < CANAIS.length; i++) if (CANAIS[i][0] === (c || "outros")) return CANAIS[i][1]; return "Outros"; }
  function detalheCanal(l) {
    var crus = [l.utm_source, l.utm_medium, l.utm_campaign].map(function (x) { return String(x || "").trim(); }).filter(Boolean).join(" / ");
    var link = String(l.utm_content || "").trim();
    return (link ? "Link: " + link : "Sem link específico") + (crus ? " · " + crus : " · sem UTM");
  }
  // Temperatura (regra no banco: lead_temperatura, recalculada a cada atualização). Aqui só rótulo, filtro e ordem.
  var TEMPS = [["quente", "Quente"], ["morno", "Morno"], ["frio", "Frio"]], ORDEM_TEMP = { quente: 0, morno: 1, frio: 2 };
  function rotuloTemp(t) { for (var i = 0; i < TEMPS.length; i++) if (TEMPS[i][0] === t) return TEMPS[i][1]; return "Frio"; }
  function filtrarTemp(leads, t) { if (!t || t === "todas") return leads; return leads.filter(function (l) { return (l.temperatura || "frio") === t; }); }
  // Quentes primeiro; dentro do grupo, quem tem negócio; depois o mais novo (espelho de painel_regras.ts).
  function ordenarTemp(leads) { return leads.slice().sort(function (a, b) { return (ORDEM_TEMP[a.temperatura || "frio"] - ORDEM_TEMP[b.temperatura || "frio"]) || (Number(b.tem_negocio === true) - Number(a.tem_negocio === true)) || String(b.criado_em || "").localeCompare(String(a.criado_em || "")); }); }
  function filtrarCanal(leads, canal) { if (!canal || canal === "todos") return leads; return leads.filter(function (l) { return (l.canal || "outros") === canal; }); }
  function canaisPresentes(leads) {
    var n = {}; leads.forEach(function (l) { var c = l.canal || "outros"; n[c] = (n[c] || 0) + 1; });
    return CANAIS.filter(function (c) { return n[c[0]]; }).map(function (c) { return { canal: c[0], rotulo: c[1], n: n[c[0]] }; });
  }
  var INTERVALO = 30000; // atualização automática com a página visível
  var el = function (id) { return document.getElementById(id); };
  function erro(msg) { var e = el("p-erro"); if (!msg) { e.classList.add("oculto"); return; } e.textContent = msg; e.classList.remove("oculto"); }
  function api(acao, corpo) {
    var c = corpo || {}; c.acao = acao; c.t = token;
    return fetch(API + "/painel-api", { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(c) })
      .then(function (r) { return r.json().then(function (j) { j._status = r.status; return j; }); });
  }
  function dataHora(iso) {
    if (!iso) return "";
    var d = new Date(iso); if (isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d).replace(",", " ");
  }
  function ddmm(iso) { if (!iso) return ""; var d = new Date(iso); if (isNaN(d.getTime())) return ""; return new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit" }).format(d); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function fmtWhats(e164) { var d = String(e164 || "").replace(/\D/g, "").replace(/^55/, ""); return d.length === 11 ? "(" + d.slice(0, 2) + ") " + d.slice(2, 7) + "-" + d.slice(7) : (e164 || ""); }

  // Regras de exibição (a regra de "pode cobrar" vem do banco; aqui só a frase).
  function cobranca(l) {
    if (!l.circular_confirmada_em) return { texto: "Circular não confirmada", tom: "vermelho" };
    if (l.pode_cobrar) return { texto: "Pode cobrar desde " + ddmm(l.liberado_em), tom: "verde" };
    var d = l.dias_faltam || 0;
    return { texto: d <= 1 ? "Falta 1 dia" : "Faltam " + d + " dias", tom: "cinza" };
  }
  function filtrar(leads, filtro) {
    switch (filtro) {
      case "pode_cobrar": return leads.filter(function (l) { return !!l.pode_cobrar && !l.reservou_em && !l.optout_em; });
      case "sem_circular": return leads.filter(function (l) { return !l.circular_confirmada_em && !l.optout_em; });
      case "reservados": return leads.filter(function (l) { return !!l.reservou_em; });
      case "contatados": return leads.filter(function (l) { return !!l.contato_manual_em; });
      case "sairam": return leads.filter(function (l) { return !!l.optout_em; });
      case "base_antiga": return leads.filter(function (l) { return !!l.base_antiga; });
      default: return leads.filter(function (l) { return !l.base_antiga; });
    }
  }
  function buscar(leads, termo) {
    var t = (termo || "").trim().toLowerCase(); if (!t) return leads;
    var dig = t.replace(/\D/g, "");
    return leads.filter(function (l) {
      return (l.nome || "").toLowerCase().indexOf(t) >= 0 || (l.cidade || "").toLowerCase().indexOf(t) >= 0 || (l.email || "").toLowerCase().indexOf(t) >= 0 || (dig && (l.whatsapp || "").replace(/\D/g, "").indexOf(dig) >= 0);
    });
  }

  function tag(texto, tom) { return '<span class="p-tag ' + (tom || "") + '">' + esc(texto) + "</span>"; }
  function cartao(l) {
    var c = cobranca(l), tags = [];
    tags.push(tag(c.texto, c.tom));
    if (l.respondeu_em) tags.push(tag("Respondeu " + ddmm(l.respondeu_em), "verde"));
    if (l.reservou_em) tags.push(tag("Reservou " + l.reservas_qtd + (l.reservas_qtd === 1 ? " máquina" : " máquinas") + " em " + ddmm(l.reservou_em), "ouro"));
    if (l.optout_em) tags.push(tag("Saiu" + (l.optout_motivo ? " (" + l.optout_motivo + ")" : ""), "vermelho"));
    if (l.contato_manual_em) tags.push(tag("Contatado à mão " + ddmm(l.contato_manual_em)));
    if (l.convidado_em) tags.push(tag("Convite " + ddmm(l.convidado_em)));
    if (l.email_bloqueado_em) tags.push(tag("E-mail bloqueado: " + (l.email_bloqueado_motivo || ""), "vermelho"));
    if (l.wa_invalido_em) tags.push(tag("WhatsApp inválido", "vermelho"));
    if (l.grupo_controle) tags.push(tag("Grupo de controle", "cinza"));
    if (l.base_antiga) tags.push(tag("Base antiga", "cinza"));
    var meta = [fmtWhats(l.whatsapp), l.email, l.cidade, "cadastro " + dataHora(l.criado_em)].filter(Boolean).join(" · ");
    var acoes = "";
    if (!l.optout_em) {
      if (!l.reservou_em) {
        // Só com "pode cobrar" (regra do banco em lead_reservar; a tela espelha). Fora disso, botão desativado com o motivo.
        if (l.pode_cobrar) acoes += '<button type="button" class="primario" data-acao="reservar-form" data-id="' + l.id + '">Reservou</button>';
        else acoes += '<button type="button" class="primario" disabled title="A reserva só pode ser marcada depois do prazo legal da Circular">Reservou · ' + esc(c.texto) + '</button>';
      }
      else acoes += '<button type="button" class="discreto" data-acao="cancelar-form" data-id="' + l.id + '">Desfazer reserva</button>';
      if (!l.contato_manual_em) acoes += '<button type="button" data-acao="contato" data-id="' + l.id + '">Contatado à mão</button>';
      acoes += '<button type="button" data-acao="respondeu" data-id="' + l.id + '">Respondeu</button>';
      acoes += '<button type="button" class="discreto" data-acao="email-form" data-id="' + l.id + '">Corrigir e-mail</button>';
    }
    acoes += '<button type="button" class="discreto" data-acao="historico" data-id="' + l.id + '">' + (estado.aberto[l.id] === "historico" ? "Fechar histórico" : "Histórico") + "</button>";
    var extra = estado.aberto[l.id] === "reservar" ? formReserva(l) : estado.aberto[l.id] === "cancelar" ? formCancelar(l) : estado.aberto[l.id] === "email" ? formEmail(l) : estado.aberto[l.id] === "historico" ? '<div class="p-hist" id="hist-' + l.id + '">carregando…</div>' : "";
    var canal = '<button type="button" class="p-canal" data-acao="canal" data-id="' + l.id + '" title="Toque para ver o link de origem">' + esc(rotuloCanal(l.canal)) + "</button>";
    var canalInfo = estado.canalAberto[l.id] ? '<div class="p-canal-info">' + esc(detalheCanal(l)) + "</div>" : "";
    var temp = '<span class="p-temp ' + esc(l.temperatura || "frio") + '">' + esc(rotuloTemp(l.temperatura)) + "</span>";
    return '<article class="p-card' + (estado.novos[l.id] ? " p-novo" : "") + '" data-lead="' + l.id + '"><h3>' + esc(l.nome) + " " + canal + temp + "</h3>" + canalInfo + "<div class=\"p-meta\">" + esc(meta) + '</div><div class="p-tags">' + tags.join("") + '</div><div class="p-acoes">' + acoes + "</div>" + extra + "</article>";
  }
  function formReserva(l) {
    var ops = ""; for (var i = 1; i <= 10; i++) ops += '<option value="' + i + '">' + i + (i === 1 ? " máquina" : " máquinas") + "</option>";
    return '<form class="p-form" data-form="reservar" data-id="' + l.id + '"><label>Quantidade <select name="quantidade">' + ops + '</select></label><input name="observacao" placeholder="Observação (opcional)" maxlength="300" style="flex:1;min-width:160px"><button type="submit" class="primario">Confirmar reserva</button><button type="button" data-acao="fechar" data-id="' + l.id + '">Cancelar</button><div class="p-ajuda">Marca o lead como "reservou", soma no placar das 250 e tira a pessoa das mensagens automáticas (o lembrete da Circular continua). Registra o seu nome.</div></form>';
  }
  function formCancelar(l) {
    return '<form class="p-form" data-form="cancelar" data-id="' + l.id + '"><input name="motivo" placeholder="Motivo (opcional)" maxlength="300" style="flex:1;min-width:160px"><button type="submit" class="primario">Desfazer a reserva</button><button type="button" data-acao="fechar" data-id="' + l.id + '">Voltar</button><div class="p-ajuda">Cancela as reservas abertas deste lead e tira a marca. Os números já usados no lote não voltam.</div></form>';
  }
  function formEmail(l) {
    return '<form class="p-form" data-form="email" data-id="' + l.id + '"><input name="email" type="email" value="' + esc(l.email) + '" required style="flex:1;min-width:200px"><label><input type="checkbox" name="reenviar" ' + (l.convidado_em ? "checked" : "") + '> reenviar o convite por e-mail</label><button type="submit" class="primario">Salvar</button><button type="button" data-acao="fechar" data-id="' + l.id + '">Cancelar</button><div class="p-ajuda">O endereço antigo continua bloqueado se tiver devolvido. Fica registrado como "e-mail corrigido" com o seu nome.</div></form>';
  }

  function renderCanais(base) {
    // Filtro por canal: só os canais presentes na lista do filtro atual, com a contagem. Some se o canal filtrado sumir.
    var cs = canaisPresentes(base);
    if (estado.canal !== "todos" && !cs.some(function (c) { return c.canal === estado.canal; })) estado.canal = "todos";
    el("p-canais").innerHTML = '<button type="button" data-canal="todos" class="' + (estado.canal === "todos" ? "ativa" : "") + '">Todos os canais</button>' + cs.map(function (c) {
      return '<button type="button" data-canal="' + c.canal + '" class="' + (estado.canal === c.canal ? "ativa" : "") + '">' + esc(c.rotulo) + ' <span class="p-n">' + c.n + "</span></button>";
    }).join("");
  }
  function renderTemps(base) {
    var n = { quente: 0, morno: 0, frio: 0 }; base.forEach(function (l) { n[l.temperatura || "frio"]++; });
    el("p-temps").innerHTML = '<button type="button" data-temp="todas" class="' + (estado.temp === "todas" ? "ativa" : "") + '">Todas</button>' + TEMPS.map(function (t) {
      return '<button type="button" data-temp="' + t[0] + '" class="t-' + t[0] + (estado.temp === t[0] ? " ativa" : "") + '">' + t[1] + ' <span class="p-n">' + n[t[0]] + "</span></button>";
    }).join("");
  }
  function render() {
    var base = buscar(filtrar(estado.leads, estado.filtro), estado.busca);
    renderCanais(base);
    var porCanal = filtrarCanal(base, estado.canal);
    renderTemps(porCanal);
    var vis = ordenarTemp(filtrarTemp(porCanal, estado.temp));
    el("p-resumo").textContent = vis.length + (vis.length === 1 ? " lead" : " leads") + (estado.filtro !== "todos" || estado.canal !== "todos" || estado.temp !== "todas" ? " neste filtro" : "") + " · " + estado.leads.filter(function (l) { return !l.base_antiga; }).length + " cadastrados pela página";
    el("p-lista").innerHTML = vis.length ? vis.map(cartao).join("") : '<div class="p-vazio">Nada aqui com esse filtro.</div>';
    Object.keys(estado.aberto).forEach(function (id) { if (estado.aberto[id] === "historico") carregarHistorico(id); });
  }
  function renderAprovacoes() {
    var itens = estado.aprovacoes;
    var pend = itens.filter(function (i) { return i.status === "pendente"; });
    var b = el("p-aprov-n"); b.textContent = String(pend.length); b.classList.toggle("oculto", !pend.length);
    if (!itens.length) { el("p-aprovacoes").innerHTML = '<div class="p-vazio">Nenhum item para aprovar. Quando um texto, e-mail ou peça precisar do seu ok, ele aparece aqui e você recebe um aviso por e-mail.</div>'; return; }
    el("p-aprovacoes").innerHTML = itens.map(function (i) {
      var c = i.conteudo || {}, corpo = c.texto || c.html || JSON.stringify(c);
      var acoes = i.status === "pendente" ? '<form class="p-form" data-form="decidir" data-id="' + i.id + '"><textarea name="conteudo_final">' + esc(c.texto || "") + '</textarea><input name="comentario" placeholder="Comentário (obrigatório para recusar)" maxlength="500" style="flex:1;min-width:200px"><button type="submit" class="primario" value="aprovado">Aprovar</button><button type="submit" value="editado">Aprovar com a minha edição</button><button type="submit" value="recusado">Recusar</button></form>' : '<div class="p-meta">' + esc(i.status) + " por " + esc(i.decidido_por || "") + " em " + dataHora(i.decidido_em) + (i.comentario ? " · " + esc(i.comentario) : "") + "</div>";
      return '<article class="p-card"><h3>' + esc(i.titulo) + '</h3><div class="p-meta">' + esc(i.tipo) + " · criado " + dataHora(i.criado_em) + (i.criado_por ? " por " + esc(i.criado_por) : "") + " · aprova: " + esc(i.aprovador) + '</div><div class="p-hist" style="white-space:pre-wrap">' + esc(corpo).slice(0, 4000) + "</div>" + acoes + "</article>";
    }).join("");
  }
  function carregarHistorico(id) {
    api("eventos", { lead_id: id }).then(function (j) {
      var h = el("hist-" + id); if (!h) return;
      if (!j.ok) { h.textContent = j.erro || "erro"; return; }
      var linhas = [];
      (j.mensagens || []).forEach(function (m) { linhas.push({ em: m.criado_em, t: (m.canal === "email" ? "E-mail" : "WhatsApp") + " " + (m.direcao === "out" ? "enviado" : "recebido") + ": " + (m.modelo || m.tipo) + " · " + m.status + (m.erro ? " (" + m.erro.slice(0, 80) + ")" : "") }); });
      (j.eventos || []).forEach(function (e) { var d = e.dados || {}; linhas.push({ em: e.criado_em, t: e.tipo.replace(/_/g, " ") + (d.por ? " · " + d.por : "") + (d.quantidade ? " · " + d.quantidade + " máq." : "") + (d.motivo ? " · " + String(d.motivo).slice(0, 80) : "") }); });
      linhas.sort(function (a, b) { return a.em < b.em ? 1 : -1; });
      h.innerHTML = linhas.length ? linhas.map(function (x) { return "<div>" + esc(dataHora(x.em)) + " · " + esc(x.t) + "</div>"; }).join("") : "Sem eventos.";
    });
  }
  // Sem link válido, a página mostra só "Acesso restrito": nada de logo, abas ou dados.
  function restrito() {
    try { sessionStorage.removeItem("k_painel_t"); } catch (e) { /* ok */ }
    el("p-app").classList.add("oculto"); el("p-restrito").classList.remove("oculto");
  }
  function liberar() { el("p-restrito").classList.add("oculto"); el("p-app").classList.remove("oculto"); }

  // Atualização automática: a cada 30 s com a página visível; pausa escondida; ao voltar, atualiza na hora.
  // Se a pessoa está no meio de uma ação (formulário aberto ou digitando), espera ela terminar.
  function ocupado() {
    var f = Object.keys(estado.aberto).some(function (id) { return estado.aberto[id] !== "historico"; });
    var a = document.activeElement, dentro = a && a.closest && a.closest(".p-form");
    if (!document.querySelector(".p-form")) estado.digitando = false; // sem formulário na tela, não há o que preservar
    return f || estado.digitando || !!dentro;
  }
  function recarregar(auto) {
    if (estado.carregando) { if (!auto) estado.pendente = true; return Promise.resolve(); }
    if (auto && ocupado()) { estado.adiada = true; mostrarAtualizado(); return Promise.resolve(); }
    estado.carregando = true; estado.adiada = false;
    return Promise.all([api("quem"), api("leads"), api("aprovacoes")]).then(function (r) {
      var quem = r[0], leads = r[1], ap = r[2];
      if (!quem.ok) { if (quem._status === 401) restrito(); else if (!auto) erro(quem.erro || "Não foi possível abrir o painel."); return; }
      var antes = {}; estado.leads.forEach(function (l) { antes[l.id] = true; });
      var lista = leads.leads || [];
      if (estado.quem) { lista.forEach(function (l) { if (!antes[l.id]) estado.novos[l.id] = true; }); }
      estado.quem = quem; estado.leads = lista; estado.aprovacoes = ap.itens || [];
      el("p-nome").textContent = quem.nome; el("p-papel").textContent = quem.papel + " · " + (quem.escopo || "");
      el("p-placar-num").textContent = String(quem.placar.reservas_lote1 || 0); el("p-placar-lote").textContent = String(quem.placar.lote1_tamanho || 250);
      estado.atualizadoEm = Date.now(); estado.digitando = false;
      liberar(); erro(""); render(); renderAprovacoes(); mostrarAtualizado();
      if (Object.keys(estado.novos).length) setTimeout(function () { estado.novos = {}; document.querySelectorAll(".p-card.p-novo").forEach(function (c) { c.classList.remove("p-novo"); }); }, 6500);
    }).catch(function () { if (!auto) erro("Sem conexão com o painel. Tente de novo."); else { estado.atualizadoEm = Date.now(); mostrarAtualizado("sem conexão, tentando de novo em " + Math.round(INTERVALO / 1000) + " s"); } })
      .then(function () { estado.carregando = false; if (estado.pendente) { estado.pendente = false; return recarregar(); } });
  }
  // Contagem regressiva até a próxima atualização (pedido de 1/10). Com a página escondida o relógio para e a contagem
  // congela; ao voltar, atualiza na hora e a contagem reinicia. Esperando um formulário aberto, mostra o aviso no lugar.
  function mostrarAtualizado(extra) {
    var e = el("p-atualizado"); if (!estado.atualizadoEm) { e.textContent = ""; return; }
    if (extra) { e.textContent = extra; return; }
    if (estado.adiada) { e.textContent = "atualiza quando você terminar"; return; }
    if (estado.carregando) { e.textContent = "atualizando…"; return; }
    var falta = Math.max(0, Math.ceil((INTERVALO - (Date.now() - estado.atualizadoEm)) / 1000));
    e.textContent = "próxima atualização em " + falta + " s";
  }
  var relogio = null;
  function ligarAutomatico() {
    if (relogio) return;
    relogio = setInterval(function () { mostrarAtualizado(); if (Date.now() - estado.atualizadoEm >= INTERVALO) recarregar(true); }, 1000);
  }
  function desligarAutomatico() { if (relogio) { clearInterval(relogio); relogio = null; } }
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") { if (estado.quem) recarregar(true); ligarAutomatico(); } else desligarAutomatico();
  });
  document.addEventListener("input", function (ev) { if (ev.target.closest && ev.target.closest(".p-form")) estado.digitando = true; });

  // Ações
  document.addEventListener("click", function (ev) {
    var b = ev.target.closest("button[data-acao]"); if (!b) return;
    var id = b.getAttribute("data-id"), acao = b.getAttribute("data-acao");
    if (acao === "reservar-form") { estado.aberto[id] = "reservar"; render(); }
    else if (acao === "cancelar-form") { estado.aberto[id] = "cancelar"; render(); }
    else if (acao === "email-form") { estado.aberto[id] = "email"; render(); }
    else if (acao === "fechar") { delete estado.aberto[id]; estado.digitando = false; render(); }
    else if (acao === "canal") { if (estado.canalAberto[id]) delete estado.canalAberto[id]; else estado.canalAberto[id] = true; render(); }
    else if (acao === "historico") { if (estado.aberto[id] === "historico") delete estado.aberto[id]; else estado.aberto[id] = "historico"; render(); }
    else if (acao === "respondeu") {
      if (!confirm("Marcar que esta pessoa respondeu à mão no WhatsApp? Conta como sinal de lead quente por 7 dias. Nada é enviado.")) return;
      b.disabled = true;
      api("respondeu", { lead_id: id }).then(function (j) { if (!j.ok) erro(j.erro || "erro"); return recarregar(); });
    }
    else if (acao === "contato") {
      if (!confirm("Marcar como contatado à mão no WhatsApp? O convite automático por WhatsApp é cancelado e a pessoa entra no reaquecimento.")) return;
      b.disabled = true;
      api("contato_manual", { lead_id: id }).then(function (j) { if (!j.ok) erro(j.erro || "erro"); return recarregar(); });
    }
  });
  document.addEventListener("submit", function (ev) {
    var f = ev.target.closest("form[data-form]"); if (!f) return;
    ev.preventDefault();
    var id = f.getAttribute("data-id"), tipo = f.getAttribute("data-form"), botao = ev.submitter;
    var bs = f.querySelectorAll("button"); bs.forEach(function (x) { x.disabled = true; });
    var p;
    if (tipo === "reservar") p = api("reservar", { lead_id: id, quantidade: Number(f.quantidade.value), observacao: f.observacao.value });
    else if (tipo === "cancelar") p = api("reserva_cancelar", { lead_id: id, motivo: f.motivo.value });
    else if (tipo === "email") p = api("corrigir_email", { lead_id: id, email: f.email.value, reenviar_convite: !!f.reenviar.checked });
    else if (tipo === "decidir") {
      var decisao = botao ? botao.value : "aprovado";
      if (decisao === "recusado" && !f.comentario.value.trim()) { bs.forEach(function (x) { x.disabled = false; }); erro("Para recusar, escreva o motivo em uma linha."); return; }
      p = api("decidir", { id: Number(id), decisao: decisao, comentario: f.comentario.value, conteudo_final: decisao === "editado" ? { texto: f.conteudo_final.value } : null });
    }
    if (!p) return;
    p.then(function (j) { if (!j.ok) { erro(j.erro || "erro"); bs.forEach(function (x) { x.disabled = false; }); return; } delete estado.aberto[id]; erro(""); return recarregar(); });
  });
  el("p-filtros").addEventListener("click", function (ev) {
    var b = ev.target.closest("button[data-filtro]"); if (!b) return;
    estado.filtro = b.getAttribute("data-filtro");
    el("p-filtros").querySelectorAll("button").forEach(function (x) { x.classList.toggle("ativa", x === b); });
    render();
  });
  el("p-temps").addEventListener("click", function (ev) {
    var b = ev.target.closest("button[data-temp]"); if (!b) return;
    estado.temp = b.getAttribute("data-temp"); render();
  });
  el("p-canais").addEventListener("click", function (ev) {
    var b = ev.target.closest("button[data-canal]"); if (!b) return;
    estado.canal = b.getAttribute("data-canal"); render();
  });
  el("p-abas").addEventListener("click", function (ev) {
    var b = ev.target.closest("button[data-aba]"); if (!b) return;
    estado.aba = b.getAttribute("data-aba");
    el("p-abas").querySelectorAll("button").forEach(function (x) { x.classList.toggle("ativa", x === b); });
    el("aba-leads").classList.toggle("oculto", estado.aba !== "leads"); el("aba-aprovacoes").classList.toggle("oculto", estado.aba !== "aprovacoes");
  });
  el("p-busca").addEventListener("input", function () { estado.busca = this.value; render(); });

  if (!token) restrito();
  else recarregar().then(function () { if (document.visibilityState === "visible") ligarAutomatico(); });
})();
