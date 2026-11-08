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


    // zona de perigo: limpar dados de teste
    var painelPerigo = h('div', {});
    function abrirLimpeza(ev) {
      ev.target.disabled = true;
      ctx.executar(async function () {
        var c = await API.chamar('admin.limpeza.previa', {});
        var inFrase = h('input', { name: 'fraseLimpeza', autocomplete: 'off', placeholder: 'APAGAR TUDO' });
        var inPart = h('input', { type: 'checkbox', name: 'apagarParticipantes' });
        var erroLimpa = h('p', { class: 'erro-form', role: 'alert' });
        var btnApagar = h('button', { class: 'perigo', disabled: true, onclick: function (e2) {
          if (!root.confirm('Última confirmação: apagar ' + c.boloes + ' bolão(ões) e tudo que depende deles? Isso não pode ser desfeito.')) return;
          erroLimpa.textContent = '';
          ctx.executar(async function () {
            await API.chamar('admin.limpeza.executar', { confirmacao: inFrase.value, incluirParticipantes: inPart.checked });
            await ctx.recarregarTudo();
            ctx.UI.aviso('Dados de teste apagados.');
            ctx.renderPainel();
          }, e2.target, function (m) { erroLimpa.textContent = m; });
        } }, 'Apagar definitivamente');
        inFrase.addEventListener('input', function () { btnApagar.disabled = inFrase.value !== 'APAGAR TUDO'; });
        painelPerigo.replaceChildren(
          h('div', { class: 'aviso-reprovado', role: 'alert' },
            h('strong', {}, 'Será apagado: '),
            c.boloes + ' bolão(ões), ' + c.cotas + ' cota(s) (' + c.confirmadas + ' confirmada(s), ' + c.aguardando + ' aguardando aprovação), ' +
            c.jogos + ' jogo(s), ' + c.comprovantes + ' comprovante(s) da auditoria e ' + c.conferencias + ' consulta(s) de conferência.'),
          h('label', { class: 'marcar' }, inPart, ' Apagar também as ' + c.participantes + ' conta(s) de participantes (administradores ficam)'),
          campo('Digite APAGAR TUDO para confirmar', inFrase), erroLimpa,
          h('div', { class: 'acoes' }, btnApagar,
            h('button', { onclick: function () { painelPerigo.replaceChildren(); ev.target.disabled = false; } }, 'Cancelar')));
      }, null, function () { ev.target.disabled = false; });
    }
    var secPerigo = h('section', { class: 'cartao perigo-zona' },
      h('h3', {}, 'Limpar dados de teste'),
      h('p', { class: 'sub' }, 'Apaga todos os bolões e o que depende deles: cotas, jogos, comprovantes da auditoria e consultas de conferência. Mantém os administradores, o PIX, o QR Code, os banners e os convites ainda não usados. Não tem como desfazer.'),
      painelPerigo,
      h('div', { class: 'acoes' }, h('button', { class: 'perigo', onclick: abrirLimpeza }, 'Limpar dados de teste…')));

    return h('section', {}, h('h2', {}, 'Configurações'), secPix, secTopo, secVel, secBanners, secPublica, secPerigo);
  }


  // ---------- visualizador de imagem (comprovantes) ----------
  function abrirImagem(ctx, imagemId, titulo) {
    var h = ctx.UI.h;
    var fechar = function () { if (fundo.parentNode) fundo.parentNode.removeChild(fundo); root.removeEventListener('keydown', tecla); };
    var tecla = function (ev) { if (ev.key === 'Escape') fechar(); };
    var fundo = h('div', { class: 'visualizador', role: 'dialog', 'aria-label': titulo, onclick: fechar },
      h('button', { class: 'fechar-visualizador', onclick: fechar }, 'Fechar'),
      ctx.Img.elemento(imagemId, titulo, 'visualizador-img'));
    root.addEventListener('keydown', tecla);
    document.body.appendChild(fundo);
  }

  function lerTexto(arquivo) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { res(String(fr.result)); };
      fr.onerror = function () { rej(new Error('Não foi possível ler o arquivo.')); };
      fr.readAsText(arquivo);
    });
  }

  // ---------- auditoria ----------
  function telaAuditoria(ctx) {
    var h = ctx.UI.h, campo = ctx.UI.campo, U = ctx.U, API = ctx.API, Img = ctx.Img;
    var lista = ctx.estado.auditoria;
    if (lista.length === 0) {
      return h('section', {}, h('h2', {}, 'Auditoria do registro oficial'),
        h('p', { class: 'vazio' }, 'Nenhum bolão aberto ou fechado para auditar. Depois de abrir um bolão, ele aparece aqui.'));
    }
    var b = lista.filter(function (x) { return x.id === ctx.estado.audBolao; })[0] || lista[0];
    var comp = b.comparacao;

    function aplicar(novo) { ctx.estado.auditoria = novo; ctx.renderPainel(); }
    function chamar(acao, corpo, msg, botao, aoErro) {
      ctx.executar(async function () {
        aplicar(await API.chamar(acao, Object.assign({ bolaoId: b.id }, corpo)));
        if (msg) ctx.UI.aviso(msg);
      }, botao, aoErro);
    }

    var sel = h('select', { name: 'audBolao', onchange: function () { ctx.estado.audBolao = sel.value; ctx.renderPainel(); } },
      lista.map(function (x) { return h('option', { value: x.id, selected: x.id === b.id }, x.nome + ' (' + x.modalidadeNome + ')'); }));

    var resumo = h('div', { class: 'dados' },
      h('div', {}, h('dt', {}, 'Cotas confirmadas'), h('dd', {}, String(b.cotasConfirmadas))),
      h('div', {}, h('dt', {}, 'Jogos no sistema'), h('dd', {}, String(b.jogosNoSistema))),
      h('div', {}, h('dt', {}, 'Registro oficial'), h('dd', {}, b.registradoEm ? 'Concurso ' + b.concurso + ' (' + U.dataCurta(b.registradoEm) + ')' : 'Ainda não registrado')));

    // comprovantes
    var secComp = h('section', { class: 'cartao' },
      h('h3', {}, 'Comprovantes do registro oficial'),
      h('p', { class: 'sub' }, 'Fotos ou prints dos recibos da lotérica ou do site da CAIXA. Só o administrador vê estas imagens.'),
      b.comprovantes.length === 0 ? h('p', { class: 'vazio' }, 'Nenhum comprovante enviado.')
        : h('ul', { class: 'comprovantes' }, b.comprovantes.map(function (c, i) {
          return h('li', {},
            h('button', { class: 'miniatura-botao', 'aria-label': 'Abrir comprovante ' + (i + 1), onclick: function () { abrirImagem(ctx, c.imagemId, 'Comprovante ' + (i + 1)); } },
              Img.elemento(c.imagemId, 'Comprovante ' + (i + 1), 'car-img')),
            h('span', { class: 'sub' }, 'Enviado em ' + U.dataCurta(c.criadoEm)),
            h('button', { class: 'perigo', onclick: function (ev) {
              if (!root.confirm('Remover este comprovante?')) return;
              ctx.executar(async function () { aplicar(await API.chamar('admin.auditoria.removerEntrada', { id: c.id })); ctx.UI.aviso('Comprovante removido.'); }, ev.target);
            } }, 'Remover'));
        })),
      campo('Enviar comprovante (foto ou print)', h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', onchange: function (ev) {
        var arq = ev.target.files[0];
        var entrada = ev.target;
        if (!arq) return;
        ctx.executar(async function () {
          var url = await Img.comprimir(arq, { formato: 'jpeg', larguraMax: 1600, maxChars: 290000 });
          aplicar(await API.chamar('admin.auditoria.comprovante', { bolaoId: b.id, dataUrl: url }));
          ctx.UI.aviso('Comprovante enviado.');
        });
        entrada.value = '';
      } })));

    // jogos registrados (texto) e comparação
    var area = h('textarea', { name: 'jogosRegistrados', rows: 8, placeholder: 'A 02 15 16 26 35 39 44 56\nB 04 16 17 24 25 27 50 54' }, b.textoRegistrado);
    var erroTxt = h('p', { class: 'erro-form', role: 'alert' });
    function listaChips(titulo, jogos) {
      if (!jogos.length) return null;
      return h('div', {}, h('h4', {}, titulo + ' (' + jogos.length + ')'),
        h('ol', { class: 'jogos' }, jogos.slice(0, 20).map(function (j) {
          return h('li', {}, h('span', { class: 'chips' }, j.map(function (n) { return h('span', { class: 'chip' }, U.dezena(n)); })));
        })), jogos.length > 20 ? h('p', { class: 'sub' }, 'e mais ' + (jogos.length - 20) + '…') : null);
    }
    var secJogos = h('section', { class: 'cartao' },
      h('h3', {}, 'Jogos registrados (conferência com o sistema)'),
      h('p', { class: 'sub' }, 'Cole só as linhas dos jogos, como aparecem no comprovante, ou envie um arquivo .txt. Cada linha precisa ter exatamente ' + b.qtdNumeros + ' dezenas.'),
      campo('Jogos registrados', area),
      campo('Ou envie um arquivo de texto (.txt, .csv)', h('input', { type: 'file', accept: '.txt,.csv,text/plain', onchange: function (ev) {
        var arq = ev.target.files[0];
        if (!arq) return;
        lerTexto(arq).then(function (t) { area.value = t; }).catch(function (e) { erroTxt.textContent = e.message; });
        ev.target.value = '';
      } })),
      erroTxt,
      h('div', { class: 'acoes' }, h('button', { class: 'primario', onclick: function (ev) {
        erroTxt.textContent = '';
        chamar('admin.auditoria.jogos', { texto: area.value }, 'Jogos salvos e comparados.', ev.target, function (m) { erroTxt.textContent = m; });
      } }, 'Salvar e comparar com os jogos dos participantes')),
      comp ? h('div', { class: comp.confere ? 'destaque' : 'aviso-reprovado', role: 'status' },
        h('strong', {}, comp.confere ? 'Confere: os jogos registrados são exatamente os dos participantes. ' : 'Divergência encontrada. '),
        comp.iguais + ' de ' + b.jogosNoSistema + ' jogos do sistema aparecem no registro (' + comp.registrados + ' linhas lidas' + (comp.ignoradas ? ', ' + comp.ignoradas + ' ignoradas' : '') + ').',
        listaChips('Estão no sistema e faltam no registro', comp.faltamNoRegistro),
        listaChips('Estão no registro e não são de nenhum participante', comp.sobramNoRegistro)) : null);

    // marcar registro
    var inConc = h('input', { name: 'concurso', type: 'number', min: 1, max: 99999, step: 1, value: b.concurso || '' });
    var erroReg = h('p', { class: 'erro-form', role: 'alert' });
    var secReg = h('section', { class: 'cartao' },
      h('h3', {}, 'Registro oficial'),
      b.registradoEm ? h('p', {}, h('span', { class: 'selo aberto' }, 'Registrado'), ' no concurso ', h('strong', {}, String(b.concurso)), ' em ' + U.dataCurta(b.registradoEm) + '. A página pública mostra este selo.')
        : h('p', { class: 'sub' }, 'Depois de enviar os comprovantes, informe o concurso para marcar o bolão como registrado. Só bolões registrados entram na conferência de resultados.'),
      campo('Número do concurso', inConc), erroReg,
      h('div', { class: 'acoes' },
        h('button', { class: 'primario', onclick: function (ev) {
          erroReg.textContent = '';
          chamar('admin.auditoria.registrar', { concurso: Number(inConc.value) }, 'Bolão marcado como registrado.', ev.target, function (m) { erroReg.textContent = m; });
        } }, b.registradoEm ? 'Atualizar concurso' : 'Marcar como registrado oficialmente'),
        b.registradoEm ? h('button', { class: 'perigo', onclick: function (ev) { chamar('admin.auditoria.desregistrar', {}, 'Registro desfeito.', ev.target); } }, 'Desfazer registro') : null));

    return h('section', {}, h('h2', {}, 'Auditoria do registro oficial'), campo('Bolão', sel), resumo, secComp, secJogos, secReg);
  }

  // ---------- conferência de resultado ----------
  function telaConferencia(ctx) {
    var h = ctx.UI.h, campo = ctx.UI.campo, U = ctx.U, API = ctx.API;
    var mods = ctx.estado.modalidades;
    var selMod = h('select', { name: 'modalidadeConf' }, mods.map(function (m) { return h('option', { value: m.id }, m.nome); }));
    var inConc = h('input', { name: 'concursoConf', type: 'number', min: 1, max: 99999, step: 1 });
    var inRes = h('input', { name: 'resultadoConf', placeholder: 'Ex.: 04 12 23 33 41 56', autocomplete: 'off' });
    var previa = h('p', { class: 'volante-contador', 'aria-live': 'polite' });
    var erro = h('p', { class: 'erro-form', role: 'alert' });
    var saida = h('div', { 'aria-live': 'polite' });

    function numeros() { return (inRes.value.match(/\d{1,2}/g) || []).map(Number); }
    function atual() { return mods.filter(function (m) { return m.id === selMod.value; })[0]; }
    function atualizarPrevia() {
      var n = numeros();
      var m = atual();
      previa.textContent = n.length + ' de ' + (m ? m.sorteados : '?') + ' dezenas' + (n.length ? ': ' + n.map(U.dezena).join(' · ') : '');
    }
    inRes.addEventListener('input', atualizarPrevia);
    selMod.addEventListener('change', atualizarPrevia);
    atualizarPrevia();

    function chipsHit(jogo, acertados) {
      return h('span', { class: 'chips' }, jogo.map(function (n) {
        return h('span', { class: 'chip' + (acertados.indexOf(n) !== -1 ? ' acerto' : ' erro') }, U.dezena(n));
      }));
    }

    function mostrar(r) {
      var blocos = [
        h('div', { class: r.totalPremiados > 0 ? 'destaque' : 'nota', role: 'status' },
          h('strong', {}, r.totalPremiados > 0 ? r.totalPremiados + ' jogo(s) premiado(s)! ' : 'Nenhum jogo premiado nos bolões registrados. '),
          'Concurso ' + r.concurso + ' · ' + r.modalidadeNome + ' · resultado: ', h('span', { class: 'chips' }, r.resultado.map(function (n) { return h('span', { class: 'chip' }, U.dezena(n)); })))
      ];
      if (r.boloes.length === 0) {
        blocos.push(h('p', { class: 'vazio' }, 'Nenhum bolão de ' + r.modalidadeNome + ' está registrado para o concurso ' + r.concurso + '. Marque o registro na aba Auditoria.'));
      }
      r.boloes.forEach(function (b) {
        var faixas = Object.keys(b.faixas).map(function (k) { return k + ' ×' + b.faixas[k]; }).join(' · ');
        blocos.push(h('article', { class: 'cartao' },
          h('h3', {}, b.nome),
          h('p', { class: 'sub' }, b.jogosConferidos + ' jogos conferidos de ' + b.cotas + (b.cotas === 1 ? ' cota' : ' cotas') + ' · melhor acerto: ' + b.melhorAcerto + (faixas ? ' · ' + faixas : '')),
          b.divergencias === null ? h('p', { class: 'nota' }, 'Sem a lista de jogos registrados na lotérica: a conferência usou os jogos do sistema.')
            : (b.divergencias > 0 ? h('p', { class: 'aviso-reprovado' }, 'Atenção: os jogos registrados na lotérica divergem dos jogos do sistema. Veja a aba Auditoria.') : null),
          b.premiados.length === 0 ? h('p', { class: 'vazio' }, 'Nenhum jogo premiado neste bolão.')
            : h('ol', { class: 'jogos' }, b.premiados.map(function (p) {
              return h('li', {}, h('span', { class: 'jogo-n' }, p.participante + ' · jogo ' + p.letra), chipsHit(p.numeros, p.acertados),
                h('span', { class: 'selo aberto' }, p.premios.map(function (x) { return x.nome + (x.quantidade > 1 ? ' ×' + x.quantidade : ''); }).join(' + ')));
            }))));
      });
      if (r.naoRegistrados.length) {
        blocos.push(h('p', { class: 'sub' }, 'Não entraram na conferência: ' + r.naoRegistrados.map(function (n) {
          return n.nome + (n.registrado ? ' (registrado no concurso ' + n.concurso + ')' : ' (sem registro oficial)');
        }).join('; ') + '.'));
      }
      saida.replaceChildren.apply(saida, blocos);
    }

    function histLista() {
      var hs = ctx.estado.historicoConf;
      if (hs.length === 0) return h('p', { class: 'vazio' }, 'Nenhuma consulta feita ainda.');
      return h('ul', { class: 'lista' }, hs.map(function (c) {
        return h('li', {}, h('span', { class: 'selo ' + (c.premiados > 0 ? 'aberto' : '') }, c.premiados > 0 ? c.premiados + ' premiado(s)' : 'sem prêmio'),
          h('span', {}, c.modalidadeNome + ' · concurso ' + c.concurso + ' · ' + c.resultado.map(U.dezena).join(' ') + ' · ' + U.dataHora(c.criadoEm)));
      }));
    }
    var histBox = h('div', {}, histLista());

    return h('section', {},
      h('h2', {}, 'Conferência de resultado'),
      h('p', { class: 'sub' }, 'Informe o concurso e as dezenas do resultado oficial. A pesquisa confere os jogos dos bolões registrados para aquele concurso.'),
      h('div', { class: 'cartao' },
        campo('Modalidade', selMod), campo('Número do concurso', inConc),
        campo('Resultado oficial (dezenas sorteadas)', inRes, 'Digite as dezenas separadas por espaço.'),
        previa,
        h('a', { class: 'botao-link', href: 'https://loterias.caixa.gov.br/', target: '_blank', rel: 'noopener noreferrer' }, 'Ver o resultado no site da CAIXA'),
        erro,
        h('div', { class: 'acoes' }, h('button', { class: 'primario', onclick: function (ev) {
          erro.textContent = '';
          ctx.executar(async function () {
            var r = await API.chamar('admin.conferencia.consultar', { modalidade: selMod.value, concurso: Number(inConc.value), resultado: numeros() });
            mostrar(r);
            ctx.estado.historicoConf = await API.chamar('admin.conferencia.historico', {});
            histBox.replaceChildren(histLista());
          }, ev.target, function (m) { erro.textContent = m; });
        } }, 'Pesquisar nos bolões registrados'))),
      saida,
      h('h3', {}, 'Consultas anteriores'),
      histBox);
  }

  root.BolaoAdmin = { telaAprovacoes: telaAprovacoes, telaConfig: telaConfig, telaAuditoria: telaAuditoria, telaConferencia: telaConferencia };
})(window);
