// Konioca · painel da Fase A. Fala só com a painel-api, com o link assinado do aprovador (?t=...).
(function () {
  var API = (window.KONIOCA_API || "").replace(/\/$/, "");
  var TZ = "America/Sao_Paulo";
  var q = new URLSearchParams(location.search);
  var token = q.get("t") || "";
  try { if (token) sessionStorage.setItem("k_painel_t", token); else token = sessionStorage.getItem("k_painel_t") || ""; } catch (e) { /* sem storage */ }
  if (q.get("t")) { try { history.replaceState(null, "", location.pathname); } catch (e) { /* ok */ } }

  var estado = { quem: null, leads: [], filtro: "todos", canal: "todos", temp: "todas", busca: "", aba: "leads", aberto: {}, canalAberto: {}, aprovacoes: [], proporAberto: false, turmas: [], turmasFiltro: "futuras", turmaAberta: {}, turmaPessoas: {}, desempenho: null, periodo: "7d", novos: {}, atualizadoEm: 0, digitando: false, carregando: false, adiada: false };
  // Etiqueta de canal (primeiro toque, mesma gaveta da aba Desempenho: v_painel_leads.canal). Espelho de painel_regras.ts.
  var CANAIS = [["stories", "Stories"], ["bio_instagram", "Bio do Instagram"], ["bio_tiktok", "Bio do TikTok"], ["whatsapp", "WhatsApp"], ["base_p1", "E-mail base antiga P1"], ["base_p2", "E-mail base antiga P2"], ["base_p2_a", "E-mail base antiga P2 (A)"], ["base_p2_b", "E-mail base antiga P2 (B)"], ["base_p34", "E-mail base antiga P3-P4"], ["base_p34_cones", "E-mail base antiga P3-P4 (cones)"], ["base_p34_arte6", "E-mail base antiga P3-P4 (arte 6)"], ["base_email", "E-mail base antiga"], ["convite", "Convite"], ["direto", "Direto"], ["outros", "Outros"]];
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
  // Permissões do papel (vêm da painel-api em "quem"; a API recusa fora disso, aqui só esconde o botão). Sem "pode" = como antes.
  var TUDO = { ver: true, contato: true, respondeu: true, reservar: true, corrigir_email: true, turmas_editar: true, presenca: true, decidir: true, comentar: true, propor_ab: true };
  function pode(chave) { var p = (estado.quem && estado.quem.pode) || TUDO; return p[chave] === true; }
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
    if (l.encontro_inicio) tags.push(tag("Turma " + quandoTurma(l.encontro_inicio) + (l.encontro_presenca === true ? " · presente" : l.encontro_presenca === false ? " · faltou" : ""), l.encontro_presenca === true ? "verde" : l.encontro_presenca === false ? "vermelho" : "ouro"));
    else if (!l.base_antiga && !l.optout_em) tags.push(tag("Sem horário escolhido", "cinza"));
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
      if (pode("reservar")) {
        if (!l.reservou_em) {
          // Só com "pode cobrar" (regra do banco em lead_reservar; a tela espelha). Fora disso, botão desativado com o motivo.
          if (l.pode_cobrar) acoes += '<button type="button" class="primario" data-acao="reservar-form" data-id="' + l.id + '">Reservou</button>';
          else acoes += '<button type="button" class="primario" disabled title="A reserva só pode ser marcada depois do prazo legal da Circular">Reservou · ' + esc(c.texto) + '</button>';
        }
        else acoes += '<button type="button" class="discreto" data-acao="cancelar-form" data-id="' + l.id + '">Desfazer reserva</button>';
      }
      if (pode("contato") && !l.contato_manual_em) acoes += '<button type="button" data-acao="contato" data-id="' + l.id + '">Contatado à mão</button>';
      if (pode("respondeu")) acoes += '<button type="button" data-acao="respondeu" data-id="' + l.id + '">Respondeu</button>';
      if (pode("corrigir_email")) acoes += '<button type="button" class="discreto" data-acao="email-form" data-id="' + l.id + '">Corrigir e-mail</button>';
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
  // Turmas dos encontros no Google Meet (formato de 2/10).
  var DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  function quandoTurma(iso) {
    var d = new Date(iso); if (isNaN(d.getTime())) return "";
    var p = {}; new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d).forEach(function (x) { p[x.type] = x.value; });
    var wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday), hh = p.hour === "24" ? "00" : p.hour;
    return DIAS[wd] + " " + p.day + "/" + p.month + " " + Number(hh) + "h" + (p.minute === "00" ? "" : p.minute);
  }
  function isoLocalSP(iso) { // valor para <input type="datetime-local"> no fuso de SP
    var d = new Date(iso); var p = {}; new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d).forEach(function (x) { p[x.type] = x.value; });
    return p.year + "-" + p.month + "-" + p.day + "T" + (p.hour === "24" ? "00" : p.hour) + ":" + p.minute;
  }
  function spParaIso(local) { // "2026-10-15T10:00" em SP -> ISO (UTC). Brasília sem horário de verão: -03:00.
    return local ? new Date(local + ":00-03:00").toISOString() : null;
  }
  function formTurma(t) {
    var v = t || {};
    return '<form class="p-form" data-form="turma" data-id="' + (v.id || "") + '"><label>Data e hora <input name="inicio" type="datetime-local" required value="' + (v.inicio ? isoLocalSP(v.inicio) : "") + '"></label><label>Minutos <input name="duracao_min" type="number" min="10" max="120" value="' + (v.duracao_min || 30) + '" style="width:70px"></label><label>Vagas <input name="capacidade" type="number" min="1" max="500" value="' + (v.capacidade || 35) + '" style="width:70px"></label><input name="meet_link" type="url" placeholder="https://meet.google.com/xxx-yyyy-zzz" value="' + esc(v.meet_link || "") + '" style="flex:1;min-width:240px"><label><input type="checkbox" name="ativo" ' + (v.ativo === false ? "" : "checked") + '> ativa</label><button type="submit" class="primario">' + (v.id ? "Salvar" : "Criar turma") + '</button><button type="button" data-acao="turma-fechar" data-id="' + (v.id || "nova") + '">Cancelar</button><div class="p-ajuda">Horário de Brasília. Mudar a hora reagenda os lembretes de quem já escolheu. Sem link do Meet, a confirmação por e-mail fica esperando. Turma com inscritos não pode ser desativada.</div></form>';
  }
  function cartaoTurma(t) {
    var cheia = t.vagas <= 0, aberta = estado.turmaAberta[t.id];
    var tags = [tag(t.inscritos + (t.inscritos === 1 ? " inscrito" : " inscritos") + " · " + t.vagas + (t.vagas === 1 ? " vaga" : " vagas"), cheia ? "vermelho" : "verde")];
    if (t.presentes) tags.push(tag(t.presentes + (t.presentes === 1 ? " presente" : " presentes"), "verde"));
    if (t.aviso_inscritos && t.inscritos > t.aviso_inscritos && !cheia) tags.push(tag("Acima de " + t.aviso_inscritos + ": abrir a próxima", "ouro"));
    tags.push(tag(t.meet_link ? "Link do Meet ok" : "Sem link do Meet", t.meet_link ? "" : "vermelho"));
    if (!t.ativo) tags.push(tag("Desativada", "cinza"));
    var acoes = '<button type="button" data-acao="turma-pessoas" data-id="' + t.id + '">' + (aberta === "pessoas" ? "Fechar lista" : "Lista (" + t.inscritos + ")") + '</button>' + (pode("turmas_editar") ? '<button type="button" class="discreto" data-acao="turma-editar" data-id="' + t.id + '">Editar</button>' : "") + (t.meet_link ? '<a class="p-tag" href="' + esc(t.meet_link) + '" target="_blank" rel="noopener" style="align-self:center">Abrir o Meet</a>' : "");
    var extra = aberta === "editar" ? formTurma(t) : aberta === "pessoas" ? '<div class="p-hist" id="turma-pessoas-' + t.id + '">carregando…</div>' : "";
    return '<article class="p-card p-turma' + (cheia ? " cheia" : "") + (!t.ativo ? " inativa" : "") + '" data-turma="' + t.id + '"><h3>' + esc(quandoTurma(t.inicio)) + ' <span class="p-canal" style="cursor:default">' + t.duracao_min + " min</span></h3><div class=\"p-meta\">" + esc(dataHora(t.inicio)) + ' · capacidade ' + t.capacidade + '</div><div class="p-tags">' + tags.join("") + '</div><div class="p-acoes">' + acoes + "</div>" + extra + "</article>";
  }
  function renderTurmas() {
    var agora = Date.now(), lista = estado.turmas.filter(function (t) {
      var fim = new Date(t.inicio).getTime() + (t.duracao_min || 30) * 60000;
      return estado.turmasFiltro === "todas" || (estado.turmasFiltro === "futuras" ? fim >= agora : fim < agora);
    });
    var insc = lista.reduce(function (n, t) { return n + t.inscritos; }, 0), vagas = lista.reduce(function (n, t) { return n + (t.ativo ? t.vagas : 0); }, 0);
    el("p-turmas-resumo").textContent = lista.length + (lista.length === 1 ? " turma" : " turmas") + " · " + insc + " inscritos · " + vagas + " vagas";
    var bn = document.querySelector('#p-turmas-filtros button[data-acao="turma-nova"]'); if (bn) bn.classList.toggle("oculto", !pode("turmas_editar"));
    el("p-turmas").innerHTML = (estado.turmaAberta.nova ? '<article class="p-card">' + formTurma(null) + "</article>" : "") + (lista.length ? lista.map(cartaoTurma).join("") : '<div class="p-vazio">Nenhuma turma aqui.</div>');
    Object.keys(estado.turmaAberta).forEach(function (id) { if (estado.turmaAberta[id] === "pessoas") carregarPessoas(id); });
  }
  // Aba Desempenho (docs/17, parte 1): resumo, tabela por canal e disparos de e-mail. Tudo vem pronto do banco (só leitura).
  var PERIODOS = [["hoje", "Hoje"], ["7d", "Últimos 7 dias"], ["tudo", "Desde o início"]];
  function taxa(n, d) { if (!d || d <= 0) return "–"; var p = (Number(n) * 100) / Number(d); var s = p === 0 || p === 100 ? String(Math.round(p)) : (Math.round(p * 10) / 10).toFixed(1).replace(".", ","); return s + "%"; }
  function rotuloDisparo(d) {
    var p = String(d.prioridade || ""), base = p === "P3" || p === "P4" ? "P3-P4" : p || "Base antiga", v = String(d.variante || "");
    if (!v) return base;
    if (d.canal === "base_p34_cones") return base + " (cones)"; if (d.canal === "base_p34_arte6") return base + " (arte 6)";
    return base + " (" + v.toUpperCase() + ")";
  }
  function ddmmDia(dia) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dia || "")); return m ? m[3] + "/" + m[2] : ""; }
  function cartaoNumero(rotulo, valor, sub) { return '<div class="p-num"><div class="p-num-v">' + esc(valor) + '</div><div class="p-num-r">' + esc(rotulo) + (sub ? '<div class="p-num-s">' + esc(sub) + "</div>" : "") + "</div></div>"; }
  function renderDesempenho() {
    el("p-periodos").innerHTML = PERIODOS.map(function (x) { return '<button type="button" data-periodo="' + x[0] + '" class="' + (estado.periodo === x[0] ? "ativa" : "") + '">' + x[1] + "</button>"; }).join("");
    var d = estado.desempenho;
    if (!d) { el("p-desempenho").innerHTML = '<div class="p-vazio">carregando…</div>'; return; }
    var r = d.resumo || {}, pl = r.placar || {};
    var cards = cartaoNumero("visitantes novos", String(r.novos || 0), (r.visitas || 0) + " visitas") + cartaoNumero("cadastros pela página", String(r.cadastros || 0)) + cartaoNumero("taxa de cadastro", taxa(r.cadastros, r.novos), "cadastros / visitantes novos") + cartaoNumero("Circulares confirmadas", String(r.circulares || 0)) + cartaoNumero("reservas", String(r.reservas || 0)) + cartaoNumero("placar das " + (estado.quem && estado.quem.placar ? estado.quem.placar.lote1_tamanho || 250 : 250), String(pl.reservas_lote1 || 0), "pagas, desde o início");
    var canais = (d.canais || []).filter(function (c) { return c.novos || c.visitas || c.cadastros; });
    var tab = canais.length ? '<table class="p-tabela"><thead><tr><th>Canal</th><th>Visitantes</th><th>Cadastros</th><th>Taxa</th><th>Circular ok</th><th>Reservas</th><th>Taxa de reserva</th></tr></thead><tbody>' + canais.map(function (c) {
      return "<tr><td>" + esc(rotuloCanal(c.canal)) + "</td><td>" + c.novos + "</td><td>" + c.cadastros + "</td><td>" + taxa(c.cadastros, c.novos) + "</td><td>" + c.circulares + "</td><td>" + c.reservas + "</td><td>" + taxa(c.reservas, c.cadastros) + "</td></tr>";
    }).join("") + "</tbody></table>" : '<div class="p-vazio">Sem visitas nem cadastros neste período.</div>';
    var disp = d.disparos || [];
    var tabD = disp.length ? '<table class="p-tabela p-disparos"><thead><tr><th>Dia</th><th>Disparo</th><th>Enviados</th><th>Entregues</th><th>Devolvidos</th><th>Spam</th><th>Cliques</th><th>Cadastros</th><th>Taxa</th></tr></thead><tbody>' + disp.map(function (x) {
      return "<tr><td>" + ddmmDia(x.dia) + "</td><td>" + esc(rotuloDisparo(x)) + "</td><td>" + x.enviados + "</td><td>" + x.entregues + "</td><td>" + x.devolvidos + (x.enviados ? ' <span class="p-n">' + taxa(x.devolvidos, x.enviados) + "</span>" : "") + "</td><td>" + x.spam + "</td><td>" + x.cliques + "</td><td>" + x.cadastros + "</td><td>" + taxa(x.cadastros, x.entregues) + "</td></tr>";
    }).join("") + "</tbody></table>" + (d.cliques_sem_gaveta ? '<div class="p-sub" style="margin-top:6px">' + d.cliques_sem_gaveta + ' cliques de e-mail da base antiga chegaram sem a gaveta do disparo (contador anterior a 5/10) e não entram na coluna.</div>' : "") : '<div class="p-vazio">Nenhum disparo de e-mail neste período.</div>';
    el("p-desempenho").innerHTML = '<div class="p-nums">' + cards + "</div><h3 class=\"p-titulo\">Por canal (primeiro toque)</h3>" + tab + "<h3 class=\"p-titulo\">Disparos de e-mail da base antiga</h3>" + tabD + '<div class="p-sub" style="margin-top:8px">Cadastro = quem se cadastrou pela página. Contato importado da base antiga só conta quando entra pela página. Visitantes = primeira visita no navegador, só no domínio oficial. Clique = visita vinda do link do disparo; o provedor não rastreia clique.</div>';
  }
  function carregarPessoas(id) {
    api("encontro_leads", { encontro_id: Number(id) }).then(function (j) {
      var h = el("turma-pessoas-" + id); if (!h) return;
      if (!j.ok) { h.textContent = j.erro || "erro"; return; }
      if (!j.leads.length) { h.textContent = "Ninguém escolheu esta turma ainda."; return; }
      h.innerHTML = j.leads.map(function (l) {
        return '<div class="p-pessoa"><span class="p-nome">' + esc(l.nome) + "</span><span>" + esc([fmtWhats(l.whatsapp), l.cidade].filter(Boolean).join(" · ")) + "</span>" + (l.pode_cobrar ? tag("Pode cobrar", "verde") : l.circular_confirmada_em ? tag("Circular ok, prazo correndo", "cinza") : tag("Circular não confirmada", "vermelho")) + (l.reservou_em ? tag("Reservou", "ouro") : "") +
          (pode("presenca")
            ? '<button type="button" data-acao="presenca" data-id="' + l.id + '" data-turma="' + id + '" data-presente="true" class="' + (l.encontro_presenca === true ? "ativa" : "") + '">Presente</button><button type="button" data-acao="presenca" data-id="' + l.id + '" data-turma="' + id + '" data-presente="false" class="faltou ' + (l.encontro_presenca === false ? "ativa" : "") + '">Faltou</button>'
            : (l.encontro_presenca === true ? tag("Presente", "verde") : l.encontro_presenca === false ? tag("Faltou", "vermelho") : "")) + "</div>";
      }).join("");
    });
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
  var TIPOS_APROV = { texto: "Texto", email: "E-mail", whatsapp: "WhatsApp", peca: "Peça", config: "Configuração", roteiro_video: "Roteiro de vídeo", proposta_ab: "Proposta de teste A/B" };
  function formPropor() {
    if (!pode("propor_ab")) return "";
    if (!estado.proporAberto) return '<div class="p-filtros"><button type="button" data-acao="propor-abrir" class="ativa" style="background:#b04d0c;border-color:#b04d0c">Propor variação de teste A/B</button></div>';
    return '<article class="p-card"><h3>Propor variação de teste A/B</h3><form class="p-form" data-form="propor" data-id="nova"><input name="titulo" placeholder="Título curto (ex.: assunto do P3/P4 pelo preço)" maxlength="200" required style="flex:1;min-width:240px"><input name="onde" placeholder="Onde: e-mail da base, LP, WhatsApp…" maxlength="200" style="flex:1;min-width:200px"><textarea name="texto" placeholder="A variação, do jeito que sairia" maxlength="4000" required></textarea><input name="hipotese" placeholder="Hipótese: o que você espera que mude e por quê" maxlength="500" style="flex:1;min-width:240px"><label><input type="checkbox" name="usa_marcela"> usa voz ou imagem da Marcela</label><label><input type="checkbox" name="maquina_ia"> tem máquina ou produto feito por IA</label><button type="submit" class="primario">Enviar para aprovação</button><button type="button" data-acao="propor-fechar" data-id="nova">Cancelar</button><div class="p-ajuda">Vira um item pendente: aprova o Lucas ou o LG (e a Marcela, se usar a imagem dela). O revisor automático barra preço fora da página, "de/por", promessa de faturamento e máquina ou produto feito por IA. Nada é enviado a ninguém até a aprovação.</div></form></article>';
  }
  function renderAprovacoes() {
    var itens = estado.aprovacoes;
    var pend = itens.filter(function (i) { return i.status === "pendente" && i.pode_decidir; });
    var b = el("p-aprov-n"); b.textContent = String(pend.length); b.classList.toggle("oculto", !pend.length);
    var topo = formPropor();
    if (!itens.length) { el("p-aprovacoes").innerHTML = topo + '<div class="p-vazio">Nenhum item para aprovar. Quando um texto, e-mail ou peça precisar do seu ok, ele aparece aqui e você recebe um aviso por e-mail.</div>'; return; }
    el("p-aprovacoes").innerHTML = topo + itens.map(function (i) {
      var c = i.conteudo || {}, corpo = c.texto || c.html || JSON.stringify(c);
      var extra = c.onde ? "Onde: " + c.onde + (c.hipotese ? " · Hipótese: " + c.hipotese : "") : (c.hipotese ? "Hipótese: " + c.hipotese : "");
      var rev = i.revisao || { ok: true, problemas: [] };
      var trava = rev.ok ? "" : '<div class="p-tags">' + tag("Revisor automático barrou: " + rev.problemas.join("; "), "vermelho") + "</div>";
      var decs = (i.decisoes || []).map(function (d) { return "<div>" + esc(dataHora(d.em)) + " · " + esc(d.por) + ": " + esc(d.decisao) + (d.comentario ? " · " + esc(d.comentario) : "") + "</div>"; }).join("");
      var acoes;
      if (i.status !== "pendente") acoes = '<div class="p-meta">' + esc(i.status) + " por " + esc(i.decidido_por || "") + " em " + dataHora(i.decidido_em) + (i.comentario ? " · " + esc(i.comentario) : "") + "</div>";
      else if (i.pode_decidir) acoes = '<form class="p-form" data-form="decidir" data-id="' + i.id + '"><textarea name="conteudo_final">' + esc((i.conteudo_final && i.conteudo_final.texto) || c.texto || "") + '</textarea><input name="comentario" placeholder="Comentário (obrigatório para recusar)" maxlength="500" style="flex:1;min-width:200px"><button type="submit" class="primario" value="aprovado">Aprovar</button><button type="submit" value="editado">Aprovar com a minha edição</button><button type="submit" value="recusado">Recusar</button></form>';
      else acoes = '<div class="p-meta">Pendente' + (i.faltam && i.faltam.length ? " · falta: " + esc(i.faltam.join(", ")) : "") + (rev.ok ? "" : " · corrija o conteúdo antes de aprovar") + "</div>";
      var coms = (i.comentarios || []).map(function (k) { return "<div>" + esc(dataHora(k.criado_em)) + " · " + esc(k.por) + ": " + esc(k.texto) + "</div>"; }).join("");
      var formCom = pode("comentar") ? '<form class="p-form" data-form="comentar" data-id="' + i.id + '"><input name="texto" placeholder="Comentar (fica registrado com o seu nome; nada é enviado)" maxlength="1000" required style="flex:1;min-width:240px"><button type="submit">Comentar</button></form>' : "";
      return '<article class="p-card"><h3>' + esc(i.titulo) + '</h3><div class="p-meta">' + esc(TIPOS_APROV[i.tipo] || i.tipo) + (i.usa_marcela ? " · usa voz ou imagem da Marcela" : "") + " · criado " + dataHora(i.criado_em) + (i.criado_por ? " por " + esc(i.criado_por) : "") + " · aprova: " + esc(i.regra_texto || i.aprovador) + '</div>' + trava + '<div class="p-hist" style="white-space:pre-wrap">' + esc(corpo).slice(0, 4000) + (extra ? '<div class="p-meta" style="margin-top:6px">' + esc(extra) + "</div>" : "") + "</div>" + (decs ? '<div class="p-hist">' + decs + "</div>" : "") + (coms ? '<div class="p-hist">' + coms + "</div>" : "") + acoes + formCom + "</article>";
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
    return Promise.all([api("quem"), api("leads"), api("aprovacoes"), api("encontros"), api("desempenho", { periodo: estado.periodo })]).then(function (r) {
      var quem = r[0], leads = r[1], ap = r[2], enc = r[3], des = r[4];
      estado.turmas = (enc && enc.encontros) || [];
      if (des && des.ok) estado.desempenho = des;
      if (!quem.ok) { if (quem._status === 401) restrito(); else if (!auto) erro(quem.erro || "Não foi possível abrir o painel."); return; }
      var antes = {}; estado.leads.forEach(function (l) { antes[l.id] = true; });
      var lista = leads.leads || [];
      if (estado.quem) { lista.forEach(function (l) { if (!antes[l.id]) estado.novos[l.id] = true; }); }
      estado.quem = quem; estado.leads = lista; estado.aprovacoes = ap.itens || [];
      el("p-nome").textContent = quem.nome; el("p-papel").textContent = quem.papel + " · " + (quem.escopo || "");
      el("p-placar-num").textContent = String(quem.placar.reservas_lote1 || 0); el("p-placar-lote").textContent = String(quem.placar.lote1_tamanho || 250);
      estado.atualizadoEm = Date.now(); estado.digitando = false;
      liberar(); erro(""); render(); renderAprovacoes(); renderTurmas(); renderDesempenho(); mostrarAtualizado();
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
    else if (acao === "turma-nova") { estado.turmaAberta.nova = true; renderTurmas(); }
    else if (acao === "propor-abrir") { estado.proporAberto = true; renderAprovacoes(); }
    else if (acao === "propor-fechar") { estado.proporAberto = false; estado.digitando = false; renderAprovacoes(); }
    else if (acao === "turma-editar") { estado.turmaAberta[id] = "editar"; renderTurmas(); }
    else if (acao === "turma-pessoas") { if (estado.turmaAberta[id] === "pessoas") delete estado.turmaAberta[id]; else estado.turmaAberta[id] = "pessoas"; renderTurmas(); }
    else if (acao === "turma-fechar") { delete estado.turmaAberta[id]; estado.digitando = false; renderTurmas(); }
    else if (acao === "presenca") {
      b.disabled = true;
      api("presenca", { lead_id: id, presente: b.getAttribute("data-presente") === "true" }).then(function (j) { if (!j.ok) erro(j.erro || "erro"); return recarregar(); });
    }
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
    else if (tipo === "turma") {
      p = api("encontro_salvar", { id: id ? Number(id) : null, inicio: spParaIso(f.inicio.value), duracao_min: Number(f.duracao_min.value), capacidade: Number(f.capacidade.value), meet_link: f.meet_link.value.trim(), ativo: !!f.ativo.checked });
      p = p.then(function (j) { if (!j.ok) { erro(j.erro || "erro"); bs.forEach(function (x) { x.disabled = false; }); return { _tratado: true }; } delete estado.turmaAberta[id || "nova"]; estado.digitando = false; erro(""); return recarregar().then(function () { return { _tratado: true }; }); });
    }
    else if (tipo === "comentar") p = api("comentar", { id: Number(id), texto: f.texto.value });
    else if (tipo === "propor") {
      p = api("propor_ab", { titulo: f.titulo.value, onde: f.onde.value, texto: f.texto.value, hipotese: f.hipotese.value, usa_marcela: !!f.usa_marcela.checked, maquina_ia: !!f.maquina_ia.checked });
      p = p.then(function (j) { if (!j.ok) { erro(j.erro || "erro"); bs.forEach(function (x) { x.disabled = false; }); return { _tratado: true }; } estado.proporAberto = false; estado.digitando = false; erro(""); return recarregar().then(function () { return { _tratado: true }; }); });
    }
    else if (tipo === "decidir") {
      var decisao = botao ? botao.value : "aprovado";
      if (decisao === "recusado" && !f.comentario.value.trim()) { bs.forEach(function (x) { x.disabled = false; }); erro("Para recusar, escreva o motivo em uma linha."); return; }
      p = api("decidir", { id: Number(id), decisao: decisao, comentario: f.comentario.value, conteudo_final: decisao === "editado" ? { texto: f.conteudo_final.value } : null });
    }
    if (!p) return;
    p.then(function (j) { if (j && j._tratado) return; if (!j.ok) { erro(j.erro || "erro"); bs.forEach(function (x) { x.disabled = false; }); return; } delete estado.aberto[id]; erro(j.status === "pendente" && j.faltam && j.faltam.length ? "Sua decisão ficou registrada. Ainda falta: " + j.faltam.join(", ") + "." : ""); return recarregar(); });
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
  el("p-turmas-filtros").addEventListener("click", function (ev) {
    var b = ev.target.closest("button[data-tfiltro]"); if (!b) return;
    estado.turmasFiltro = b.getAttribute("data-tfiltro");
    el("p-turmas-filtros").querySelectorAll("button[data-tfiltro]").forEach(function (x) { x.classList.toggle("ativa", x === b); });
    renderTurmas();
  });
  el("p-abas").addEventListener("click", function (ev) {
    var b = ev.target.closest("button[data-aba]"); if (!b) return;
    estado.aba = b.getAttribute("data-aba");
    el("p-abas").querySelectorAll("button").forEach(function (x) { x.classList.toggle("ativa", x === b); });
    el("aba-leads").classList.toggle("oculto", estado.aba !== "leads"); el("aba-aprovacoes").classList.toggle("oculto", estado.aba !== "aprovacoes"); el("aba-turmas").classList.toggle("oculto", estado.aba !== "turmas"); el("aba-desempenho").classList.toggle("oculto", estado.aba !== "desempenho");
  });
  el("p-periodos").addEventListener("click", function (ev) {
    var b = ev.target.closest("button[data-periodo]"); if (!b) return;
    estado.periodo = b.getAttribute("data-periodo"); estado.desempenho = null; renderDesempenho();
    api("desempenho", { periodo: estado.periodo }).then(function (j) { if (j.ok) { estado.desempenho = j; renderDesempenho(); } else erro(j.erro || "erro"); });
  });
  el("p-busca").addEventListener("input", function () { estado.busca = this.value; render(); });

  if (!token) restrito();
  else recarregar().then(function () { if (document.visibilityState === "visible") ligarAutomatico(); });
})();
