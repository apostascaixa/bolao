const test = require('node:test');
const assert = require('node:assert/strict');
const { novoAmbiente } = require('./mocks-apps-script.js');

const T0 = 1_800_000_000_000;
const HORA = 3600 * 1000;

function preparar() {
  const env = novoAmbiente();
  env.ctx.RELOGIO.agora = () => env.tempo;
  env.tempo = T0;
  env.propriedades.HASH_ITER = '20'; // rápido nos testes
  env.ctx.configurar();
  return env;
}

// Cria o primeiro admin pelo fluxo real e devolve { env, token, codigo }
function comAdmin() {
  const env = preparar();
  env.ctx.primeiroAdmin();
  const linha = env.logs.find((l) => l.includes('CÓDIGO DO PRIMEIRO'));
  const codigo = linha.match(/: ([0-9A-F-]{23})$/)[1];
  const r = env.chamar('cadastrar', { codigoConvite: codigo, usuario: 'admin', nome: 'Administrador', senha: 'senha-forte-1' });
  assert.equal(r.ok, true, JSON.stringify(r));
  return { env, token: r.dados.token, codigo };
}

function convidarParticipante(env, tokenAdmin, usuario = 'maria', senha = 'senha-maria-1') {
  const c = env.chamar('admin.convites.criar', { token: tokenAdmin });
  assert.equal(c.ok, true);
  const r = env.chamar('cadastrar', { codigoConvite: c.dados.codigo, usuario, nome: 'Maria Silva', senha });
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.dados.token;
}

const bolaoValido = (extra = {}) => ({
  nome: 'Mega da Virada', modalidade: 'mega-sena', qtdNumeros: 6, valorCotaCentavos: 6000,
  jogosPorCota: 10, limiteCotas: 20, prazo: T0 + 48 * HORA, ...extra
});

// ---------- configuração ----------
test('configurar cria as abas com cabeçalhos e é repetível', () => {
  const env = preparar();
  for (const n of ['Usuarios', 'Convites', 'Sessoes', 'Boloes', 'Cotas', 'Jogos']) {
    assert.ok(env.ss.getSheetByName(n), 'aba ' + n);
  }
  assert.equal(env.ss.getSheetByName('Usuarios').rows[0][1], 'usuario');
  env.ctx.configurar(); // de novo, sem perder nada
  assert.equal(env.ss.getSheetByName('Usuarios').rows.length, 1);
});

test('primeiroAdmin gera convite uma vez e não recria se já há admin', () => {
  const { env } = comAdmin();
  env.logs.length = 0;
  env.ctx.primeiroAdmin();
  assert.ok(env.logs[0].includes('Já existe'));
});

// ---------- hash de senha ----------
test('hash de senha: salt diferente, verifica certo e errado, formato versionado', () => {
  const env = preparar();
  const a = env.ctx.hashSenha('minha-senha-1', 20);
  const b = env.ctx.hashSenha('minha-senha-1', 20);
  assert.notEqual(a, b);
  assert.ok(a.startsWith('v1$20$'));
  assert.equal(env.ctx.verificarSenha('minha-senha-1', a), true);
  assert.equal(env.ctx.verificarSenha('minha-senha-2', a), false);
  assert.equal(env.ctx.verificarSenha('x', 'lixo'), false);
});

test('iterações padrão são usadas quando não há propriedade', () => {
  const env = preparar();
  delete env.propriedades.HASH_ITER;
  assert.equal(env.ctx.iteracoesHash(), 3000);
});

// ---------- cadastro ----------
test('cadastro do admin cria usuário, usa o convite e já devolve sessão', () => {
  const { env, token } = comAdmin();
  const eu = env.chamar('eu', { token });
  assert.equal(eu.dados.papel, 'admin');
  assert.equal(eu.dados.usuario, 'admin');
});

test('convite é de uso único', () => {
  const { env, codigo } = comAdmin();
  const r = env.chamar('cadastrar', { codigoConvite: codigo, usuario: 'outro', nome: 'Outro', senha: 'senha-outro-1' });
  assert.equal(r.ok, false);
  assert.match(r.erro, /Convite inválido/);
});

test('convite aceita formato com ou sem hífens e minúsculas', () => {
  const { env, token } = comAdmin();
  const c = env.chamar('admin.convites.criar', { token }).dados.codigo;
  const r = env.chamar('cadastrar', { codigoConvite: c.replace(/-/g, '').toLowerCase(), usuario: 'ana', nome: 'Ana', senha: 'senha-ana-12' });
  assert.equal(r.ok, true);
});

