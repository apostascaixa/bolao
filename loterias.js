/* Faixa rotativa com os resultados das loterias da Caixa.
   Entra logo abaixo do carrossel (.carrossel) e nunca derruba o resto do site:
   se algo falhar, a faixa simplesmente não aparece. */
(function () {
  "use strict";

  var LOTERIAS = [
    ["megasena", "Mega-Sena"], ["lotofacil", "Lotofácil"], ["quina", "Quina"],
    ["lotomania", "Lotomania"], ["timemania", "Timemania"], ["duplasena", "Dupla Sena"],
    ["diadesorte", "Dia de Sorte"], ["supersete", "Super Sete"], ["maismilionaria", "+Milionária"]
  ];
  var URL_FUNCAO = "/.netlify/functions/loterias";
  var URL_COMUNIDADE = "https://loteriascaixa-api.herokuapp.com/api/";
  var CACHE = "lt_resultados_v1";
  var INTERVALO = 4000; // tempo entre cards, em milissegundos

  var secao = null, faixa = null, timer = null;
  var hover = false, pausadoAte = 0, semCarrossel = false, pendente = false;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function moeda(v) {
    var n = Number(v);
    if (!isFinite(n) || n <= 0) return "";
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }
  function bolas(lista, extra) {
    if (!lista || !lista.length) return "";
    return '<div class="lt-dezenas' + (extra ? " " + extra : "") + '">' +
      lista.map(function (n) { return "<span>" + esc(n) + "</span>"; }).join("") + "</div>";
  }

  function card(d) {
    var info = [d.acumulou ? "🔥 Acumulou!" : "✅ Teve ganhador"];
    if (d.extra) info.push(esc(d.extra));
    var prox = moeda(d.proximo);
    if (prox) info.push("Próximo prêmio: " + prox);
    return '<article class="lt-card lt-' + esc(d.slug) + '">' +
      "<h3>" + esc(d.nome) + "</h3>" +
      "<small>Concurso " + esc(d.concurso) + " • " + esc(d.data) + "</small>" +
      bolas(d.dezenas) + bolas(d.dezenas2, "segundo") +
      '<div class="lt-info">' + info.join("<br>") + "</div></article>";
  }

  /* ---------- rotação ---------- */
  function mover(dir) {
    if (!faixa || faixa.children.length < 2) return;
    var passo = faixa.children[1].offsetLeft - faixa.children[0].offsetLeft;
    var max = faixa.scrollWidth - faixa.clientWidth;
    if (passo <= 0 || max <= 4) return;
    var alvo = (Math.round(faixa.scrollLeft / passo) + dir) * passo;
    if (dir > 0 && faixa.scrollLeft >= max - 4) alvo = 0;
    if (dir < 0 && faixa.scrollLeft <= 4) alvo = max;
    alvo = Math.max(0, Math.min(max, alvo));
    try { faixa.scrollTo({ left: alvo, behavior: "smooth" }); } catch (e) { faixa.scrollLeft = alvo; }
  }
  function tick() {
    if (document.hidden || hover || Date.now() < pausadoAte) return;
    mover(1);
  }
  function iniciarRotacao() {
    clearInterval(timer);
    if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    timer = setInterval(tick, INTERVALO);
  }

  /* ---------- montagem e posição (logo abaixo do carrossel) ---------- */
  function criarSecao() {
    secao = document.createElement("section");
    secao.className = "lt-secao";
    secao.hidden = true;
    secao.setAttribute("aria-label", "Resultados das loterias da Caixa");
    secao.innerHTML =
      '<div class="lt-topo"><h2 class="lt-titulo">🍀 Últimos resultados</h2>' +
      '<div class="lt-setas">' +
      '<button type="button" class="lt-seta" data-dir="-1" aria-label="Anterior">‹</button>' +
      '<button type="button" class="lt-seta" data-dir="1" aria-label="Próximo">›</button></div></div>' +
      '<div class="lt-faixa" tabindex="0"></div>';
    faixa = secao.querySelector(".lt-faixa");
    secao.addEventListener("mouseenter", function () { hover = true; });
    secao.addEventListener("mouseleave", function () { hover = false; });
    ["touchstart", "pointerdown", "focusin"].forEach(function (ev) {
      secao.addEventListener(ev, function () { pausadoAte = Date.now() + 8000; });
    });
    secao.addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest(".lt-seta") : null;
      if (b) mover(Number(b.getAttribute("data-dir")));
    });
  }

  function garantir() {
    pendente = false;
    if (!secao) return;
    var carr = document.querySelector(".carrossel");
    if (carr && carr.parentNode) {
      if (secao.previousElementSibling !== carr) carr.parentNode.insertBefore(secao, carr.nextSibling);
    } else if (semCarrossel) {
      var topo = document.getElementById("topo-site");
      if (topo && topo.parentNode && secao.previousElementSibling !== topo) {
        topo.parentNode.insertBefore(secao, topo.nextSibling);
      }
    }
  }
  function agendar() {
    if (pendente) return;
    pendente = true;
    (window.requestAnimationFrame || setTimeout)(garantir);
  }

  function render(lista) {
    faixa.innerHTML = lista.map(card).join("");
    faixa.scrollLeft = 0;
    secao.hidden = false;
    iniciarRotacao();
    garantir();
  }

  /* ---------- dados ---------- */
  function lerCache() {
    try {
      var c = JSON.parse(localStorage.getItem(CACHE) || "null");
      return c && Array.isArray(c.lista) && c.lista.length ? c.lista : null;
    } catch (e) { return null; }
  }
  function salvarCache(lista) {
    try { localStorage.setItem(CACHE, JSON.stringify({ t: Date.now(), lista: lista })); } catch (e) {}
  }
  function deComunidade(slug, nome, d) {
    if (!d || !d.dezenas) return null;
    return { slug: slug, nome: nome, concurso: d.concurso, data: d.data, dezenas: d.dezenas,
             acumulou: !!d.acumulou, proximo: d.valorEstimadoProximoConcurso };
  }
  function pegarFuncao() {
    return fetch(URL_FUNCAO, { cache: "no-cache" })
      .then(function (r) { if (!r.ok) throw new Error("função indisponível"); return r.json(); })
      .then(function (l) { if (!Array.isArray(l) || !l.length) throw new Error("vazio"); return l; });
  }
  function pegarComunidade() {
    return Promise.all(LOTERIAS.map(function (it) {
      return fetch(URL_COMUNIDADE + it[0] + "/latest")
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) { return deComunidade(it[0], it[1], d); })
        .catch(function () { return null; });
    })).then(function (l) {
      l = l.filter(Boolean);
      if (!l.length) throw new Error("vazio");
      return l;
    });
  }

  function iniciar() {
    try {
      criarSecao();
      var antigo = lerCache();
      if (antigo) render(antigo); // mostra o último resultado salvo enquanto atualiza
      new MutationObserver(agendar).observe(document.body, { childList: true, subtree: true });
      setTimeout(function () { semCarrossel = true; garantir(); }, 5000);
      pegarFuncao().catch(pegarComunidade).then(function (lista) {
        salvarCache(lista);
        render(lista);
      }).catch(function () { /* sem dados novos: segue com o cache, se houver */ });
    } catch (e) { /* nunca quebrar o site */ }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
