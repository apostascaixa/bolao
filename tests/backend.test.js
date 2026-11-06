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
  env.ctx.lerTabela = () => { throw new Error('falha simulada'); }; // quebra de propósito
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

test('doGet informa a versão publicada e conhece as ações da etapa 4', () => {
  const env = preparar();
  const r = JSON.parse(env.ctx.doGet().getContent());
  assert.deepEqual(r, { ok: true, servico: 'bolao-api', versao: '5' });
  for (const a of ['cotas.minhas', 'cotas.criar', 'cotas.cancelar', 'jogos.salvar', 'jogos.remover']) {
    assert.ok(Object.prototype.hasOwnProperty.call(env.ctx.ACOES, a), a);
  }
});

// ---------- PIX, aprovação, página pública, config e imagens ----------
const crypto = require('node:crypto');
const zlib = require('node:zlib');

function pngBase64(lado = 4) {
  const crc32 = (buf) => zlib.crc32(buf);
  const bloco = (tipo, dados) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(dados.length);
    const t = Buffer.from(tipo);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc32(Buffer.concat([t, dados])) >>> 0);
    return Buffer.concat([len, t, dados, c]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(lado, 0); ihdr.writeUInt32BE(lado, 4); ihdr[8] = 8; ihdr[9] = 2;
  const linha = Buffer.concat([Buffer.from([0]), Buffer.alloc(lado * 3, 200)]);
  const raw = Buffer.concat(Array.from({ length: lado }, () => linha));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), bloco('IHDR', ihdr), bloco('IDAT', zlib.deflateSync(raw)), bloco('IEND', Buffer.alloc(0))]).toString('base64');
}
const dataUrlPng = (lado) => 'data:image/png;base64,' + pngBase64(lado);

function configurarPix(env, token, extra = {}) {
  const r = env.chamar('admin.config.salvar', { token, pix: { chave: 'bolao@exemplo.com', nome: 'João da Silva', cidade: 'Brasília', instrucoes: 'Pague e aguarde.', ...extra } });
  assert.equal(r.ok, true, JSON.stringify(r));
}

function cotaCompleta(env, tokenUser, bolaoId) {
  const cotaId = env.chamar('cotas.criar', { token: tokenUser, bolaoId }).dados.id;
  [[1, 2, 3, 4, 5, 6], [7, 8, 9, 10, 11, 12], [13, 14, 15, 16, 17, 18]].forEach((n) => env.chamar('jogos.salvar', { token: tokenUser, cotaId, numeros: n }));
  return cotaId;
}

test('gerar PIX: exige cota completa, PIX configurado e trava os jogos', () => {
  const { env, token, id, maria } = cenarioCotas();
  const cotaId = env.chamar('cotas.criar', { token: maria, bolaoId: id }).dados.id;
  assert.match(env.chamar('cotas.gerarPix', { token: maria, cotaId }).erro, /Complete todos os 3 jogos/);
  [[1, 2, 3, 4, 5, 6], [7, 8, 9, 10, 11, 12], [13, 14, 15, 16, 17, 18]].forEach((n) => env.chamar('jogos.salvar', { token: maria, cotaId, numeros: n }));
  assert.match(env.chamar('cotas.gerarPix', { token: maria, cotaId }).erro, /ainda não configurou o PIX/);

  configurarPix(env, token);
  const r = env.chamar('cotas.gerarPix', { token: maria, cotaId });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.dados.cota.status, 'aguardando_pagamento');
  assert.ok(r.dados.cota.pixGeradoEm > 0);
  assert.equal(r.dados.pix.valorCentavos, 6000);
  assert.ok(r.dados.pix.copiaECola.startsWith('000201'));
  assert.ok(r.dados.pix.copiaECola.includes('60.00'));
  assert.equal(r.dados.pix.instrucoes, 'Pague e aguarde.');

  // trava: não edita, não remove, não cancela, não gera de novo
  const jogoId = r.dados.cota.jogos[0].id;
  assert.equal(env.chamar('jogos.salvar', { token: maria, cotaId, numeros: [20, 21, 22, 23, 24, 25], jogoId }).ok, false);
  assert.equal(env.chamar('jogos.remover', { token: maria, cotaId, jogoId }).ok, false);
  assert.equal(env.chamar('cotas.cancelar', { token: maria, cotaId }).ok, false);
  assert.equal(env.chamar('cotas.gerarPix', { token: maria, cotaId }).ok, false);
  // releitura do PIX
  assert.equal(env.chamar('cotas.pix', { token: maria, cotaId }).dados.valorCentavos, 6000);
});