test('convite expirado e convite revogado são recusados', () => {
  const { env, token } = comAdmin();
  const exp = env.chamar('admin.convites.criar', { token, validadeHoras: 1 }).dados;
  env.tempo += 2 * HORA;
  assert.equal(env.chamar('cadastrar', { codigoConvite: exp.codigo, usuario: 'a1', nome: 'A1', senha: 'senha-a1-123' }).ok, false);

  env.tempo = T0 + 3 * HORA;
  // sessão do admin continua válida (7 dias)
  const rev = env.chamar('admin.convites.criar', { token }).dados;
  assert.equal(env.chamar('admin.convites.revogar', { token, id: rev.id }).ok, true);
  assert.equal(env.chamar('cadastrar', { codigoConvite: rev.codigo, usuario: 'a2', nome: 'A2', senha: 'senha-a2-123' }).ok, false);
});

test('convite inventado é recusado sem revelar se o usuário existe', () => {
  const { env } = comAdmin();
  const r = env.chamar('cadastrar', { codigoConvite: 'AAAAA-BBBBB-CCCCC-DDDDD', usuario: 'admin', nome: 'Xy', senha: 'senha-x-1234' });
  assert.equal(r.ok, false);
  assert.match(r.erro, /Convite inválido/);
});

test('usuário repetido é recusado e o convite não é consumido', () => {
  const { env, token } = comAdmin();
  const c = env.chamar('admin.convites.criar', { token }).dados;
  const r = env.chamar('cadastrar', { codigoConvite: c.codigo, usuario: 'ADMIN', nome: 'Outro', senha: 'senha-x-1234' });
  assert.equal(r.ok, false);
  assert.match(r.erro, /já está em uso/);
  const ok = env.chamar('cadastrar', { codigoConvite: c.codigo, usuario: 'novo', nome: 'Novo', senha: 'senha-x-1234' });
  assert.equal(ok.ok, true);
});

test('validações de usuário, nome e senha', () => {
  const { env, token } = comAdmin();
  const c = () => env.chamar('admin.convites.criar', { token }).dados.codigo;
  assert.equal(env.chamar('cadastrar', { codigoConvite: c(), usuario: 'a b', nome: 'Ok', senha: 'senha-123456' }).ok, false);
  assert.equal(env.chamar('cadastrar', { codigoConvite: c(), usuario: 'ab', nome: 'Ok', senha: 'senha-123456' }).ok, false);
  assert.equal(env.chamar('cadastrar', { codigoConvite: c(), usuario: 'joao', nome: 'J', senha: 'senha-123456' }).ok, false);
  assert.equal(env.chamar('cadastrar', { codigoConvite: c(), usuario: 'joao', nome: 'Joao', senha: 'curta' }).ok, false);
  assert.equal(env.chamar('cadastrar', { codigoConvite: c(), usuario: 'joao', nome: 'Joao', senha: 'joao' }).ok, false);
});

test('nome que começaria uma fórmula é neutralizado', () => {
  const { env, token } = comAdmin();
  const c = env.chamar('admin.convites.criar', { token }).dados.codigo;
  const r = env.chamar('cadastrar', { codigoConvite: c, usuario: 'hack', nome: '=IMPORTRANGE("x")', senha: 'senha-123456' });
  assert.equal(r.ok, true);
  assert.ok(!r.dados.usuario.nome.startsWith('='));
});

// ---------- login / sessão ----------
test('login certo devolve sessão; errado devolve mensagem genérica', () => {
  const { env } = comAdmin();
  const ok = env.chamar('login', { usuario: 'Admin', senha: 'senha-forte-1' });
  assert.equal(ok.ok, true);
  assert.ok(ok.dados.token.length >= 64);
  const errada = env.chamar('login', { usuario: 'admin', senha: 'errada-errada' });
  const inexistente = env.chamar('login', { usuario: 'ninguem', senha: 'qualquer-coisa' });
  assert.equal(errada.erro, 'Usuário ou senha inválidos.');
  assert.equal(inexistente.erro, 'Usuário ou senha inválidos.');
});

test('bloqueio após 5 erros e liberação depois de 10 minutos', () => {
  const { env } = comAdmin();
  for (let i = 0; i < 5; i++) assert.equal(env.chamar('login', { usuario: 'admin', senha: 'errada-errada' }).ok, false);
  const bloq = env.chamar('login', { usuario: 'admin', senha: 'senha-forte-1' });
  assert.equal(bloq.ok, false);
  assert.match(bloq.erro, /Muitas tentativas/);
  env.tempo += 11 * 60 * 1000;
  assert.equal(env.chamar('login', { usuario: 'admin', senha: 'senha-forte-1' }).ok, true);
});

