/** Seção "Relógio de contagem regressiva" na aba Configurações do administrador (se encaixa sem mexer no admin-extra.js). */
(function (root) {
  'use strict';
  var PADRAO = { titulo: 'MEGA SENA DA VIRADA +R$1 BILHÃO', dataLocal: '2027-01-01T11:00' };

  function secao(ctx) {
    var h = ctx.UI.h, campo = ctx.UI.campo, API = ctx.API;
    var inAtivo = h('input', { type: 'checkbox', name: 'contagemAtiva', disabled: true });
    var inTitulo = h('input', { name: 'contagemTitulo', maxlength: 80, disabled: true });
    var inData = h('input', { name: 'contagemData', type: 'datetime-local', disabled: true });
    var erro = h('p', { class: 'erro-form', role: 'alert' });
    var botoes = [];

    function habilitar() { [inAtivo, inTitulo, inData].concat(botoes).forEach(function (e) { e.disabled = false; }); }
    function preencher(c) {
      inAtivo.checked = c.ativo !== false;
      inTitulo.value = c.titulo || '';
      inData.value = String(c.data || '').substring(0, 16); // a data é sempre gravada no horário de Brasília
      habilitar();
    }

    var btnSalvar = h('button', { class: 'primario', disabled: true, onclick: function (ev) {
      erro.textContent = '';
      ctx.executar(async function () {
        preencher(await API.chamar('admin.contagem.salvar', { ativo: inAtivo.checked, titulo: inTitulo.value, dataLocal: inData.value }));
        ctx.UI.aviso('Relógio atualizado.');
      }, ev.target, function (m) { erro.textContent = m; });
    } }, 'Salvar relógio');
    var btnPadrao = h('button', { type: 'button', disabled: true, onclick: function () {
      inTitulo.value = PADRAO.titulo; inData.value = PADRAO.dataLocal; inAtivo.checked = true;
    } }, 'Usar o padrão (Mega da Virada)');
    botoes.push(btnSalvar, btnPadrao);

    API.chamar('publico.contagem', {}).then(preencher).catch(function (e) {
      erro.textContent = 'Não foi possível carregar o relógio: ' + e.message + ' Confira se o bloco "Contagem" foi colado no Código.gs e se a implantação tem uma nova versão.';
    });

    return h('section', { class: 'cartao', id: 'secao-contagem' },
      h('h3', {}, 'Relógio de contagem regressiva (página pública)'),
      h('p', { class: 'sub' }, 'Aparece no topo da página pública, em preto e dourado, contando até a data do sorteio.'),
      h('label', { class: 'marcar' }, inAtivo, ' Mostrar o relógio na página pública'),
      campo('Título do relógio', inTitulo),
      campo('Data e hora do sorteio (horário de Brasília)', inData),
      erro,
      h('div', { class: 'acoes' }, btnSalvar, btnPadrao));
  }

  var A = root.BolaoAdmin;
  if (!A || typeof A.telaConfig !== 'function' || A.telaConfig.contagemInstalada) return;
  var original = A.telaConfig;
  A.telaConfig = function (ctx) {
    var tela = original(ctx);
    var s = secao(ctx);
    var ultimo = tela.lastElementChild;
    if (ultimo && ultimo.classList.contains('perigo-zona')) tela.insertBefore(s, ultimo); else tela.appendChild(s);
    return tela;
  };
  A.telaConfig.contagemInstalada = true;
})(window);
