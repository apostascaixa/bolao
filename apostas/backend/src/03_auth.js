// ===== Autenticação: senha, convite, cadastro, login, sessão =====
function iteracoesHash() {
  var v = parseInt(props().getProperty('HASH_ITER'), 10);
  return (v > 0) ? v : CFG.HASH_ITER_PADRAO;
}

/** Formato: v1$iteracoes$salt$hash (SHA-256 iterado com salt individual). */
function hashSenha(senha, iter) {
  var salt = aleatorioHex(32);
  var h = sha256Hex(salt + '|' + senha);
  for (var i = 0; i < iter; i++) h = sha256Hex(h + '|' + salt + '|' + senha);
  return 'v1$' + iter + '$' + salt + '$' + h;
}

function comparaConstante(a, b) {
  if (a.length !== b.length) return false;
  var r = 0;
  for (var i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function verificarSenha(senha, registro) {
  var p = String(registro).split('$');
  if (p.length !== 4 || p[0] !== 'v1') return false;
  var iter = parseInt(p[1], 10);
  if (!(iter > 0)) return false;
  var h = sha256Hex(p[2] + '|' + senha);
  for (var i = 0; i < iter; i++) h = sha256Hex(h + '|' + p[2] + '|' + senha);
  return comparaConstante(h, p[3]);
}

function normalizarUsuario(u) {
  return String(u === undefined || u === null ? '' : u).trim().toLowerCase();
}

function validarUsuario(u) {
  if (!/^[a-z0-9._-]{3,30}$/.test(u)) {
    throw erroNegocio('Usuário deve ter de 3 a 30 caracteres: letras minúsculas, números, ponto, hífen ou sublinhado.');
  }
}

function validarSenha(senha, usuario) {
  if (typeof senha !== 'string' || senha.length < 8) throw erroNegocio('A senha deve ter pelo menos 8 caracteres.');
  if (senha.length > 100) throw erroNegocio('A senha deve ter no máximo 100 caracteres.');
  if (senha.toLowerCase() === usuario) throw erroNegocio('A senha não pode ser igual ao usuário.');
}

// ----- convites -----
function normalizarCodigo(c) {
  return String(c === undefined || c === null ? '' : c).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function hashCodigo(codigoNormalizado) {
  return sha256Hex('convite|' + codigoNormalizado);
}

function gerarCodigoConvite() {
  var h = aleatorioHex(20).toUpperCase();
  return h.substring(0, 5) + '-' + h.substring(5, 10) + '-' + h.substring(10, 15) + '-' + h.substring(15, 20);
}

/** Cria o convite e devolve o código em texto puro uma única vez (só o hash é guardado). */
function criarConviteInterno(papel, criadoPor, horas) {
  if (papel !== 'participante' && papel !== 'admin') throw erroNegocio('Papel inválido.');
  var h = (horas === undefined || horas === null) ? CFG.CONVITE_HORAS_PADRAO : horas;
  if (!Number.isInteger(h) || h < 1 || h > 24 * 30) throw erroNegocio('Validade deve ser de 1 a 720 horas.');
  var agora = RELOGIO.agora();
  var codigo = gerarCodigoConvite();
  var id = novoId();
  inserir('Convites', {
    id: id, codigoHash: hashCodigo(normalizarCodigo(codigo)), papel: papel, criadoPor: criadoPor,
    criadoEm: agora, expiraEm: agora + h * 3600 * 1000, status: 'ativo', usadoPor: '', usadoEm: ''
  });
  return { id: id, codigo: codigo, papel: papel, expiraEm: agora + h * 3600 * 1000 };
}

function criarConvite(admin, d) {
  return comLock(function () {
    return criarConviteInterno(d.papel || 'participante', admin.id, d.validadeHoras);
  });
}

function listarConvites() {
  var agora = RELOGIO.agora();
  return lerTabela('Convites').map(function (c) {
    var st = c.status;
    if (st === 'ativo' && c.expiraEm < agora) st = 'expirado';
    return { id: c.id, papel: c.papel, criadoEm: c.criadoEm, expiraEm: c.expiraEm, status: st, usadoPor: c.usadoPor, usadoEm: c.usadoEm };
  });
}

function revogarConvite(d) {
  return comLock(function () {
    var c = lerTabela('Convites').filter(function (x) { return x.id === d.id; })[0];
    if (!c) throw erroNegocio('Convite não encontrado.');
    if (c.status !== 'ativo') throw erroNegocio('Só convites ativos podem ser revogados.');
    c.status = 'revogado';
    atualizar('Convites', c._linha, c);
    return { id: c.id, status: 'revogado' };
  });
}

// ----- sessões -----
function limparSessoesExpiradas(agora) {
  var t = lerTabela('Sessoes');
  for (var i = t.length - 1; i >= 0; i--) {
    if (t[i].expiraEm < agora) removerLinha('Sessoes', t[i]._linha);
  }
}

/** Chamar somente dentro de comLock. Devolve o token em texto puro (só o hash é guardado). */
function criarSessaoInterna(userId, agora) {
  var token = aleatorioHex(64);
  inserir('Sessoes', { tokenHash: sha256Hex('sessao|' + token), userId: userId, criadoEm: agora, expiraEm: agora + CFG.SESSAO_MS });
  return token;
}

function usuarioPublico(u) {
  return { id: u.id, usuario: u.usuario, nome: u.nome, papel: u.papel };
}

function autenticar(token) {
  var invalida = erroNegocio('Sessão inválida ou expirada. Entre novamente.');
  if (typeof token !== 'string' || token.length < 32) throw invalida;
  var th = sha256Hex('sessao|' + token);
  var agora = RELOGIO.agora();
  var s = lerTabela('Sessoes').filter(function (x) { return x.tokenHash === th; })[0];
  if (!s || s.expiraEm < agora) throw invalida;
  var u = lerTabela('Usuarios').filter(function (x) { return x.id === s.userId; })[0];
  if (!u || u.status !== 'ativo') throw invalida;
  return u;
}

function exigirAdmin(token) {
  var u = autenticar(token);
  if (u.papel !== 'admin') throw erroNegocio('Acesso restrito ao administrador.');
  return u;
}

// ----- cadastro e login -----
function cadastrar(d) {
  var usuario = normalizarUsuario(d.usuario);
  validarUsuario(usuario);
  var nome = limparTexto(d.nome, 60);
  if (nome.length < 2) throw erroNegocio('Informe seu nome (mínimo 2 caracteres).');
  validarSenha(d.senha, usuario);

  var cod = normalizarCodigo(d.codigoConvite);
  var conviteInvalido = erroNegocio('Convite inválido ou expirado.');
  if (cod.length !== 20) throw conviteInvalido;
  var ch = hashCodigo(cod);
  var achar = function () { return lerTabela('Convites').filter(function (c) { return c.codigoHash === ch; })[0]; };
  var pre = achar();
  if (!pre || pre.status !== 'ativo' || pre.expiraEm < RELOGIO.agora()) throw conviteInvalido;

  var registro = hashSenha(d.senha, iteracoesHash()); // custo alto: fora do lock

  return comLock(function () {
    var agora = RELOGIO.agora();
    var conv = achar();
    if (!conv || conv.status !== 'ativo' || conv.expiraEm < agora) throw conviteInvalido;
    var existe = lerTabela('Usuarios').some(function (u) { return u.usuario === usuario; });
    if (existe) throw erroNegocio('Este nome de usuário já está em uso.');
    var id = novoId();
    inserir('Usuarios', {
      id: id, usuario: usuario, nome: nome, hashSenha: registro, papel: conv.papel, status: 'ativo',
      tentativas: 0, bloqueadoAte: 0, criadoEm: agora, conviteId: conv.id
    });
    conv.status = 'usado';
    conv.usadoPor = id;
    conv.usadoEm = agora;
    atualizar('Convites', conv._linha, conv);
    var token = criarSessaoInterna(id, agora);
    return { token: token, usuario: { id: id, usuario: usuario, nome: nome, papel: conv.papel } };
  });
}

function login(d) {
  var generico = erroNegocio('Usuário ou senha inválidos.');
  var usuario = normalizarUsuario(d.usuario);
  var senha = (typeof d.senha === 'string') ? d.senha : '';
  var u = lerTabela('Usuarios').filter(function (x) { return x.usuario === usuario; })[0];

  if (!u) {
    hashSenha(senha, iteracoesHash()); // equaliza o tempo de resposta
    throw generico;
  }
  if (u.status !== 'ativo') throw generico;
  if (u.bloqueadoAte > RELOGIO.agora()) {
    throw erroNegocio('Muitas tentativas. Tente novamente em alguns minutos.');
  }

  var ok = verificarSenha(senha, u.hashSenha); // fora do lock

  return comLock(function () {
    var agora = RELOGIO.agora();
    var atual = lerTabela('Usuarios').filter(function (x) { return x.id === u.id; })[0];
    if (!atual) throw generico;
    if (!ok) {
      atual.tentativas = (atual.tentativas || 0) + 1;
      if (atual.tentativas >= CFG.MAX_TENTATIVAS) {
        atual.bloqueadoAte = agora + CFG.BLOQUEIO_MS;
        atual.tentativas = 0;
      }
      atualizar('Usuarios', atual._linha, atual);
      throw generico;
    }
    atual.tentativas = 0;
    atual.bloqueadoAte = 0;
    atualizar('Usuarios', atual._linha, atual);
    limparSessoesExpiradas(agora);
    var token = criarSessaoInterna(atual.id, agora);
    return { token: token, usuario: usuarioPublico(atual) };
  });
}

function logout(d) {
  if (typeof d.token !== 'string') return { saiu: true };
  var th = sha256Hex('sessao|' + d.token);
  return comLock(function () {
    var s = lerTabela('Sessoes').filter(function (x) { return x.tokenHash === th; })[0];
    if (s) removerLinha('Sessoes', s._linha);
    return { saiu: true };
  });
}