test('PIX só com QR (sem chave) também libera a geração', () => {
  const { env, token, id, maria } = cenarioCotas();
  assert.equal(env.chamar('admin.imagem.enviar', { token, uso: 'qr', dataUrl: dataUrlPng() }).ok, true);
  const cotaId = cotaCompleta(env, maria, id);
  const r = env.chamar('cotas.gerarPix', { token: maria, cotaId });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.dados.pix.copiaECola, '');
  assert.ok(r.dados.pix.qrImagemId);
});

test('PIX de outra pessoa não é acessível; sem login é recusado', () => {
  const { env, token, id, maria, joao } = cenarioCotas();
  configurarPix(env, token);
  const cotaId = cotaCompleta(env, maria, id);
  env.chamar('cotas.gerarPix', { token: maria, cotaId });
  assert.equal(env.chamar('cotas.gerarPix', { token: joao, cotaId }).ok, false);
  assert.equal(env.chamar('cotas.pix', { token: joao, cotaId }).ok, false);
  assert.equal(env.chamar('cotas.pix', { cotaId }).ok, false);
});

test('aprovação: lista pendentes, aprova e só admin pode', () => {
  const { env, token, id, maria } = cenarioCotas();
  configurarPix(env, token);
  const cotaId = cotaCompleta(env, maria, id);
  env.chamar('cotas.gerarPix', { token: maria, cotaId });

  assert.equal(env.chamar('admin.cotas.listar', { token: maria }).ok, false);
  assert.equal(env.chamar('admin.cotas.aprovar', { token: maria, cotaId }).ok, false);
  const pend = env.chamar('admin.cotas.listar', { token }).dados;
  assert.equal(pend.length, 1);
  assert.equal(pend[0].usuario.usuario, 'maria');
  assert.equal(pend[0].bolaoNome, 'Mega da Virada');
  assert.equal(pend[0].jogos.length, 3);
  assert.deepEqual(env.chamar('admin.boloes.listar', { token }).dados[0].aguardando, 1);

  const ap = env.chamar('admin.cotas.aprovar', { token, cotaId });
  assert.equal(ap.dados.status, 'confirmada');
  assert.equal(env.chamar('admin.cotas.aprovar', { token, cotaId }).ok, false); // já aprovada
  const minhas = env.chamar('cotas.minhas', { token: maria }).dados[0];
  assert.equal(minhas.status, 'confirmada');
  assert.ok(minhas.confirmadaEm > 0);
  assert.equal(env.chamar('admin.boloes.listar', { token }).dados[0].confirmadas, 1);
  // confirmada nunca expira por abandono (limite de 48h) e continua ocupando a vaga
  env.tempo += 100 * HORA;
  assert.equal(env.chamar('cotas.minhas', { token: maria }).dados.length, 1);
});

test('reprovação volta a cota para "completa" com o motivo e permite novo PIX', () => {
  const { env, token, id, maria } = cenarioCotas();
  configurarPix(env, token);
  const cotaId = cotaCompleta(env, maria, id);
  env.chamar('cotas.gerarPix', { token: maria, cotaId });
  assert.equal(env.chamar('admin.cotas.reprovar', { token, cotaId, motivo: '' }).ok, false);
  assert.equal(env.chamar('admin.cotas.reprovar', { token, cotaId, motivo: 'Pagamento não identificado' }).ok, true);
  const c = env.chamar('cotas.minhas', { token: maria }).dados[0];
  assert.equal(c.status, 'completa');
  assert.equal(c.observacao, 'Pagamento não identificado');
  assert.equal(env.chamar('admin.cotas.listar', { token }).dados.length, 0);
  // pode editar de novo e gerar outro PIX; o motivo some
  assert.equal(env.chamar('jogos.salvar', { token: maria, cotaId, numeros: [30, 31, 32, 33, 34, 35], jogoId: c.jogos[0].id }).ok, true);
  const novo = env.chamar('cotas.gerarPix', { token: maria, cotaId });
  assert.equal(novo.ok, true, JSON.stringify(novo));
  assert.equal(novo.dados.cota.observacao, '');
});