test('acerto zera o contador de erros', () => {
  const { env } = comAdmin();
  for (let i = 0; i < 4; i++) env.chamar('login', { usuario: 'admin', senha: 'errada-errada' });
  assert.equal(env.chamar('login', { usuario: 'admin', senha: 'senha-forte-1' }).ok, true);
  for (let i = 0; i < 4; i++) env.chamar('login', { usuario: 'admin', senha: 'errada-errada' });
  assert.equal(env.chamar('login', { usuario: 'admin', senha: 'senha-forte-1' }).ok, true);
});

test('sessão expira em 7 dias e logout a encerra', () => {
  const { env } = comAdmin();
  const t = env.chamar('login', { usuario: 'admin', senha: 'senha-forte-1' }).dados.token;
  assert.equal(env.chamar('eu', { token: t }).ok, true);
  env.chamar('logout', { token: t });
  assert.equal(env.chamar('eu', { token: t }).ok, false);

  const t2 = env.chamar('login', { usuario: 'admin', senha: 'senha-forte-1' }).dados.token;
  env.tempo += 7 * 24 * HORA + 1000;
  assert.equal(env.chamar('eu', { token: t2 }).ok, false);
});

test('login limpa sessões expiradas', () => {
  const { env } = comAdmin();
  env.chamar('login', { usuario: 'admin', senha: 'senha-forte-1' });
  env.tempo += 8 * 24 * HORA;
  env.chamar('login', { usuario: 'admin', senha: 'senha-forte-1' });
  assert.equal(env.ss.getSheetByName('Sessoes').rows.length, 1 + 1); // cabeçalho + a nova
});

test('token falso, vazio ou de outro tipo é recusado', () => {
  const { env } = comAdmin();
  for (const t of ['', 'abc', 'x'.repeat(64), null, 123, {}]) {
    assert.equal(env.chamar('eu', { token: t }).ok, false);
  }
});

test('usuário bloqueado (status) perde o acesso mesmo com sessão', () => {
  const { env, token } = comAdmin();
  const u = env.ctx.lerTabela('Usuarios')[0];
  u.status = 'bloqueado';
  env.ctx.atualizar('Usuarios', u._linha, u);
  assert.equal(env.chamar('eu', { token }).ok, false);
  assert.equal(env.chamar('login', { usuario: 'admin', senha: 'senha-forte-1' }).ok, false);
});

// ---------- segredos não ficam em texto puro ----------
test('planilha não guarda senha, código de convite nem token em texto puro', () => {
  const { env, token, codigo } = comAdmin();
  const novo = env.chamar('admin.convites.criar', { token }).dados.codigo;
  const tudo = JSON.stringify(Object.values(env.ss.sheets).map((s) => s.rows));
  for (const segredo of ['senha-forte-1', token, codigo, codigo.replace(/-/g, ''), novo, novo.replace(/-/g, '')]) {
    assert.ok(!tudo.includes(segredo), 'vazou: ' + segredo.slice(0, 6));
  }
});

// ---------- permissões ----------
test('participante não acessa ações de administrador; admin acessa', () => {
  const { env, token } = comAdmin();
  const tp = convidarParticipante(env, token);
  for (const a of ['admin.convites.criar', 'admin.convites.listar', 'admin.boloes.listar']) {
    const r = env.chamar(a, { token: tp });
    assert.equal(r.ok, false);
    assert.match(r.erro, /restrito ao administrador/);
  }
  assert.equal(env.chamar('admin.boloes.criar', { token: tp, ...bolaoValido() }).ok, false);
  assert.equal(env.chamar('admin.boloes.listar', { token }).ok, true);
});

test('ações sem login e ações desconhecidas são recusadas', () => {
  const { env } = comAdmin();
  assert.equal(env.chamar('admin.boloes.listar', {}).ok, false);
  assert.equal(env.chamar('boloes.abertos', {}).ok, false);
  assert.equal(env.chamar('naoexiste', {}).ok, false);
  assert.equal(env.chamar('__proto__', {}).ok, false);
  assert.equal(env.chamar('toString', {}).ok, false);
});

test('doPost com corpo inválido responde erro sem estourar', () => {
  const { env } = comAdmin();
  const r = JSON.parse(env.ctx.doPost({ postData: { contents: 'não é json' } }).getContent());
  assert.equal(r.ok, false);
  const r2 = JSON.parse(env.ctx.doPost({ postData: { contents: '[1,2]' } }).getContent());
  assert.equal(r2.ok, false);
  assert.equal(JSON.parse(env.ctx.doGet().getContent()).ok, true);
});

