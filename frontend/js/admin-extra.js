/** Telas do administrador: aprovações de pagamento e configurações (PIX, banner do topo, carrossel). */
(function (root) {
  'use strict';

  function chips(h, numeros) {
    return h('span', { class: 'chips' }, numeros.map(function (n) { return h('span', { class: 'chip' }, n < 10 ? '0' + n : String(n)); }));
  }

  // ---------- aprovações ----------
  function telaAprovacoes(ctx) {
    var h = ctx.UI.h, U = ctx.U;
    var todas = ctx.estado.cotasAdmin;
    var pend = todas.filter(function (c) { return c.status === 'aguardando_pagamento'; });
    var conf = todas.filter(function (c) { return c.status === 'confirmada'; });

    function agir(c, acao, extra, msg, botao) {
      ctx.executar(async function () {
        await ctx.API.chamar(acao, Object.assign({ cotaId: c.id }, extra));
        await ctx.recarregarAdmin();
        ctx.UI.aviso(msg);
        ctx.renderPainel();
      }, botao);
    }

    function cartao(c) {
      return h('article', { class: 'cartao' },
        h('div', { class: 'cartao-topo' }, h('h3', {}, c.usuario.nome + ' (@' + c.usuario.usuario + ')'), h('span', { class: 'selo rascunho' }, 'Aguardando')),
        h('p', { class: 'sub' }, c.bolaoNome + ' · ' + U.centavosParaReais(c.valorCentavos) + ' · PIX gerado em ' + U.formatarData(c.pixGeradoEm)),
        h('details', {}, h('summary', {}, 'Ver os ' + c.jogos.length + ' jogos'),
          h('ol', { class: 'jogos' }, c.jogos.map(function (j, i) { return h('li', {}, h('span', { class: 'jogo-n' }, 'Jogo ' + (i + 1)), chips(h, j)); }))),
        h('div', { class: 'acoes' },
          h('button', { class: 'primario', onclick: function (ev) {
            if (!root.confirm('Confirmar que o pagamento de ' + c.usuario.nome + ' (' + U.centavosParaReais(c.valorCentavos) + ') foi recebido?')) return;
            agir(c, 'admin.cotas.aprovar', {}, 'Participação aprovada.', ev.target);
          } }, 'Aprovar'),
          h('button', { class: 'perigo', onclick: function (ev) {
            var motivo = root.prompt('Motivo da reprovação (o participante vai ler):', 'Pagamento não identificado.');
            if (motivo === null) return;
            agir(c, 'admin.cotas.reprovar', { motivo: motivo }, 'Cota devolvida ao participante.', ev.target);
          } }, 'Reprovar')));
    }

    return h('section', {},
      h('div', { class: 'linha-titulo' }, h('h2', {}, 'Aprovações'), h('a', { class: 'botao-link', href: 'publico.html', target: '_blank', rel: 'noopener' }, 'Abrir página pública')),
      h('h3', {}, 'Aguardando aprovação (' + pend.length + ')'),
      pend.length === 0 ? h('p', { class: 'vazio' }, 'Nenhum pagamento aguardando aprovação.') : pend.map(cartao),
      h('h3', {}, 'Confirmadas (' + conf.length + ')'),
      conf.length === 0 ? h('p', { class: 'vazio' }, 'Nenhuma participação confirmada ainda.')
        : h('ul', { class: 'lista' }, conf.map(function (c) {
          return h('li', {}, h('span', { class: 'selo aberto' }, 'Confirmada'), h('span', {}, c.usuario.nome + ' · ' + c.bolaoNome + ' · ' + c.jogos.length + ' jogos'));
        })));
  }

  // ---------- configurações ----------
  function telaConfig(ctx) {
    var h = ctx.UI.h, campo = ctx.UI.campo, API = ctx.API, Img = ctx.Img;
    var cfg = ctx.estado.cfg;

    function aplicar(nova) {
      ctx.estado.cfg = nova;
      ctx.estado.pub = { topo: nova.topo, carrossel: nova.carrossel, banners: nova.banners.filter(function (b) { return b.ativo; }) };
      ctx.atualizarTopo();
    }
    function salvar(corpo, msg, botao, aoErro) {
      ctx.executar(async function () {
        aplicar(await API.chamar('admin.config.salvar', corpo));
        ctx.UI.aviso(msg);
        ctx.renderPainel();
      }, botao, aoErro);
    }
    function seletorImagem(rotulo, uso, extra, compressao) {
      return campo(rotulo, h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', onchange: function (ev) {
        var arquivo = ev.target.files[0];
        var entrada = ev.target;
        if (!arquivo) return;
        ctx.executar(async function () {
          var url = await Img.comprimir(arquivo, compressao);
          aplicar(await API.chamar('admin.imagem.enviar', Object.assign({ uso: uso, dataUrl: url }, typeof extra === 'function' ? extra() : (extra || {}))));
          ctx.UI.aviso('Imagem enviada.');
          ctx.renderPainel();
        });
        entrada.value = '';
      } }));
    }
    function removerUso(uso, rotulo) {
      return h('button', { class: 'perigo', onclick: function (ev) {
        ctx.executar(async function () {
          aplicar(await API.chamar('admin.imagem.remover', { uso: uso }));
          ctx.UI.aviso('Imagem removida.');
          ctx.renderPainel();
        }, ev.target);
      } }, rotulo);
    }

    // PIX
    var inChave = h('input', { name: 'chave', maxlength: 140, value: cfg.pix.chave });
    var inNome = h('input', { name: 'nome', maxlength: 60, value: cfg.pix.nome });
    var inCidade = h('input', { name: 'cidade', maxlength: 30, value: cfg.pix.cidade });
    var inInstr = h('textarea', { name: 'instrucoes', maxlength: 300, rows: 3 }, cfg.pix.instrucoes);
    var erroPix = h('p', { class: 'erro-form', role: 'alert' });
    var secPix = h('section', { class: 'cartao' },
      h('h3', {}, 'PIX para receber os pagamentos'),
      h('p', { class: 'sub' }, 'Informe a chave (o sistema monta o "copia e cola" com o valor da cota), envie a imagem do QR Code do seu banco, ou os dois.'),
      campo('Chave PIX', inChave, 'E-mail, telefone, CPF/CNPJ ou chave aleatória.'),
      campo('Nome do recebedor', inNome), campo('Cidade do recebedor', inCidade),
      campo('Instruções para o participante', inInstr, 'Opcional. Aparece junto do PIX.'),
      erroPix,
      h('div', { class: 'acoes' }, h('button', { class: 'primario', onclick: function (ev) {
        erroPix.textContent = '';
        salvar({ pix: { chave: inChave.value, nome: inNome.value, cidade: inCidade.value, instrucoes: inInstr.value } }, 'Dados do PIX salvos.', ev.target, function (m) { erroPix.textContent = m; });
      } }, 'Salvar dados do PIX')),
      h('h4', {}, 'QR Code do PIX'),
      cfg.pix.qrImagemId ? h('div', { class: 'previa' }, Img.elemento(cfg.pix.qrImagemId, 'QR Code do PIX', 'pix-qr-img')) : h('p', { class: 'vazio' }, 'Nenhum QR Code enviado.'),
      seletorImagem('Enviar QR Code do PIX (imagem)', 'qr', {}, { formato: 'png', larguraMax: 700 }),
      cfg.pix.qrImagemId ? removerUso('qr', 'Remover QR Code') : null);

    // banner do topo
    var inLinkTopo = h('input', { name: 'linkTopo', placeholder: 'https://', value: cfg.topo.link });
    var erroTopo = h('p', { class: 'erro-form', role: 'alert' });
    var secTopo = h('section', { class: 'cartao' },
      h('h3', {}, 'Banner do topo do site'),
      h('p', { class: 'sub' }, 'Aparece no alto de todas as telas, inclusive na página pública. Sugestão: imagem larga, por exemplo 1200 × 300.'),
      cfg.topo.imagemId ? h('div', { class: 'previa' }, Img.elemento(cfg.topo.imagemId, 'Banner do topo', 'topo-img')) : h('p', { class: 'vazio' }, 'Nenhum banner no topo.'),
      seletorImagem('Enviar banner do topo', 'topo', {}, { formato: 'jpeg', larguraMax: 1400, alturaMax: 500 }),
      campo('Link ao clicar no banner (opcional)', inLinkTopo, 'Precisa começar com https://'),
      erroTopo,
      h('div', { class: 'acoes' },
        h('button', { onclick: function (ev) { erroTopo.textContent = ''; salvar({ topo: { link: inLinkTopo.value } }, 'Link salvo.', ev.target, function (m) { erroTopo.textContent = m; }); } }, 'Salvar link'),
        cfg.topo.imagemId ? removerUso('topo', 'Remover banner do topo') : null));

    // carrossel
    var inSeg = h('input', { name: 'segundos', type: 'range', min: 2, max: 30, step: 1, value: cfg.carrossel.segundos });
    var rotSeg = h('strong', {}, cfg.carrossel.segundos + ' s');
    inSeg.addEventListener('input', function () { rotSeg.textContent = inSeg.value + ' s'; });
    var inBoloes = h('input', { type: 'checkbox', name: 'incluirBoloes', checked: cfg.carrossel.incluirBoloes });
    var secVel = h('section', { class: 'cartao' },
      h('h3', {}, 'Carrossel de banners'),
      campo('Tempo de cada banner (2 a 30 segundos)', inSeg), h('p', {}, 'Cada banner fica ', rotSeg, ' na tela.'),
      h('label', { class: 'marcar' }, inBoloes, ' Mostrar os bolões abertos no carrossel'),
      h('div', { class: 'acoes' }, h('button', { class: 'primario', onclick: function (ev) {
        salvar({ carrossel: { segundos: Number(inSeg.value), incluirBoloes: inBoloes.checked } }, 'Carrossel atualizado.', ev.target);
      } }, 'Salvar carrossel')));

    var tituloNovo = h('input', { name: 'tituloNovo', maxlength: 80 });
    var linkNovo = h('input', { name: 'linkNovo', placeholder: 'https://' });
    var lista = cfg.banners.length === 0 ? h('p', { class: 'vazio' }, 'Nenhum banner adicionado.')
      : h('ul', { class: 'banners' }, cfg.banners.map(function (b, i) {
        var t = h('input', { value: b.titulo, maxlength: 80, 'aria-label': 'Título do banner ' + (i + 1) });
        var l = h('input', { value: b.link, placeholder: 'https://', 'aria-label': 'Link do banner ' + (i + 1) });
        var a = h('input', { type: 'checkbox', checked: b.ativo, 'aria-label': 'Banner ' + (i + 1) + ' ativo' });
        var erro = h('p', { class: 'erro-form', role: 'alert' });
        function acao(nome, corpo, msg, botao) {
          ctx.executar(async function () {
            aplicar(await API.chamar(nome, Object.assign({ id: b.id }, corpo)));
            if (msg) ctx.UI.aviso(msg);
            ctx.renderPainel();
          }, botao, function (m) { erro.textContent = m; });
        }
        return h('li', { class: 'banner-item' },
          h('div', { class: 'miniatura' }, Img.elemento(b.imagemId, b.titulo || 'Banner ' + (i + 1), 'car-img')),
          h('div', { class: 'banner-campos' }, t, l, h('label', { class: 'marcar' }, a, ' Ativo'), erro,
            h('div', { class: 'acoes' },
              h('button', { 'aria-label': 'Subir banner ' + (i + 1), disabled: i === 0, onclick: function (ev) { acao('admin.banners.mover', { direcao: 'cima' }, '', ev.target); } }, '↑'),
              h('button', { 'aria-label': 'Descer banner ' + (i + 1), disabled: i === cfg.banners.length - 1, onclick: function (ev) { acao('admin.banners.mover', { direcao: 'baixo' }, '', ev.target); } }, '↓'),
              h('button', { onclick: function (ev) { erro.textContent = ''; acao('admin.banners.atualizar', { titulo: t.value, link: l.value, ativo: a.checked }, 'Banner salvo.', ev.target); } }, 'Salvar'),
              h('button', { class: 'perigo', onclick: function (ev) {
                if (root.confirm('Remover este banner?')) acao('admin.banners.remover', {}, 'Banner removido.', ev.target);
              } }, 'Remover'))));
      }));
    var secBanners = h('section', { class: 'cartao' },
      h('h3', {}, 'Banners do carrossel (até 10)'),
      h('p', { class: 'sub' }, 'Passam junto com os bolões. Sugestão: imagem larga, por exemplo 1200 × 400.'),
      lista,
      h('h4', {}, 'Adicionar banner'),
      campo('Título (opcional)', tituloNovo), campo('Link (opcional)', linkNovo),
      seletorImagem('Escolher imagem do banner', 'banner', function () { return { titulo: tituloNovo.value, link: linkNovo.value }; }, { formato: 'jpeg', larguraMax: 1280, alturaMax: 600 }));

    var urlPublica = root.location.origin + root.location.pathname.replace(/[^/]*$/, '') + 'publico.html';
    var secPublica = h('section', { class: 'cartao' },
      h('h3', {}, 'Página pública dos jogos'),
      h('p', { class: 'sub' }, 'Mostra os jogos dos participantes aprovados (com nome abreviado). Compartilhe este link:'),
      h('input', { class: 'codigo', readonly: true, 'aria-label': 'Link da página pública', value: urlPublica }),
      h('div', { class: 'acoes' }, h('button', { onclick: function () { ctx.UI.copiar(urlPublica); } }, 'Copiar link'),
        h('a', { class: 'botao-link', href: 'publico.html', target: '_blank', rel: 'noopener' }, 'Abrir')));

    return h('section', {}, h('h2', {}, 'Configurações'), secPix, secTopo, secVel, secBanners, secPublica);
  }

  root.BolaoAdmin = { telaAprovacoes: telaAprovacoes, telaConfig: telaConfig };
})(window);
