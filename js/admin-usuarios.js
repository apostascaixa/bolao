/** Aba "Usuários" do administrador: lista as contas e redefine usuário/senha de um participante. */
(function (root) {
  'use strict';

  var ALFABETO = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  /** Senha provisória aleatória (sem caracteres que se confundem, como 0/O e 1/l). */
  function gerarSenha(tam) {
    var buf = new Uint32Array(tam), s = '';
    root.crypto.getRandomValues(buf);
    for (var i = 0; i < tam; i++) s += ALFABETO.charAt(buf[i] % ALFABETO.length);
    return s;
  }

  function telaUsuarios(ctx) {
    var h = ctx.UI.h, campo = ctx.UI.campo, API = ctx.API;
    var lista = h('div', { class: 'lista-usuarios' }, h('p', { class: 'carregando' }, 'Carregando…'));
    var erroGeral = h('p', { class: 'erro-form', role: 'alert' });
    var todos = [];
    var inBusca = h('input', { name: 'buscaUsuario', type: 'search', placeholder: 'Buscar por nome ou usuário', oninput: desenhar });

    function cartao(u) {
      var eu = ctx.estado.usuario && ctx.estado.usuario.usuario === u.usuario;
      var aberto = false;
      var caixa = h('div', {});
      var inUsuario = h('input', { name: 'novoUsuario-' + u.id, maxlength: 30, value: u.usuario, autocapitalize: 'none' });
      var inSenha = h('input', { name: 'novaSenha-' + u.id, type: 'text', minlength: 8, autocomplete: 'off', spellcheck: 'false', value: gerarSenha(10) });
      var erro = h('p', { class: 'erro-form', role: 'alert' });
      var resultado = h('div', {});

      function formulario() {
        return h('div', { class: 'form' },
          campo('Usuário (login)', inUsuario, 'Deixe como está para trocar só a senha.'),
          campo('Nova senha provisória (mín. 8 caracteres)', inSenha, 'Passe esta senha ao participante por um canal seguro. Ele deve trocá-la depois de entrar.'),
          h('div', { class: 'acoes' },
            h('button', { type: 'button', onclick: function () { inSenha.value = gerarSenha(10); } }, 'Gerar outra'),
            h('button', { class: 'perigo', onclick: function (ev) {
              erro.textContent = '';
              if (inSenha.value.length < 8) { erro.textContent = 'A senha precisa ter pelo menos 8 caracteres.'; return; }
              if (!root.confirm('Redefinir as credenciais de ' + u.nome + '? A senha atual deixa de valer e as sessões abertas dele são encerradas.')) return;
              var novoLogin = inUsuario.value.trim(), novaSenha = inSenha.value;
              ctx.executar(async function () {
                var r = await API.chamar('admin.usuarios.redefinir', { id: u.id, usuario: novoLogin, senha: novaSenha });
                u.usuario = r.usuario || novoLogin;
                caixa.replaceChildren();
                aberto = false;
                resultado.replaceChildren(h('div', { class: 'aviso-ok', role: 'status' },
                  h('strong', {}, 'Credenciais redefinidas. '), 'Usuário: ', h('code', {}, u.usuario), ' · Senha: ', h('code', {}, novaSenha), ' ',
                  h('button', { type: 'button', onclick: function () { ctx.UI.copiar('Usuário: ' + u.usuario + '\nSenha: ' + novaSenha); } }, 'Copiar')));
                ctx.UI.aviso('Credenciais redefinidas.');
              }, ev.target, function (m) { erro.textContent = m; });
            } }, 'Redefinir')),
          erro);
      }

      return h('article', { class: 'cartao' },
        h('div', { class: 'cartao-topo' }, h('h3', {}, u.nome + ' (@' + u.usuario + ')'),
          h('span', { class: 'selo ' + (u.papel === 'admin' ? 'aberto' : 'rascunho') }, u.papel === 'admin' ? 'Administrador' : 'Participante')),
        eu ? h('p', { class: 'sub' }, 'Esta é a sua conta.') : h('div', { class: 'acoes' }, h('button', { onclick: function () {
          aberto = !aberto;
          caixa.replaceChildren(aberto ? formulario() : '');
        } }, 'Redefinir credenciais')),
        caixa, resultado);
    }

    function desenhar() {
      var q = inBusca.value.trim().toLowerCase();
      var vis = todos.filter(function (u) { return !q || (u.nome + ' ' + u.usuario).toLowerCase().indexOf(q) !== -1; });
      lista.replaceChildren.apply(lista, vis.length ? vis.map(cartao) : [h('p', { class: 'vazio' }, 'Nenhuma conta encontrada.')]);
    }

    API.chamar('admin.usuarios.listar', {}).then(function (r) { todos = r; desenhar(); }).catch(function (e) {
      lista.replaceChildren();
      erroGeral.textContent = 'Não foi possível carregar os usuários: ' + e.message + ' Confira se o bloco "Usuários" foi colado no Código.gs e se a implantação tem uma nova versão.';
    });

    return h('section', {},
      h('h2', {}, 'Usuários'),
      h('p', { class: 'sub' }, 'Redefina o usuário e a senha de quem perdeu o acesso. A senha antiga deixa de valer na hora.'),
      campo('Buscar', inBusca), erroGeral, lista);
  }

  root.BolaoAdmin = Object.assign(root.BolaoAdmin || {}, { telaUsuarios: telaUsuarios });
})(window);