test('erro inesperado vira mensagem genérica e é registrado', () => {
  const { env, token } = comAdmin();
  env.ss.sheets.Boloes = undefined; // quebra de propósito
  const r = env.chamar('admin.boloes.listar', { token });
  assert.equal(r.ok, false);
  assert.equal(r.erro, 'Erro interno. Tente novamente.');
  assert.ok(env.erros.length > 0);
});

// ---------- convites (admin) ----------
test('listar convites mostra estado e nunca o código nem o hash', () => {
  const { env, token } = comAdmin();
  env.chamar('admin.convites.criar', { token, validadeHoras: 1 });
  env.tempo += 2 * HORA;
  const l = env.chamar('admin.convites.listar', { token }).dados;
  assert.ok(l.some((c) => c.status === 'expirado'));
  assert.ok(l.some((c) => c.status === 'usado'));
  assert.ok(!JSON.stringify(l).includes('codigoHash'));
});

test('validade de convite inválida é recusada', () => {
  const { env, token } = comAdmin();
  for (const h of [0, -1, 1.5, 9999, 'x']) assert.equal(env.chamar('admin.convites.criar', { token, validadeHoras: h }).ok, false);
});

// ---------- bolões ----------
test('criar bolão válido nasce como rascunho e não aparece para participantes', () => {
  const { env, token } = comAdmin();
  const tp = convidarParticipante(env, token);
  const r = env.chamar('admin.boloes.criar', { token, ...bolaoValido() });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.dados.status, 'rascunho');
  assert.equal(r.dados.maxCotasPorPessoa, 1);
  assert.equal(r.dados.vagas, 20);
  assert.equal(env.chamar('boloes.abertos', { token: tp }).dados.length, 0);
});

test('abrir bolão o torna visível; voltar a rascunho o esconde', () => {
  const { env, token } = comAdmin();
  const tp = convidarParticipante(env, token);
  const id = env.chamar('admin.boloes.criar', { token, ...bolaoValido() }).dados.id;
  assert.equal(env.chamar('admin.boloes.status', { token, id, status: 'aberto' }).ok, true);
  const vis = env.chamar('boloes.abertos', { token: tp }).dados;
  assert.equal(vis.length, 1);
  assert.equal(vis[0].modalidadeNome, 'Mega-Sena');
  assert.equal(env.chamar('admin.boloes.status', { token, id, status: 'rascunho' }).ok, true);
  assert.equal(env.chamar('boloes.abertos', { token: tp }).dados.length, 0);
  assert.equal(env.chamar('admin.boloes.status', { token, id, status: 'fechado' }).ok, false);
});

test('criação recusa dados inválidos', () => {
  const { env, token } = comAdmin();
  const falha = (extra) => env.chamar('admin.boloes.criar', { token, ...bolaoValido(extra) });
  assert.equal(falha({ modalidade: 'x' }).ok, false);
  assert.equal(falha({ qtdNumeros: 5 }).ok, false);
  assert.equal(falha({ valorCotaCentavos: 0 }).ok, false);
  assert.equal(falha({ valorCotaCentavos: '6000' }).ok, false);
  assert.equal(falha({ jogosPorCota: 0 }).ok, false);
  assert.equal(falha({ limiteCotas: 0 }).ok, false);
  assert.equal(falha({ maxCotasPorPessoa: 0 }).ok, false);
  assert.equal(falha({ maxCotasPorPessoa: 99 }).ok, false);
  assert.equal(falha({ prazo: T0 - 1 }).ok, false);
  assert.equal(falha({ prazo: 'amanhã' }).ok, false);
  assert.equal(falha({ nome: '   ' }).ok, false);
});

test('Lotofácil com 15 números é aceita', () => {
  const { env, token } = comAdmin();
  const r = env.chamar('admin.boloes.criar', { token, ...bolaoValido({ modalidade: 'lotofacil', qtdNumeros: 15, nome: 'Lotofácil' }) });
  assert.equal(r.ok, true, JSON.stringify(r));
});