test('aguardando aprovação não expira por abandono', () => {
  const { env, token, id, maria } = cenarioCotas({ limiteCotas: 1, prazo: T0 + 500 * HORA });
  configurarPix(env, token);
  const cotaId = cotaCompleta(env, maria, id);
  env.chamar('cotas.gerarPix', { token: maria, cotaId });
  env.tempo += 100 * HORA;
  assert.equal(env.chamar('boloes.abertos', { token: maria }).dados[0].vagas, 0);
  assert.equal(env.chamar('admin.cotas.aprovar', { token, cotaId }).ok, true);
});

test('página pública: só aprovados, nome abreviado, sem usuário; não exige login', () => {
  const { env, token, id, maria, joao } = cenarioCotas();
  configurarPix(env, token);
  const c1 = cotaCompleta(env, maria, id);
  const c2 = cotaCompleta(env, joao, id);
  env.chamar('cotas.gerarPix', { token: maria, cotaId: c1 });
  env.chamar('cotas.gerarPix', { token: joao, cotaId: c2 });
  env.chamar('admin.cotas.aprovar', { token, cotaId: c1 });

  const pub = env.chamar('publico.jogos', {});
  assert.equal(pub.ok, true);
  const b = pub.dados[0];
  assert.equal(b.confirmadas, 1);
  assert.equal(b.participantes.length, 1);
  assert.equal(b.participantes[0].nome, 'Maria S.');
  assert.equal(b.participantes[0].jogos.length, 3);
  const texto = JSON.stringify(pub);
  for (const proibido of ['maria"', 'joao', 'João', 'hashSenha', 'bolao@exemplo.com', 'userId', 'Silva']) assert.ok(!texto.includes(proibido), proibido);
});

test('página pública não lista bolão em rascunho nem arquivado', () => {
  const { env, token } = comAdmin();
  env.chamar('admin.boloes.criar', { token, ...bolaoValido() });
  assert.deepEqual(env.chamar('publico.jogos', {}).dados, []);
});

test('nome abreviado cobre nomes simples e compostos', () => {
  const env = preparar();
  assert.equal(env.ctx.nomeAbreviado('Maria'), 'Maria');
  assert.equal(env.ctx.nomeAbreviado('Maria Silva'), 'Maria S.');
  assert.equal(env.ctx.nomeAbreviado('  Ana  Paula  de souza '), 'Ana S.');
});

// ----- configuração -----
test('config: validações do PIX, link e velocidade; só admin', () => {
  const { env, token, maria: _m } = (() => { const a = comAdmin(); return { ...a, maria: convidarParticipante(a.env, a.token) }; })();
  const salvar = (corpo) => env.chamar('admin.config.salvar', { token, ...corpo });
  assert.equal(salvar({ pix: { chave: 'x@y.com', nome: '', cidade: 'Brasília' } }).ok, false);
  assert.equal(salvar({ pix: { chave: 'x'.repeat(200), nome: 'A', cidade: 'B' } }).ok, false);
  assert.equal(salvar({ topo: { link: 'http://inseguro.com' } }).ok, false);
  assert.equal(salvar({ topo: { link: 'javascript:alert(1)' } }).ok, false);
  assert.equal(salvar({ carrossel: { segundos: 1 } }).ok, false);
  assert.equal(salvar({ carrossel: { segundos: 31 } }).ok, false);
  assert.equal(salvar({ carrossel: { segundos: 4.5 } }).ok, false);
  const ok = salvar({ carrossel: { segundos: 10, incluirBoloes: false }, topo: { link: 'https://exemplo.com/x' } });
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.equal(ok.dados.carrossel.segundos, 10);
  assert.equal(ok.dados.carrossel.incluirBoloes, false);
  assert.equal(ok.dados.topo.link, 'https://exemplo.com/x');
  assert.equal(env.chamar('admin.config.salvar', { token: _m, carrossel: { segundos: 5 } }).ok, false);
  assert.equal(env.chamar('admin.config.obter', { token: _m }).ok, false);
});

test('config pública: velocidade padrão, sem chave PIX', () => {
  const { env, token } = comAdmin();
  assert.equal(env.chamar('publico.config', {}).dados.carrossel.segundos, 6);
  configurarPix(env, token);
  env.chamar('admin.config.salvar', { token, carrossel: { segundos: 12 } });
  const pub = env.chamar('publico.config', {});
  assert.equal(pub.dados.carrossel.segundos, 12);
  assert.ok(!JSON.stringify(pub).includes('bolao@exemplo.com'));
  assert.ok(!('pix' in pub.dados));
});

