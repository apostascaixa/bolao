const test = require('node:test');
const assert = require('node:assert/strict');
const { novoAmbiente } = require('./mocks-apps-script.js');

const T0 = 1_800_000_000_000;
// PNG mínimo válido (1x1)
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const BASE = 'https://servicebus2.caixa.gov.br/portaldeloterias/api/';

function comAdmin() {
  const env = novoAmbiente();
  env.ctx.RELOGIO.agora = () => T0;
  env.propriedades.HASH_ITER = '20';
  env.ctx.configurar();
  env.ctx.primeiroAdmin();
  const codigo = env.logs.find((l) => l.includes('CÓDIGO DO PRIMEIRO')).match(/: ([0-9A-F-]{23})$/)[1];
  const r = env.chamar('cadastrar', { codigoConvite: codigo, usuario: 'admin', nome: 'Administrador', senha: 'senha-forte-1' });
  assert.equal(r.ok, true, JSON.stringify(r));
  return { env, token: r.dados.token };
}

const caixa = (extra = {}) => ({
  numero: 3083, dataApuracao: '08/11/2026', listaDezenas: ['22', '25', '29', '37', '46', '54'],
  listaRateioPremio: [{ descricaoFaixa: '6 acertos', faixa: 1, numeroDeGanhadores: 1, valorPremio: 59526903.72 }],
  acumulado: false, valorEstimadoProximoConcurso: 3500000, dataProximoConcurso: '10/11/2026', ...extra
});
function fonteOk(env, base = BASE) {
  env.rotasFetch[base + 'megasena'] = { codigo: 200, corpo: caixa() };
  env.rotasFetch[base + 'lotofacil'] = { codigo: 200, corpo: caixa({ numero: 3824, listaDezenas: ['01', '02', '03', '07', '11', '12', '13', '14', '15', '17', '18', '19', '22', '24', '25'], listaRateioPremio: [{ numeroDeGanhadores: 2 }], valorEstimadoProximoConcurso: 2000000 }) };
  env.rotasFetch[base + 'quina'] = { codigo: 200, corpo: caixa({ numero: 7162, listaDezenas: ['09', '29', '46', '57', '66'], listaRateioPremio: [{ numeroDeGanhadores: 0 }], acumulado: true }) };
}

// ---------- resultados das loterias ----------
test('loterias: busca as 3 na fonte padrão, normaliza e usa cache', () => {
  const { env } = comAdmin();
  fonteOk(env);
  const r1 = env.chamar('publico.loterias', {});
  assert.equal(r1.ok, true, JSON.stringify(r1));
  assert.equal(r1.dados.ativo, true);
  assert.deepEqual(r1.dados.loterias.map((l) => [l.chave, l.concurso, l.ganhadores, l.acumulou]),
    [['megasena', 3083, 1, false], ['lotofacil', 3824, 2, false], ['quina', 7162, 0, true]]);
  assert.equal(r1.dados.loterias[2].dezenas.length, 5);
  assert.equal(r1.dados.loterias[0].proximoPremio, 3500000);
  assert.equal(env.fetchLog.length, 3);
  env.chamar('publico.loterias', {});
  assert.equal(env.fetchLog.length, 3, 'segunda chamada vem do cache');
});

test('loterias: não exige login (rota pública)', () => {
  const { env } = comAdmin();
  fonteOk(env);
  assert.equal(env.chamar('publico.loterias', { token: 'lixo' }).ok, true);
});

test('loterias: se uma falha, mostra o último resultado bom e cache curto', () => {
  const { env } = comAdmin();
  fonteOk(env);
  env.chamar('publico.loterias', {});
  env.cache.clear();
  env.rotasFetch[BASE + 'quina'] = { codigo: 500, corpo: '' };
  const r = env.chamar('publico.loterias', {});
  assert.equal(r.dados.loterias.length, 3, 'quina veio do último resultado salvo');
  assert.equal(r.dados.loterias[2].concurso, 7162);
  assert.ok(env.erros.some((e) => e.includes('Quina: HTTP 500')));
});

test('loterias: fonte fora do ar e sem histórico devolve lista vazia sem quebrar', () => {
  const { env } = comAdmin();
  const r = env.chamar('publico.loterias', {});
  assert.equal(r.ok, true);
  assert.deepEqual(r.dados.loterias, []);
});

test('loterias: resposta estranha (sem dezenas) é recusada; dezenas inválidas são filtradas', () => {
  const { env } = comAdmin();
  fonteOk(env);
  env.rotasFetch[BASE + 'megasena'] = { codigo: 200, corpo: caixa({ listaDezenas: [] }) };
  env.rotasFetch[BASE + 'lotofacil'] = { codigo: 200, corpo: caixa({ numero: 1, listaDezenas: ['01', '<script>', '2'] }) };
  const r = env.chamar('publico.loterias', {});
  const lot = r.dados.loterias.find((l) => l.chave === 'lotofacil');
  assert.deepEqual(lot.dezenas, ['01', '02']);
  assert.equal(r.dados.loterias.find((l) => l.chave === 'megasena'), undefined);
});