test('editar bolão sem cotas altera tudo e revalida', () => {
  const { env, token } = comAdmin();
  const id = env.chamar('admin.boloes.criar', { token, ...bolaoValido() }).dados.id;
  const r = env.chamar('admin.boloes.editar', { token, id, limiteCotas: 30, valorCotaCentavos: 7000, nome: 'Novo nome' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.dados.limiteCotas, 30);
  assert.equal(r.dados.valorCotaCentavos, 7000);
  assert.equal(env.chamar('admin.boloes.editar', { token, id, qtdNumeros: 3 }).ok, false);
});

test('com cotas: só nome e prazo mudam; arquivar em vez de apagar', () => {
  const { env, token } = comAdmin();
  const id = env.chamar('admin.boloes.criar', { token, ...bolaoValido() }).dados.id;
  env.ctx.inserir('Cotas', { id: 'c1', bolaoId: id, userId: 'u1', status: 'rascunho', criadoEm: T0, atualizadoEm: T0 });

  assert.equal(env.chamar('admin.boloes.editar', { token, id, valorCotaCentavos: 9999 }).ok, false);
  assert.equal(env.chamar('admin.boloes.editar', { token, id, limiteCotas: 25 }).ok, false);
  const ok = env.chamar('admin.boloes.editar', { token, id, nome: 'Outro nome', prazo: T0 + 72 * HORA, valorCotaCentavos: 6000 });
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.equal(ok.dados.cotasOcupadas, 1);
  assert.equal(ok.dados.vagas, 19);

  assert.equal(env.chamar('admin.boloes.status', { token, id, status: 'aberto' }).ok, true);
  assert.equal(env.chamar('admin.boloes.status', { token, id, status: 'rascunho' }).ok, false);

  const ex = env.chamar('admin.boloes.excluir', { token, id });
  assert.deepEqual(ex.dados, { id, removido: false, arquivado: true });
  assert.equal(env.chamar('admin.boloes.listar', { token }).dados.length, 0);
  assert.equal(env.chamar('admin.boloes.listar', { token, incluirArquivados: true }).dados.length, 1);
  assert.equal(env.chamar('admin.boloes.editar', { token, id, nome: 'x' }).ok, false);
});

test('cota expirada não ocupa vaga nem trava a edição', () => {
  const { env, token } = comAdmin();
  const id = env.chamar('admin.boloes.criar', { token, ...bolaoValido() }).dados.id;
  env.ctx.inserir('Cotas', { id: 'c1', bolaoId: id, userId: 'u1', status: 'expirada', criadoEm: T0, atualizadoEm: T0 });
  const r = env.chamar('admin.boloes.editar', { token, id, valorCotaCentavos: 7000 });
  assert.equal(r.ok, true);
  assert.equal(r.dados.vagas, 20);
});

test('sem cotas, excluir apaga de verdade', () => {
  const { env, token } = comAdmin();
  const id = env.chamar('admin.boloes.criar', { token, ...bolaoValido() }).dados.id;
  const ex = env.chamar('admin.boloes.excluir', { token, id });
  assert.deepEqual(ex.dados, { id, removido: true, arquivado: false });
  assert.equal(env.ss.getSheetByName('Boloes').rows.length, 1);
  assert.equal(env.chamar('admin.boloes.excluir', { token, id }).ok, false);
});

test('não abre bolão com prazo vencido', () => {
  const { env, token } = comAdmin();
  const id = env.chamar('admin.boloes.criar', { token, ...bolaoValido({ prazo: T0 + HORA }) }).dados.id;
  env.tempo += 2 * HORA;
  assert.equal(env.chamar('admin.boloes.status', { token, id, status: 'aberto' }).ok, false);
});

test('modalidades disponíveis para o formulário do admin', () => {
  const { env, token } = comAdmin();
  const m = env.chamar('modalidades', { token }).dados;
  assert.ok(m.some((x) => x.id === 'mega-sena' && x.dezenasMin === 6));
});

// ---------- concorrência ----------
test('nenhuma operação deixa o lock preso nem o aninha', () => {
  const { env, token } = comAdmin();
  convidarParticipante(env, token);
  env.chamar('login', { usuario: 'maria', senha: 'senha-maria-1' });
  env.chamar('login', { usuario: 'maria', senha: 'errada-errada' });
  env.chamar('admin.boloes.criar', { token, ...bolaoValido() });
  assert.equal(env.estaTravado(), false);
  assert.ok(env.travas() > 5);
});

// ---------- teste rápido (versão simulada) ----------
test('testeRapido roda na simulação sem falhas', () => {
  const env = preparar();
  env.ctx.testeRapido();
  assert.ok(env.logs.some((l) => l.includes('TUDO OK')), env.logs.join(' | '));
});

// ---------- regressão: o Planilhas converte texto parecido com número/data ----------
test('usuários e nomes "esquisitos" sobrevivem à ida e volta pela planilha', () => {
  const { env, token } = comAdmin();
  const casos = [['0123', '2003'], ['12e4', 'TRUE'], ['1-2-3', '1,5'], ['10.5', '12:30']];
  casos.forEach(([usuario, nome], i) => {
    const c = env.chamar('admin.convites.criar', { token }).dados.codigo;
    const r = env.chamar('cadastrar', { codigoConvite: c, usuario, nome: nome + 'x', senha: 'senha-teste-' + i });
    assert.equal(r.ok, true, usuario + ' ' + JSON.stringify(r));
    assert.equal(r.dados.usuario.usuario, usuario);
    const l = env.chamar('login', { usuario, senha: 'senha-teste-' + i });
    assert.equal(l.ok, true, 'login ' + usuario);
    assert.equal(l.dados.usuario.usuario, usuario);
  });
});

test('nome de bolão e ids viram texto mesmo que pareçam número', () => {
  const { env, token } = comAdmin();
  const r = env.chamar('admin.boloes.criar', { token, ...bolaoValido({ nome: '2026' }) });
  assert.equal(r.ok, true);
  assert.equal(env.chamar('admin.boloes.listar', { token }).dados[0].nome, '2026');
});

test('codificar/decodificar são inversos e aceitam valores já gravados sem prefixo', () => {
  const env = preparar();
  for (const v of ['', 'abc', '~til', '12e4', '=x']) assert.equal(env.ctx.decodificarTexto(env.ctx.codificarTexto(v)), v);
  assert.equal(env.ctx.decodificarTexto('legado'), 'legado');
});

// ---------- cotas e jogos ----------
function cenarioCotas(extra = {}) {
  const { env, token } = comAdmin();
  const id = env.chamar('admin.boloes.criar', { token, ...bolaoValido({ jogosPorCota: 3, limiteCotas: 2, ...extra }) }).dados.id;
  env.chamar('admin.boloes.status', { token, id, status: 'aberto' });
  const maria = convidarParticipante(env, token, 'maria', 'senha-maria-1');
  const joao = convidarParticipante(env, token, 'joao', 'senha-joao-12');
  return { env, token, id, maria, joao };
}
const J = (...n) => n;

test('resposta inclui o horário do servidor', () => {
  const { env, token } = comAdmin();
  const r = env.chamar('eu', { token });
  assert.equal(r.agora, env.tempo);
});

test('participante cria cota, monta os jogos e ela fica completa', () => {
  const { env, id, maria } = cenarioCotas();
  const c = env.chamar('cotas.criar', { token: maria, bolaoId: id });
  assert.equal(c.ok, true, JSON.stringify(c));
  assert.equal(c.dados.status, 'rascunho');
  const cotaId = c.dados.id;

  let r = env.chamar('jogos.salvar', { token: maria, cotaId, numeros: [42, 7, 1, 60, 33, 18] });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.dados.jogos[0].numeros, [1, 7, 18, 33, 42, 60]); // ordenado
  assert.equal(r.dados.status, 'rascunho');
  r = env.chamar('jogos.salvar', { token: maria, cotaId, numeros: [1, 2, 3, 4, 5, 6] });
  r = env.chamar('jogos.salvar', { token: maria, cotaId, numeros: [10, 11, 12, 13, 14, 15] });
  assert.equal(r.dados.status, 'completa');
  assert.equal(r.dados.jogos.length, 3);

  const minhas = env.chamar('cotas.minhas', { token: maria }).dados;
  assert.equal(minhas.length, 1);
  assert.equal(minhas[0].jogos.length, 3);
});