// ----- imagens e banners -----
test('imagem: envia, recebe de volta idêntica, em várias partes', () => {
  const { env, token } = comAdmin();
  const url = dataUrlPng(120); // grande o bastante para mais de uma parte? ver abaixo
  const r = env.chamar('admin.imagem.enviar', { token, uso: 'topo', dataUrl: url });
  assert.equal(r.ok, true, JSON.stringify(r));
  const id = r.dados.topo.imagemId;
  const volta = env.chamar('imagem.obter', { id });
  assert.equal(volta.ok, true);
  assert.equal(volta.dados.dataUrl, url);
});

test('imagem grande é dividida em partes de até 30 mil caracteres e reconstruída', () => {
  const { env, token } = comAdmin();
  const lixo = crypto.randomBytes(120000).toString('base64'); // ~160 mil caracteres
  const url = 'data:image/jpeg;base64,/9j/' + lixo.replace(/[^A-Za-z0-9+/]/g, 'A');
  const r = env.chamar('admin.imagem.enviar', { token, uso: 'topo', dataUrl: url });
  assert.equal(r.ok, true, JSON.stringify(r));
  const linhas = env.ss.getSheetByName('Imagens').rows.length - 1;
  assert.ok(linhas >= 5 && linhas <= 7, 'partes: ' + linhas);
  for (const row of env.ss.getSheetByName('Imagens').rows.slice(1)) assert.ok(String(row[3]).length <= 30001);
  assert.equal(env.chamar('imagem.obter', { id: r.dados.topo.imagemId }).dados.dataUrl, url);
});

test('imagem inválida, grande demais ou de tipo perigoso é recusada', () => {
  const { env, token } = comAdmin();
  const enviar = (dataUrl, uso = 'topo') => env.chamar('admin.imagem.enviar', { token, uso, dataUrl });
  assert.equal(enviar('texto qualquer').ok, false);
  assert.equal(enviar('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=').ok, false);
  assert.equal(enviar('data:text/html;base64,PGh0bWw+').ok, false);
  assert.equal(enviar('data:image/png;base64,AAAA').ok, false);                   // assinatura errada
  assert.equal(enviar('data:image/png;base64,iVBORw0KGgo' + 'A'.repeat(300001)).ok, false);
  assert.equal(enviar(dataUrlPng(), 'outro').ok, false);
  assert.equal(enviar(null).ok, false);
  assert.equal(env.ss.getSheetByName('Imagens').rows.length, 1); // nada foi gravado
});

test('trocar a imagem remove a antiga; remover limpa tudo', () => {
  const { env, token } = comAdmin();
  const a = env.chamar('admin.imagem.enviar', { token, uso: 'topo', dataUrl: dataUrlPng(8) }).dados.topo.imagemId;
  const b = env.chamar('admin.imagem.enviar', { token, uso: 'topo', dataUrl: dataUrlPng(16) }).dados.topo.imagemId;
  assert.notEqual(a, b);
  assert.equal(env.chamar('imagem.obter', { id: a }).ok, false);
  assert.equal(env.chamar('imagem.obter', { id: b }).ok, true);
  const rem = env.chamar('admin.imagem.remover', { token, uso: 'topo' });
  assert.equal(rem.dados.topo.imagemId, '');
  assert.equal(env.ss.getSheetByName('Imagens').rows.length, 1);
  assert.equal(env.chamar('admin.imagem.remover', { token, uso: 'banner' }).ok, false);
});

test('imagem do QR do PIX exige login; banners são públicos; id inventado não vaza nada', () => {
  const { env, token } = comAdmin();
  const qr = env.chamar('admin.imagem.enviar', { token, uso: 'qr', dataUrl: dataUrlPng(6) }).dados.pix.qrImagemId;
  const topo = env.chamar('admin.imagem.enviar', { token, uso: 'topo', dataUrl: dataUrlPng(7) }).dados.topo.imagemId;
  assert.equal(env.chamar('imagem.obter', { id: qr }).ok, false);
  assert.equal(env.chamar('imagem.obter', { id: qr, token }).ok, true);
  assert.equal(env.chamar('imagem.obter', { id: topo }).ok, true);
  assert.equal(env.chamar('imagem.obter', { id: 'inventado' }).ok, false);
  assert.equal(env.chamar('imagem.obter', { id: 123 }).ok, false);
  assert.equal(env.chamar('imagem.obter', {}).ok, false);
});

