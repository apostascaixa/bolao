// Teste de ponta a ponta (navegador real): resultados das loterias, espaços de propaganda e isolamento do código.
// Requer o pacote "playwright" instalado (não roda no `npm test`).
const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const { chromium } = require('playwright');
const { subir } = require('./e2e-servidor.js');

function png(lado, cor = 180) {
  const bloco = (tipo, dados) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(dados.length);
    const t = Buffer.from(tipo);
    const c = Buffer.alloc(4); c.writeUInt32BE(zlib.crc32(Buffer.concat([t, dados])) >>> 0);
    return Buffer.concat([len, t, dados, c]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(lado, 0); ihdr.writeUInt32BE(lado, 4); ihdr[8] = 8; ihdr[9] = 2;
  const linha = Buffer.concat([Buffer.from([0]), Buffer.alloc(lado * 3, cor)]);
  const raw = Buffer.concat(Array.from({ length: lado }, () => linha));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), bloco('IHDR', ihdr), bloco('IDAT', zlib.deflateSync(raw)), bloco('IEND', Buffer.alloc(0))]);
}
const arquivoPng = (nome, lado, cor) => ({ name: nome, mimeType: 'image/png', buffer: png(lado, cor) });

const BASE = 'https://servicebus2.caixa.gov.br/portaldeloterias/api/';
function fonteCaixa(env) {
  const base = { dataApuracao: '08/11/2026', acumulado: false, valorEstimadoProximoConcurso: 3500000, dataProximoConcurso: '10/11/2026' };
  env.rotasFetch[BASE + 'megasena'] = { codigo: 200, corpo: { ...base, numero: 3083, listaDezenas: ['22', '25', '29', '37', '46', '54'], listaRateioPremio: [{ numeroDeGanhadores: 1 }] } };
  env.rotasFetch[BASE + 'lotofacil'] = { codigo: 200, corpo: { ...base, numero: 3824, listaDezenas: ['01', '02', '03', '07', '11', '12', '13', '14', '15', '17', '18', '19', '22', '24', '25'], listaRateioPremio: [{ numeroDeGanhadores: 2 }] } };
  env.rotasFetch[BASE + 'quina'] = { codigo: 200, corpo: { ...base, numero: 7162, listaDezenas: ['09', '29', '46', '57', '66'], listaRateioPremio: [{ numeroDeGanhadores: 0 }], acumulado: true } };
}

const CODIGO_ANUNCIO = '<p id="anuncio-teste">Anúncio de teste</p><script>try{var t=parent.document.title;document.body.insertAdjacentHTML("beforeend","<i id=vazou>"+t+"</i>")}catch(e){document.body.insertAdjacentHTML("beforeend","<i id=isolado>sim</i>")}</script>';