test('admin: salvar fonte e desligar; o cache é limpo ao salvar', () => {
  const { env, token } = comAdmin();
  fonteOk(env);
  env.chamar('publico.loterias', {});
  const outra = 'https://exemplo.com/api/';
  fonteOk(env, outra);
  const s = env.chamar('admin.config.salvar', { token, loterias: { apiBase: outra } });
  assert.equal(s.ok, true, JSON.stringify(s));
  assert.equal(s.dados.loterias.apiBase, outra);
  assert.equal(s.dados.loterias.apiPadrao, BASE);
  env.fetchLog.length = 0;
  env.chamar('publico.loterias', {});
  assert.ok(env.fetchLog[0].startsWith(outra), 'usou a fonte nova: ' + env.fetchLog[0]);
  const off = env.chamar('admin.config.salvar', { token, loterias: { ativo: false } });
  assert.equal(off.dados.loterias.ativo, false);
  assert.equal(env.chamar('publico.loterias', {}).dados.ativo, false);
  assert.equal(env.chamar('publico.config', {}).dados.loterias.ativo, false);
});

test('admin: endereço da fonte inválido é recusado; {loteria} é aceito; vazio volta ao padrão', () => {
  const { env, token } = comAdmin();
  for (const ruim of ['http://exemplo.com/', 'exemplo.com', 'https://a b.com/', 'https://x.com/?q=1', 'javascript:alert(1)']) {
    const r = env.chamar('admin.config.salvar', { token, loterias: { apiBase: ruim } });
    assert.equal(r.ok, false, ruim);
  }
  const ok = env.chamar('admin.config.salvar', { token, loterias: { apiBase: 'https://x.com/api/{loteria}/latest' } });
  assert.equal(ok.dados.loterias.apiBase, 'https://x.com/api/{loteria}/latest');
  env.rotasFetch['https://x.com/api/quina/latest'] = { codigo: 200, corpo: caixa({ numero: 9, listaDezenas: ['01', '02', '03', '04', '05'] }) };
  const t = env.chamar('admin.loterias.testar', { token });
  assert.equal(t.dados.find((x) => x.chave === 'quina').ok, true);
  const volta = env.chamar('admin.config.salvar', { token, loterias: { apiBase: '' } });
  assert.equal(volta.dados.loterias.apiBase, '');
});

test('admin: testar fonte mostra o resultado de cada loteria sem gravar nada', () => {
  const { env, token } = comAdmin();
  fonteOk(env);
  env.rotasFetch[BASE + 'quina'] = { codigo: 403, corpo: '' };
  const t = env.chamar('admin.loterias.testar', { token });
  assert.equal(t.ok, true);
  assert.deepEqual(t.dados.map((x) => x.ok), [true, true, false]);
  assert.equal(t.dados[2].erro, 'HTTP 403');
  assert.equal(t.dados[0].concurso, 3083);
  assert.equal(env.propriedades['loterias.ultimo.megasena'], undefined, 'testar não grava histórico');
});

test('testar fonte exige administrador', () => {
  const { env } = comAdmin();
  assert.equal(env.chamar('admin.loterias.testar', {}).ok, false);
  assert.equal(env.chamar('admin.loterias.testar', { token: 'xyz' }).ok, false);
});

// ---------- espaços de propaganda ----------
test('propagandas: começam desativadas e o público só recebe o que está em uso', () => {
  const { env, token } = comAdmin();
  const pub = env.chamar('publico.config', {}).dados;
  for (const n of ['navbar', 'lateral', 'rodape']) assert.deepEqual(pub.slots[n], { tipo: '', imagemId: '', link: '', codigo: '' });
  const r = env.chamar('admin.config.salvar', { token, slots: { rodape: { tipo: 'codigo', codigo: '<div>anúncio</div>\r\n<script>1</script>' }, lateral: { tipo: 'imagem', link: 'https://loja.com/p' } } });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.dados.slots.rodape.codigo, '<div>anúncio</div>\n<script>1</script>');
  const p2 = env.chamar('publico.config', {}).dados;
  assert.equal(p2.slots.rodape.codigo, '<div>anúncio</div>\n<script>1</script>');
  assert.equal(p2.slots.lateral.imagemId, '', 'sem imagem enviada ainda');
  assert.equal(p2.slots.lateral.codigo, '');
  // trocar para imagem esconde o código do público, mas o admin continua vendo o que digitou
  env.chamar('admin.config.salvar', { token, slots: { rodape: { tipo: 'imagem' } } });
  assert.equal(env.chamar('publico.config', {}).dados.slots.rodape.codigo, '');
  assert.equal(env.chamar('admin.config.obter', { token }).dados.slots.rodape.codigo, '<div>anúncio</div>\n<script>1</script>');
});

