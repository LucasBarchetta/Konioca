// Konioca · painel da Fase A. Fala só com a painel-api, com o link assinado do aprovador (?t=...).
(function () {
  var API = (window.KONIOCA_API || "").replace(/\/$/, "");
  var TZ = "America/Sao_Paulo";
  var q = new URLSearchParams(location.search);
  var token = q.get("t") || "";
  try { if (token) sessionStorage.setItem("k_painel_t", token); else token = sessionStorage.getItem("k_painel_t") || ""; } catch (e) { /* sem storage */ }
  if (q.get("t")) { try { history.replaceState(null, "", location.pathname); } catch (e) { /* ok */ } }

  var estado = { quem: null, leads: [], filtro: "todos", busca: "", aba: "leads", aberto: {}, aprovacoes: [] };
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
      if (!l.reservou_em) acoes += '<button type="button" class="primario" data-acao="reservar-form" data-id="' + l.id + '">Reservou</button>';
      else acoes += '<button type="button" class="discreto" data-acao="cancelar-form" data-id="' + l.id + '">Desfazer reserva</button>';
      if (!l.contato_manual_em) acoes += '<button type="button" data-acao="contato" data-id="' + l.id + '">Contatado à mão</button>';
      acoes += '<button type="button" class="discreto" data-acao="email-form" data-id="' + l.id + '">Corrigir e-mail</button>';
    }
    acoes += '<button type="button" class="discreto" data-acao="historico" data-id="' + l.id + '">' + (estado.aberto[l.id] ? "Fechar histórico" : "Histórico") + "</button>";
    var extra = estado.aberto[l.id] === "reservar" ? formReserva(l) : estado.aberto[l.id] === "cancelar" ? formCancelar(l) : estado.aberto[l.id] === "email" ? formEmail(l) : estado.aberto[l.id] === "historico" ? '<div class="p-hist" id="hist-' + l.id + '">carregando…</div>' : "";
    return '<article class="p-card" data-lead="' + l.id + '"><h3>' + esc(l.nome) + "</h3><div class=\"p-meta\">" + esc(meta) + '</div><div class="p-tags">' + tags.join("") + '</div><div class="p-acoes">' + acoes + "</div>" + extra + "</article>";
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

  function render() {
    var vis = buscar(filtrar(estado.leads, estado.filtro), estado.busca);
    el("p-resumo").textContent = vis.length + (vis.length === 1 ? " lead" : " leads") + (estado.filtro !== "todos" ? " neste filtro" : "") + " · " + estado.leads.filter(function (l) { return !l.base_antiga; }).length + " cadastrados pela página";
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
  function recarregar() {
    return Promise.all([api("quem"), api("leads"), api("aprovacoes")]).then(function (r) {
      var quem = r[0], leads = r[1], ap = r[2];
      if (!quem.ok) { erro(quem.erro === "link inválido ou vencido" ? "Este link não é válido ou foi renovado. Peça um link novo." : (quem.erro || "Não foi possível abrir o painel.")); return; }
      estado.quem = quem; estado.leads = leads.leads || []; estado.aprovacoes = ap.itens || [];
      el("p-nome").textContent = quem.nome; el("p-papel").textContent = quem.papel + " · " + (quem.escopo || "");
      el("p-placar-num").textContent = String(quem.placar.reservas_lote1 || 0); el("p-placar-lote").textContent = String(quem.placar.lote1_tamanho || 250);
      erro(""); render(); renderAprovacoes();
    }).catch(function () { erro("Sem conexão com o painel. Tente de novo."); });
  }

  // Ações
  document.addEventListener("click", function (ev) {
    var b = ev.target.closest("button[data-acao]"); if (!b) return;
    var id = b.getAttribute("data-id"), acao = b.getAttribute("data-acao");
    if (acao === "reservar-form") { estado.aberto[id] = "reservar"; render(); }
    else if (acao === "cancelar-form") { estado.aberto[id] = "cancelar"; render(); }
    else if (acao === "email-form") { estado.aberto[id] = "email"; render(); }
    else if (acao === "fechar") { delete estado.aberto[id]; render(); }
    else if (acao === "historico") { if (estado.aberto[id] === "historico") delete estado.aberto[id]; else estado.aberto[id] = "historico"; render(); }
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
  el("p-abas").addEventListener("click", function (ev) {
    var b = ev.target.closest("button[data-aba]"); if (!b) return;
    estado.aba = b.getAttribute("data-aba");
    el("p-abas").querySelectorAll("button").forEach(function (x) { x.classList.toggle("ativa", x === b); });
    el("aba-leads").classList.toggle("oculto", estado.aba !== "leads"); el("aba-aprovacoes").classList.toggle("oculto", estado.aba !== "aprovacoes");
  });
  el("p-busca").addEventListener("input", function () { estado.busca = this.value; render(); });

  if (!token) { erro("Abra o painel pelo seu link pessoal (enviado por e-mail)."); el("p-papel").textContent = "sem acesso"; }
  else recarregar();
})();