test('resultados, propagandas e isolamento do código no navegador', async (t) => {
  const srv = await subir();
  fonteCaixa(srv.env);
  const browser = await chromium.launch();
  t.after(async () => { await browser.close(); srv.fechar(); });
  const erros = [];
  const novaPagina = async (largura) => {
    const ctx = await browser.newContext({ viewport: { width: largura, height: 900 } });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => erros.push(String(e)));
    await p.addInitScript((u) => { window.BOLAO_CONFIG = { API_URL: u }; }, srv.urlApi);
    return p;
  };
  const colunas = (p) => p.evaluate(() => getComputedStyle(document.getElementById('layout-site')).gridTemplateColumns.split(' ').length);

  // 1) página pública, nada configurado ainda: só os resultados
  const pub = await novaPagina(1400);
  await pub.goto(srv.urlSite + '/publico.html');
  await pub.locator('.lot-card').first().waitFor();
  assert.equal(await pub.locator('.lot-card').count(), 3);
  assert.equal(await pub.locator('.lot-card.lot-megasena .lot-bola').count(), 6);
  assert.equal(await pub.locator('.lot-card.lot-lotofacil .lot-bola').count(), 15);
  assert.equal(await pub.locator('.lot-card.lot-quina .lot-status').innerText(), 'ACUMULADA');
  assert.equal(await pub.locator('.lot-card.lot-lotofacil .lot-status').innerText(), '2 ganhadores');
  assert.match(await pub.locator('#faixa-resumo').innerText(), /Mega-Sena · Concurso 3083: 1 ganhador/);
  assert.equal(await pub.locator('#slot-lateral').isHidden(), true);
  assert.equal(await pub.locator('#slot-rodape').isHidden(), true);
  assert.equal(await pub.locator('#slot-navbar').isHidden(), true);
  assert.ok(await pub.locator('#layout-site.tem-esq').count() === 1 && await pub.locator('#layout-site.tem-dir').count() === 0);
  assert.equal(await colunas(pub), 2);
  await pub.getByText('Bolão da Sorte · Jogos confirmados').waitFor(); // o conteúdo original continua funcionando
  // a faixa gira sozinha
  const primeira = await pub.locator('#faixa-resumo').innerText();
  await pub.waitForFunction((a) => document.getElementById('faixa-resumo').textContent !== a, primeira, { timeout: 8000 });

  // 2) administrador
  const adm = await novaPagina(1400);
  await adm.goto(srv.urlSite + '/?convite=' + srv.codigoAdmin);
  await adm.getByLabel('Seu nome').fill('Admin Geral');
  await adm.getByLabel('Usuário').fill('admin');
  await adm.getByLabel('Senha', { exact: true }).fill('senha-forte-1');
  await adm.getByLabel('Repita a senha').fill('senha-forte-1');
  await adm.getByRole('button', { name: 'Criar conta' }).click();
  await adm.getByRole('heading', { name: 'Bolões', exact: true }).waitFor();
  await adm.locator('.lot-card').first().waitFor(); // resultados também aparecem logado
  await adm.getByRole('tab', { name: 'Propagandas' }).click();
  await adm.getByRole('heading', { name: 'Propagandas e resultados' }).waitFor();
  const cartao = (titulo) => adm.locator('section.cartao', { has: adm.getByRole('heading', { name: titulo, exact: true }) });

  // 2a) imagem na coluna da direita
  const lateral = cartao('Coluna da direita');
  await lateral.getByLabel('Link ao clicar na imagem (opcional)').fill('http://inseguro.com');
  await lateral.getByLabel('Enviar imagem').setInputFiles(arquivoPng('lat.png', 60, 90));
  await adm.getByText('O link deve começar com https://').waitFor();
  await lateral.getByLabel('Link ao clicar na imagem (opcional)').fill('https://exemplo.com/lateral');
  await lateral.getByLabel('Enviar imagem').setInputFiles(arquivoPng('lat.png', 60, 90));
  await adm.locator('#slot-lateral img.slot-img.carregada').waitFor();
  assert.equal(await adm.locator('#slot-lateral a').getAttribute('href'), 'https://exemplo.com/lateral');
  assert.equal(await adm.locator('#slot-lateral a').getAttribute('target'), '_blank');
  assert.match(await adm.locator('#slot-lateral a').getAttribute('rel'), /noopener/);
  assert.equal(await adm.locator('#layout-site.tem-esq.tem-dir').count(), 1);
  assert.equal(await colunas(adm), 3);

  // 2b) código de anúncio no rodapé: aparece, mas isolado
  const rodape = cartao('Rodapé');
  await rodape.getByLabel('O que mostrar neste espaço').selectOption('codigo');
  await rodape.getByLabel(/Cole aqui o código/).fill(CODIGO_ANUNCIO);
  await rodape.getByRole('button', { name: 'Salvar este espaço' }).click();
  await adm.getByText('Propaganda salva.').waitFor();
  const quadro = adm.frameLocator('#slot-rodape iframe');
  await quadro.locator('#anuncio-teste').waitFor();
  await quadro.locator('#isolado').waitFor();
  assert.equal(await quadro.locator('#vazou').count(), 0, 'o código do anúncio não pode ler a página');
  assert.equal(await adm.locator('#slot-rodape iframe').getAttribute('sandbox'), 'allow-scripts allow-popups allow-popups-to-escape-sandbox');
  await adm.waitForFunction(() => document.querySelector('#slot-rodape iframe').style.height !== '');
  const altura = await adm.locator('#slot-rodape iframe').evaluate((e) => e.getBoundingClientRect().height);
  assert.ok(altura >= 30 && altura < 90, 'o quadro se ajusta ao tamanho do anúncio (altura ' + altura + ')');

  // 2c) faixa abaixo do banner: tipo imagem sem imagem não mostra nada; com imagem mostra
  const faixa = cartao('Faixa abaixo do banner do topo');
  await faixa.getByLabel('O que mostrar neste espaço').selectOption('imagem');
  await faixa.getByRole('button', { name: 'Salvar este espaço' }).click();
  await adm.getByText('Propaganda salva.').waitFor();
  assert.equal(await adm.locator('#slot-navbar').isHidden(), true);
  await faixa.getByLabel('Enviar imagem').setInputFiles(arquivoPng('nav.png', 90, 140));
  await adm.locator('#slot-navbar img.slot-img.carregada').waitFor();

  // 2d) fonte das loterias: testar, recusar endereço inseguro, desligar e religar
  await adm.getByRole('button', { name: 'Testar fonte' }).click();
  await adm.getByText(/Mega-Sena: funcionou · concurso 3083 · 6 dezenas · 1 ganhador/).waitFor();
  await adm.getByLabel('Endereço da fonte (API)').fill('http://inseguro.com/');
  await adm.getByRole('button', { name: 'Testar fonte' }).click();
  await adm.getByText(/O endereço da fonte deve começar com https/).waitFor();
  await adm.getByLabel('Endereço da fonte (API)').fill('');
  await adm.getByLabel('Mostrar resultados no site').uncheck();
  await adm.locator('section.cartao', { has: adm.getByRole('heading', { name: 'Resultados das loterias' }) }).getByRole('button', { name: 'Salvar', exact: true }).click();
  await adm.getByText('Resultados das loterias salvos.').waitFor();
  await adm.locator('#slot-resultados').waitFor({ state: 'hidden' });
  assert.equal(await adm.locator('#faixa-resumo').isHidden(), true);
  assert.equal(await adm.locator('#layout-site.tem-esq').count(), 0);
  await adm.getByLabel('Mostrar resultados no site').check();
  await adm.locator('section.cartao', { has: adm.getByRole('heading', { name: 'Resultados das loterias' }) }).getByRole('button', { name: 'Salvar', exact: true }).click();
  await adm.locator('#slot-resultados .lot-card').first().waitFor();

  // 2e) outra aba do admin (Configurações) não pode apagar os espaços da tela
  await adm.getByRole('tab', { name: 'Configurações' }).click();
  await adm.getByLabel('Chave PIX').fill('');
  await adm.getByRole('button', { name: 'Salvar link' }).click();
  await adm.getByText('Link salvo.').waitFor();
  assert.equal(await adm.locator('#slot-lateral img.slot-img').count(), 1, 'a propaganda continua depois de salvar outra configuração');
  assert.equal(await adm.locator('#slot-rodape iframe').count(), 1);

  // 3) visitante (página pública) vê tudo
  const visit = await novaPagina(1400);
  await visit.goto(srv.urlSite + '/publico.html');
  await visit.locator('#slot-lateral img.slot-img.carregada').waitFor();
  await visit.locator('#slot-navbar img.slot-img.carregada').waitFor();
  await visit.frameLocator('#slot-rodape iframe').locator('#isolado').waitFor();
  await visit.locator('.lot-card').first().waitFor();
  assert.equal(await colunas(visit), 3);
  // o código do anúncio (texto) nunca vai para a página fora do quadro
  assert.equal(await visit.locator('#anuncio-teste').count(), 0);

  // 4) celular: uma coluna, resultados em faixa rolável, sem rolagem lateral
  const cel = await novaPagina(390);
  await cel.goto(srv.urlSite + '/publico.html');
  await cel.locator('.lot-card').first().waitFor();
  await cel.locator('#slot-lateral img.slot-img.carregada').waitFor();
  assert.equal(await colunas(cel), 1);
  assert.equal(await cel.locator('#slot-resultados').evaluate((e) => getComputedStyle(e).display), 'flex');
  const yApp = (await cel.locator('#app').boundingBox()).y;
  const yLat = (await cel.locator('#slot-lateral').boundingBox()).y;
  assert.ok(yLat > yApp, 'a propaganda lateral vem depois do conteúdo no celular');
  assert.ok(await cel.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'sem rolagem lateral');

  assert.deepEqual(erros, [], 'nenhum erro de JavaScript: ' + erros.join(' | '));
});

test('fonte das loterias fora do ar: o site funciona normalmente, sem o banner', async (t) => {
  const srv = await subir(); // sem rotas de fonte: tudo dá 404
  const browser = await chromium.launch();
  t.after(async () => { await browser.close(); srv.fechar(); });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(String(e)));
  await p.addInitScript((u) => { window.BOLAO_CONFIG = { API_URL: u }; }, srv.urlApi);
  await p.goto(srv.urlSite + '/publico.html');
  await p.getByText('Bolão da Sorte · Jogos confirmados').waitFor();
  await p.waitForTimeout(800);
  assert.equal(await p.locator('#slot-resultados').isHidden(), true);
  assert.equal(await p.locator('#faixa-resumo').isHidden(), true);
  assert.equal(await p.locator('.lot-card').count(), 0);
  assert.deepEqual(erros, []);
});