test('propagandas: código com fórmula/símbolos fica intacto na planilha', () => {
  const { env, token } = comAdmin();
  const cod = '=1+1 <a href="https://x.com">+ -</a> 12e4';
  env.chamar('admin.config.salvar', { token, slots: { navbar: { tipo: 'codigo', codigo: cod } } });
  assert.equal(env.chamar('publico.config', {}).dados.slots.navbar.codigo, cod);
});

test('propagandas: validações (tipo, link, tamanho) e nome de espaço desconhecido é ignorado', () => {
  const { env, token } = comAdmin();
  assert.equal(env.chamar('admin.config.salvar', { token, slots: { navbar: { tipo: 'script' } } }).ok, false);
  assert.equal(env.chamar('admin.config.salvar', { token, slots: { navbar: { link: 'http://inseguro.com' } } }).ok, false);
  assert.equal(env.chamar('admin.config.salvar', { token, slots: { navbar: { codigo: 'x'.repeat(6001) } } }).ok, false);
  const ok = env.chamar('admin.config.salvar', { token, slots: { inexistente: { tipo: 'codigo', codigo: 'x' } } });
  assert.equal(ok.ok, true);
  assert.equal(ok.dados.slots.inexistente, undefined);
});

test('propagandas: só administrador altera', () => {
  const { env } = comAdmin();
  assert.equal(env.chamar('admin.config.salvar', { slots: { navbar: { tipo: 'codigo', codigo: 'x' } } }).ok, false);
  assert.equal(env.chamar('admin.config.salvar', { token: 'xyz', loterias: { ativo: false } }).ok, false);
});

test('propagandas: enviar imagem para um espaço liga o modo imagem, guarda o link e a imagem é pública', () => {
  const { env, token } = comAdmin();
  const r = env.chamar('admin.imagem.enviar', { token, uso: 'slot_lateral', dataUrl: PNG, link: 'https://loja.com/oferta' });
  assert.equal(r.ok, true, JSON.stringify(r));
  const s = r.dados.slots.lateral;
  assert.equal(s.tipo, 'imagem');
  assert.equal(s.link, 'https://loja.com/oferta');
  assert.ok(s.imagemId);
  const pub = env.chamar('publico.config', {}).dados.slots.lateral;
  assert.equal(pub.imagemId, s.imagemId);
  const img = env.chamar('imagem.obter', { id: s.imagemId });
  assert.equal(img.ok, true, JSON.stringify(img));
  assert.ok(img.dados.dataUrl.startsWith('data:image/png;base64,'));
});

test('propagandas: nova imagem substitui a antiga e remove do armazenamento; remover limpa o espaço', () => {
  const { env, token } = comAdmin();
  const a = env.chamar('admin.imagem.enviar', { token, uso: 'slot_navbar', dataUrl: PNG }).dados.slots.navbar.imagemId;
  const b = env.chamar('admin.imagem.enviar', { token, uso: 'slot_navbar', dataUrl: PNG }).dados.slots.navbar.imagemId;
  assert.notEqual(a, b);
  assert.equal(env.chamar('imagem.obter', { id: a }).ok, false, 'antiga foi apagada');
  assert.equal(env.chamar('imagem.obter', { id: b }).ok, true);
  const rem = env.chamar('admin.imagem.remover', { token, uso: 'slot_navbar' });
  assert.equal(rem.dados.slots.navbar.imagemId, '');
  assert.equal(env.chamar('imagem.obter', { id: b }).ok, false);
});

test('propagandas: usos de imagem inválidos continuam recusados; QR e topo seguem funcionando', () => {
  const { env, token } = comAdmin();
  assert.equal(env.chamar('admin.imagem.enviar', { token, uso: 'slot_outro', dataUrl: PNG }).ok, false);
  assert.equal(env.chamar('admin.imagem.enviar', { token, uso: 'constructor', dataUrl: PNG }).ok, false);
  assert.equal(env.chamar('admin.imagem.remover', { token, uso: 'toString' }).ok, false);
  const t = env.chamar('admin.imagem.enviar', { token, uso: 'topo', dataUrl: PNG });
  assert.equal(t.ok, true);
  assert.ok(t.dados.topo.imagemId);
  assert.equal(env.chamar('admin.imagem.enviar', { token, uso: 'qr', dataUrl: PNG }).ok, true);
});

test('a versão da API mudou para 9 (confirma o deploy pelo navegador)', () => {
  const { env } = comAdmin();
  const r = JSON.parse(env.ctx.doGet().getContent());
  assert.equal(r.versao, '9');
});