test('jogos de texto parecido com data/número sobrevivem à planilha', () => {
  const { env, id, maria } = cenarioCotas({ qtdNumeros: 6 });
  const cotaId = env.chamar('cotas.criar', { token: maria, bolaoId: id }).dados.id;
  env.chamar('jogos.salvar', { token: maria, cotaId, numeros: [1, 2, 3, 4, 5, 6] });
  env.chamar('jogos.salvar', { token: maria, cotaId, numeros: [1, 2, 3, 4, 5, 7] });
  const j = env.chamar('cotas.minhas', { token: maria }).dados[0].jogos;
  assert.deepEqual(j.map((x) => x.numeros), [[1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5, 7]]);
});

test('jogo inválido, repetido ou além do limite é recusado', () => {
  const { env, id, maria } = cenarioCotas();
  const cotaId = env.chamar('cotas.criar', { token: maria, bolaoId: id }).dados.id;
  const salvar = (numeros, extra = {}) => env.chamar('jogos.salvar', { token: maria, cotaId, numeros, ...extra });
  assert.equal(salvar([1, 2, 3, 4, 5]).ok, false);
  assert.equal(salvar([1, 1, 2, 3, 4, 5]).ok, false);
  assert.equal(salvar([1, 2, 3, 4, 5, 61]).ok, false);
  assert.equal(salvar('1,2,3').ok, false);
  assert.equal(salvar([1, 2, 3, 4, 5, 6]).ok, true);
  const dup = salvar([6, 5, 4, 3, 2, 1]);
  assert.equal(dup.ok, false);
  assert.match(dup.erro, /já está na sua cota/);
  salvar([7, 8, 9, 10, 11, 12]); salvar([13, 14, 15, 16, 17, 18]);
  const exc = salvar([20, 21, 22, 23, 24, 25]);
  assert.equal(exc.ok, false);
  assert.match(exc.erro, /todos os 3 jogos/);
});

