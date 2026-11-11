/** Tela do administrador: propagandas (faixa, coluna da direita, rodapé) e fonte dos resultados das loterias. */
(function (root) {
  'use strict';

  var ESPACOS = [
    { id: 'navbar', titulo: 'Faixa abaixo do banner do topo', dica: 'Aparece em todas as telas, logo abaixo do banner do topo. Sugestão de imagem: larga, como 1200 × 200.',
      compressao: { formato: 'jpeg', larguraMax: 1400, alturaMax: 300 } },
    { id: 'lateral', titulo: 'Coluna da direita', dica: 'Aparece ao lado do conteúdo em telas grandes e abaixo dele no celular. Sugestão de imagem: vertical, como 300 × 600.',
      compressao: { formato: 'jpeg', larguraMax: 600, alturaMax: 1200 } },
    { id: 'rodape', titulo: 'Rodapé', dica: 'Aparece no fim de todas as telas. Sugestão de imagem: larga, como 1200 × 200.',
      compressao: { formato: 'jpeg', larguraMax: 1400, alturaMax: 300 } }
  ];

  function telaPropagandas(ctx) {
    var h = ctx.UI.h, campo = ctx.UI.campo, API = ctx.API, Img = ctx.Img;
    var cfg = ctx.estado.cfg;

    function aplicar(nova) {
      ctx.estado.cfg = nova;
      ctx.estado.pub = { topo: nova.topo, carrossel: nova.carrossel, slots: nova.slots, loterias: { ativo: nova.loterias.ativo },
        banners: nova.banners.filter(function (b) { return b.ativo; }) };
      ctx.atualizarTopo();
    }
    function salvar(corpo, msg, botao, aoErro) {
      ctx.executar(async function () {
        aplicar(await API.chamar('admin.config.salvar', corpo));
        ctx.UI.aviso(msg);
        ctx.renderPainel();
      }, botao, aoErro);
    }

    // ----- resultados das loterias -----
    var inAtivo = h('input', { type: 'checkbox', name: 'lotAtivo', checked: cfg.loterias.ativo });
    var inBase = h('input', { name: 'lotBase', maxlength: 200, placeholder: cfg.loterias.apiPadrao, value: cfg.loterias.apiBase });
    var erroLot = h('p', { class: 'erro-form', role: 'alert' });
    var saidaTeste = h('ul', { class: 'lista' });
    var secLot = h('section', { class: 'cartao' },
      h('h3', {}, 'Resultados das loterias'),
      h('p', { class: 'sub' }, 'Mostra o último sorteio da Mega-Sena, Lotofácil e Quina (dezenas e número de ganhadores) na coluna da esquerda e numa faixa rotativa no topo. O servidor busca os dados numa API pública e guarda por 30 minutos.'),
      h('label', { class: 'marcar' }, inAtivo, ' Mostrar resultados no site'),
      campo('Endereço da fonte (API)', inBase, 'Deixe vazio para usar a fonte padrão. Precisa começar com https://. Se a sua API tem o nome da loteria no meio do endereço, escreva {loteria} nesse ponto (o sistema troca por megasena, lotofacil e quina).'),
      erroLot,
      h('div', { class: 'acoes' },
        h('button', { class: 'primario', onclick: function (ev) {
          erroLot.textContent = '';
          salvar({ loterias: { ativo: inAtivo.checked, apiBase: inBase.value } }, 'Resultados das loterias salvos.', ev.target, function (m) { erroLot.textContent = m; });
        } }, 'Salvar'),
        h('button', { onclick: function (ev) {
          erroLot.textContent = '';
          saidaTeste.replaceChildren(h('li', {}, 'Testando…'));
          ctx.executar(async function () {
            var r = await API.chamar('admin.loterias.testar', { apiBase: inBase.value });
            saidaTeste.replaceChildren.apply(saidaTeste, r.map(function (x) {
              return h('li', {}, x.ok
                ? x.nome + ': funcionou · concurso ' + x.concurso + ' · ' + x.dezenas + ' dezenas · ' + (x.ganhadores > 0 ? x.ganhadores + ' ganhador(es)' : 'acumulada')
                : x.nome + ': não funcionou (' + x.erro + ')');
            }));
          }, ev.target, function (m) { saidaTeste.replaceChildren(); erroLot.textContent = m; });
        } }, 'Testar fonte')),
      saidaTeste);

    // ----- espaços de propaganda -----
    function cartaoEspaco(e) {
      var s = cfg.slots[e.id];
      var selTipo = h('select', { name: 'tipo-' + e.id },
        h('option', { value: '', selected: s.tipo === '' }, 'Desativado (não mostra nada)'),
        h('option', { value: 'imagem', selected: s.tipo === 'imagem' }, 'Imagem com link'),
        h('option', { value: 'codigo', selected: s.tipo === 'codigo' }, 'Código de anúncio (script ou HTML)'));
      var inLink = h('input', { name: 'link-' + e.id, placeholder: 'https://', value: s.link });
      var inCodigo = h('textarea', { name: 'codigo-' + e.id, rows: 6, maxlength: 6000, spellcheck: 'false', class: 'codigo' }, s.codigo);
      var erro = h('p', { class: 'erro-form', role: 'alert' });
      return h('section', { class: 'cartao' },
        h('h3', {}, e.titulo),
        h('p', { class: 'sub' }, e.dica),
        campo('O que mostrar neste espaço', selTipo),
        h('h4', {}, 'Imagem'),
        s.imagemId ? h('div', { class: 'previa' }, Img.elemento(s.imagemId, e.titulo, 'topo-img')) : h('p', { class: 'vazio' }, 'Nenhuma imagem enviada.'),
        campo('Link ao clicar na imagem (opcional)', inLink, 'Precisa começar com https://. Preencha antes de enviar a imagem ou use o botão Salvar depois.'),
        campo('Enviar imagem', h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', onchange: function (ev) {
          var arquivo = ev.target.files[0];
          var entrada = ev.target;
          if (!arquivo) return;
          erro.textContent = '';
          ctx.executar(async function () {
            var url = await Img.comprimir(arquivo, e.compressao);
            aplicar(await API.chamar('admin.imagem.enviar', { uso: 'slot_' + e.id, dataUrl: url, link: inLink.value }));
            ctx.UI.aviso('Imagem enviada e espaço ligado em modo imagem.');
            ctx.renderPainel();
          }, null, function (m) { erro.textContent = m; });
          entrada.value = '';
        } })),
        s.imagemId ? h('button', { class: 'perigo', onclick: function (ev) {
          ctx.executar(async function () {
            aplicar(await API.chamar('admin.imagem.remover', { uso: 'slot_' + e.id }));
            ctx.UI.aviso('Imagem removida.');
            ctx.renderPainel();
          }, ev.target);
        } }, 'Remover imagem') : null,
        h('h4', {}, 'Código de anúncio'),
        campo('Cole aqui o código fornecido pela rede de anúncios (até 6000 caracteres)', inCodigo,
          'O código roda isolado, dentro de um quadro seguro: ele não enxerga a página nem o login dos participantes. Alguns provedores de anúncio não funcionam nesse modo.'),
        erro,
        h('div', { class: 'acoes' }, h('button', { class: 'primario', onclick: function (ev) {
          erro.textContent = '';
          salvar({ slots: (function () { var o = {}; o[e.id] = { tipo: selTipo.value, link: inLink.value, codigo: inCodigo.value }; return o; })() },
            'Propaganda salva.', ev.target, function (m) { erro.textContent = m; });
        } }, 'Salvar este espaço')));
    }

    return h('section', {},
      h('h2', {}, 'Propagandas e resultados'),
      h('p', { class: 'sub' }, 'O banner do topo e o carrossel de banners continuam em Configurações.'),
      secLot, ESPACOS.map(cartaoEspaco));
  }

  root.BolaoAdmin = Object.assign(root.BolaoAdmin || {}, { telaPropagandas: telaPropagandas });
})(window);