test('banners: adicionar, reordenar, ocultar, editar e remover; o público só vê os ativos', () => {
  const { env, token } = comAdmin();
  const add = (titulo, extra = {}) => env.chamar('admin.imagem.enviar', { token, uso: 'banner', titulo, dataUrl: dataUrlPng(5), ...extra });
  add('Primeiro'); add('Segundo', { link: 'https://exemplo.com' }); add('Terceiro');
  let cfg = env.chamar('admin.config.obter', { token }).dados;
  assert.deepEqual(cfg.banners.map((b) => b.titulo), ['Primeiro', 'Segundo', 'Terceiro']);
  const [b1, b2, b3] = cfg.banners;

  cfg = env.chamar('admin.banners.mover', { token, id: b3.id, direcao: 'cima' }).dados;
  assert.deepEqual(cfg.banners.map((b) => b.titulo), ['Primeiro', 'Terceiro', 'Segundo']);
  cfg = env.chamar('admin.banners.mover', { token, id: b1.id, direcao: 'cima' }).dados; // já é o primeiro
  assert.deepEqual(cfg.banners.map((b) => b.titulo), ['Primeiro', 'Terceiro', 'Segundo']);
  assert.equal(env.chamar('admin.banners.mover', { token, id: b1.id, direcao: 'lado' }).ok, false);

  env.chamar('admin.banners.atualizar', { token, id: b2.id, ativo: false, titulo: 'Segundo!' });
  const pub = env.chamar('publico.config', {}).dados.banners;
  assert.deepEqual(pub.map((b) => b.titulo), ['Primeiro', 'Terceiro']);
  assert.equal(env.chamar('admin.banners.atualizar', { token, id: b1.id, link: 'ftp://x' }).ok, false);

  env.chamar('admin.banners.remover', { token, id: b1.id });
  assert.equal(env.chamar('admin.config.obter', { token }).dados.banners.length, 2);
  assert.equal(env.chamar('imagem.obter', { id: b1.imagemId }).ok, false);
  assert.equal(env.chamar('admin.banners.remover', { token, id: b1.id }).ok, false);
});

test('limite de 10 banners', () => {
  const { env, token } = comAdmin();
  for (let i = 0; i < 10; i++) assert.equal(env.chamar('admin.imagem.enviar', { token, uso: 'banner', dataUrl: dataUrlPng(3) }).ok, true);
  const r = env.chamar('admin.imagem.enviar', { token, uso: 'banner', dataUrl: dataUrlPng(3) });
  assert.equal(r.ok, false);
  assert.match(r.erro, /Limite de 10/);
});

test('apenas admin envia ou remove imagens e banners', () => {
  const { env, token } = comAdmin();
  const tp = convidarParticipante(env, token);
  for (const [acao, corpo] of [['admin.imagem.enviar', { uso: 'topo', dataUrl: dataUrlPng() }], ['admin.imagem.remover', { uso: 'topo' }],
    ['admin.banners.atualizar', { id: 'x' }], ['admin.banners.mover', { id: 'x', direcao: 'cima' }], ['admin.banners.remover', { id: 'x' }]]) {
    assert.equal(env.chamar(acao, { token: tp, ...corpo }).ok, false, acao);
  }
});

test('abas novas são criadas sozinhas em planilhas da versão anterior', () => {
  const env = preparar();
  delete env.ss.sheets.Config; delete env.ss.sheets.Banners; delete env.ss.sheets.Imagens;
  env.ctx.primeiroAdmin();
  const cod = env.logs.find((l) => l.includes('CÓDIGO')).match(/: ([0-9A-F-]{23})$/)[1];
  const token = env.chamar('cadastrar', { codigoConvite: cod, usuario: 'admin', nome: 'Admin', senha: 'senha-forte-1' }).dados.token;
  assert.equal(env.chamar('publico.config', {}).ok, true);
  assert.equal(env.chamar('admin.config.obter', { token }).ok, true);
  assert.ok(env.ss.getSheetByName('Config'));
  assert.equal(env.ss.getSheetByName('Banners').rows[0][0], 'id');
});

test('nenhuma operação nova deixa o lock preso', () => {
  const { env, token, id, maria } = cenarioCotas();
  configurarPix(env, token);
  const cotaId = cotaCompleta(env, maria, id);
  env.chamar('cotas.gerarPix', { token: maria, cotaId });
  env.chamar('admin.cotas.reprovar', { token, cotaId, motivo: 'x' }); // erro de propósito (curto)
  env.chamar('admin.cotas.aprovar', { token, cotaId });
  env.chamar('admin.imagem.enviar', { token, uso: 'topo', dataUrl: 'lixo' });
  assert.equal(env.estaTravado(), false);
});