test('editar um jogo pelo id e remover volta a cota para rascunho', () => {
  const { env, id, maria } = cenarioCotas();
  const cotaId = env.chamar('cotas.criar', { token: maria, bolaoId: id }).dados.id;
  const s = (n, e = {}) => env.chamar('jogos.salvar', { token: maria, cotaId, numeros: n, ...e });
  s([1, 2, 3, 4, 5, 6]); s([7, 8, 9, 10, 11, 12]);
  const completa = s([13, 14, 15, 16, 17, 18]);
  assert.equal(completa.dados.status, 'completa');
  const jogoId = completa.dados.jogos[1].id;

  const ed = s([20, 21, 22, 23, 24, 25], { jogoId });
  assert.equal(ed.ok, true, JSON.stringify(ed));
  assert.deepEqual(ed.dados.jogos[1].numeros, [20, 21, 22, 23, 24, 25]);
  assert.equal(ed.dados.status, 'completa');
  assert.equal(s([1, 2, 3, 4, 5, 6], { jogoId }).ok, false); // viraria duplicado do jogo 1

  const rem = env.chamar('jogos.remover', { token: maria, cotaId, jogoId });
  assert.equal(rem.ok, true);
  assert.equal(rem.dados.jogos.length, 2);
  assert.equal(rem.dados.status, 'rascunho');
  assert.equal(env.chamar('jogos.remover', { token: maria, cotaId, jogoId }).ok, false);
});

test('ninguém mexe na cota de outra pessoa', () => {
  const { env, id, maria, joao, token } = cenarioCotas();
  const cotaId = env.chamar('cotas.criar', { token: maria, bolaoId: id }).dados.id;
  env.chamar('jogos.salvar', { token: maria, cotaId, numeros: [1, 2, 3, 4, 5, 6] });
  for (const acao of ['jogos.salvar', 'jogos.remover', 'cotas.cancelar']) {
    const r = env.chamar(acao, { token: joao, cotaId, numeros: [7, 8, 9, 10, 11, 12], jogoId: 'x' });
    assert.equal(r.ok, false, acao);
    assert.equal(r.erro, 'Cota não encontrada.');
  }
  assert.equal(env.chamar('cotas.minhas', { token: joao }).dados.length, 0);
  assert.equal(env.chamar('cotas.minhas', { token }).dados.length, 0);
});

test('máximo de cotas por pessoa e limite de cotas do bolão', () => {
  const { env, token, id, maria, joao } = cenarioCotas({ limiteCotas: 2, maxCotasPorPessoa: 1 });
  assert.equal(env.chamar('cotas.criar', { token: maria, bolaoId: id }).ok, true);
  const dupla = env.chamar('cotas.criar', { token: maria, bolaoId: id });
  assert.equal(dupla.ok, false);
  assert.match(dupla.erro, /máximo de cotas/);
  assert.equal(env.chamar('cotas.criar', { token: joao, bolaoId: id }).ok, true);
  const cheio = env.chamar('cotas.criar', { token, bolaoId: id });
  assert.equal(cheio.ok, false);
  assert.match(cheio.erro, /já foram preenchidas/);
  assert.equal(env.chamar('boloes.abertos', { token: joao }).dados[0].vagas, 0);
});

test('desistir da cota libera a vaga e apaga os jogos', () => {
  const { env, token, id, maria, joao } = cenarioCotas({ limiteCotas: 1 });
  const cotaId = env.chamar('cotas.criar', { token: maria, bolaoId: id }).dados.id;
  env.chamar('jogos.salvar', { token: maria, cotaId, numeros: [1, 2, 3, 4, 5, 6] });
  env.chamar('jogos.salvar', { token: maria, cotaId, numeros: [7, 8, 9, 10, 11, 12] });
  assert.equal(env.chamar('cotas.criar', { token: joao, bolaoId: id }).ok, false);
  assert.equal(env.chamar('cotas.cancelar', { token: maria, cotaId }).ok, true);
  assert.equal(env.ss.getSheetByName('Jogos').rows.length, 1); // só o cabeçalho
  assert.equal(env.chamar('cotas.criar', { token: joao, bolaoId: id }).ok, true);
  assert.equal(env.chamar('cotas.minhas', { token: maria }).dados.length, 0);
});

test('cota abandonada por 48h libera a vaga; o dono é avisado ao voltar', () => {
  const { env, id, maria, joao } = cenarioCotas({ limiteCotas: 1, prazo: T0 + 200 * HORA });
  const cotaId = env.chamar('cotas.criar', { token: maria, bolaoId: id }).dados.id;
  env.tempo += 47 * HORA;
  assert.equal(env.chamar('cotas.criar', { token: joao, bolaoId: id }).ok, false); // ainda ocupa
  env.tempo += 2 * HORA;
  assert.equal(env.chamar('boloes.abertos', { token: joao }).dados[0].vagas, 1);
  assert.equal(env.chamar('cotas.criar', { token: joao, bolaoId: id }).ok, true);
  const volta = env.chamar('jogos.salvar', { token: maria, cotaId, numeros: [1, 2, 3, 4, 5, 6] });
  assert.equal(volta.ok, false);
  assert.match(volta.erro, /expirou por inatividade/);
});

test('atividade renova o prazo de abandono', () => {
  const { env, id, maria } = cenarioCotas({ prazo: T0 + 300 * HORA });
  const cotaId = env.chamar('cotas.criar', { token: maria, bolaoId: id }).dados.id;
  env.tempo += 40 * HORA;
  assert.equal(env.chamar('jogos.salvar', { token: maria, cotaId, numeros: [1, 2, 3, 4, 5, 6] }).ok, true);
  env.tempo += 40 * HORA; // 80h desde a criação, 40h desde a atividade
  assert.equal(env.chamar('jogos.salvar', { token: maria, cotaId, numeros: [7, 8, 9, 10, 11, 12] }).ok, true);
});

test('bolão fechado, em rascunho ou com prazo vencido não aceita cota nem jogo', () => {
  const { env, token, id, maria } = cenarioCotas({ prazo: T0 + 10 * HORA });
  const cotaId = env.chamar('cotas.criar', { token: maria, bolaoId: id }).dados.id;
  env.tempo += 11 * HORA;
  const a = env.chamar('jogos.salvar', { token: maria, cotaId, numeros: [1, 2, 3, 4, 5, 6] });
  assert.equal(a.ok, false);
  assert.match(a.erro, /prazo/);
  assert.equal(env.chamar('cotas.criar', { token: maria, bolaoId: id }).ok, false);

  const rasc = env.chamar('admin.boloes.criar', { token, ...bolaoValido({ prazo: env.tempo + 50 * HORA }) }).dados.id;
  const r = env.chamar('cotas.criar', { token: maria, bolaoId: rasc });
  assert.equal(r.ok, false);
  assert.match(r.erro, /não está aberto/);
  assert.equal(env.chamar('cotas.criar', { token: maria, bolaoId: 'inexistente' }).ok, false);
});

test('administrador também pode participar; ações exigem login', () => {
  const { env, token, id } = cenarioCotas();
  assert.equal(env.chamar('cotas.criar', { token, bolaoId: id }).ok, true);
  for (const acao of ['cotas.minhas', 'cotas.criar', 'cotas.cancelar', 'jogos.salvar', 'jogos.remover']) {
    assert.equal(env.chamar(acao, { bolaoId: id }).ok, false, acao);
  }
});

test('contagem de vagas do administrador acompanha as cotas', () => {
  const { env, token, id, maria } = cenarioCotas({ limiteCotas: 5 });
  env.chamar('cotas.criar', { token: maria, bolaoId: id });
  const lista = env.chamar('admin.boloes.listar', { token }).dados;
  assert.equal(lista[0].cotasOcupadas, 1);
  assert.equal(lista[0].vagas, 4);
});

test('nenhuma operação de cota deixa o lock preso', () => {
  const { env, id, maria } = cenarioCotas();
  const cotaId = env.chamar('cotas.criar', { token: maria, bolaoId: id }).dados.id;
  env.chamar('jogos.salvar', { token: maria, cotaId, numeros: [1, 2, 3, 4, 5, 6] });
  env.chamar('jogos.salvar', { token: maria, cotaId, numeros: [1, 2, 3, 4, 5, 6] }); // erro de propósito
  env.chamar('cotas.cancelar', { token: maria, cotaId });
  assert.equal(env.estaTravado(), false);
});
