// Teste de ponta a ponta no navegador. Requer o pacote "playwright" instalado (não roda no `npm test`).
const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { subir } = require('./e2e-servidor.js');

test('fluxo completo: admin, bolões, convites, participante', async (t) => {
  const srv = await subir();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errosPagina = [];
  page.on('pageerror', (e) => errosPagina.push(String(e)));
  await page.addInitScript((u) => { window.BOLAO_CONFIG = { API_URL: u }; }, srv.urlApi);
  t.after(async () => { await browser.close(); srv.fechar(); });
  const $ = (s) => page.locator(s);

  // 1) cadastro do admin pelo link de convite
  await page.goto(srv.urlSite + '/?convite=' + srv.codigoAdmin);
  assert.equal(await page.getByLabel('Código do convite').inputValue(), srv.codigoAdmin);
  assert.ok(!page.url().includes('convite'), 'o código deve sair da barra de endereço');
  await page.getByLabel('Seu nome').fill('Admin Geral');
  await page.getByLabel('Usuário').fill('admin');
  await page.getByLabel('Senha', { exact: true }).fill('senha-forte-1');
  await page.getByLabel('Repita a senha').fill('senha-diferente');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await page.getByText('As senhas não conferem.').waitFor();
  await page.getByLabel('Repita a senha').fill('senha-forte-1');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await page.getByRole('heading', { name: 'Bolões', exact: true }).waitFor();
  assert.ok(await page.getByText('(administrador)').isVisible());

  // 2) erro de formato do valor (cliente) e erro do servidor
  await page.getByRole('button', { name: 'Novo bolão' }).click();
  await page.getByLabel('Nome', { exact: true }).fill('Teste');
  await page.getByLabel('Valor da cota (R$)').fill('abc');
  await page.getByLabel('Limite de cotas').fill('20');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await page.getByText('Valor inválido. Use o formato 60,00.').waitFor();
  await page.evaluate(() => { document.querySelector('form').noValidate = true; });
  await page.getByLabel('Valor da cota (R$)').fill('60,00');
  await page.getByLabel('Números por jogo').fill('5');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await page.getByText(/Quantidade de números deve estar entre 6 e 20/).waitFor();

  // 3) criação válida (nome com tentativa de HTML) -> rascunho
  await page.getByLabel('Nome', { exact: true }).fill('<img src=x onerror="window.__xss=1"> Mega');
  await page.getByLabel('Números por jogo').fill('6');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await page.getByText('Rascunho', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.__xss), undefined, 'HTML do nome não pode executar');
  assert.ok(await page.getByText('<img src=x onerror="window.__xss=1"> Mega').isVisible());
  assert.ok(await page.getByText('R$ 60,00').isVisible());
  assert.ok(await page.getByText('0 de 20 (20 vagas)').isVisible());
  await page.screenshot({ path: '/tmp/e2e-admin-boloes.png' });

  // 4) abrir inscrições
  await page.getByRole('button', { name: 'Abrir inscrições' }).click();
  await page.getByText('Aberto', { exact: true }).waitFor();

  // 5) gerar convite de participante
  await page.getByRole('tab', { name: 'Convites' }).click();
  await page.getByRole('button', { name: 'Gerar convite' }).click();
  const codigo = await page.getByLabel('Código do convite').inputValue();
  assert.match(codigo, /^[0-9A-F]{5}(-[0-9A-F]{5}){3}$/);
  await page.screenshot({ path: '/tmp/e2e-admin-convites.png' });

  // 6) sair e cadastrar participante com o link do convite
  await page.getByRole('button', { name: 'Sair' }).click();
  await page.getByRole('button', { name: 'Entrar', exact: true }).first().waitFor();
  await page.goto(srv.urlSite + '/?convite=' + codigo);
  await page.getByLabel('Seu nome').fill('Maria Silva');
  await page.getByLabel('Usuário').fill('maria');
  await page.getByLabel('Senha', { exact: true }).fill('senha-maria-1');
  await page.getByLabel('Repita a senha').fill('senha-maria-1');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await page.locator('.hero').waitFor();
  assert.ok(await page.locator('.hero').getByText('20 de 20').isVisible());
  assert.ok(await page.locator('.hero').getByText('Fecha em').isVisible());
  assert.equal(await page.getByRole('button', { name: 'Novo bolão' }).count(), 0);
  assert.equal(await page.getByRole('tab', { name: 'Convites' }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Excluir' }).count(), 0);
  await page.screenshot({ path: '/tmp/e2e-participante.png' });

  // 6b) volante: escolher números, limites, duplicado, surpresinha, editar, remover, completar
  await page.getByRole('button', { name: 'Iniciar minha cota' }).click();
  await page.getByRole('heading', { name: 'Jogo 1 de 10' }).waitFor();
  const num = (n) => page.getByRole('button', { name: 'Número ' + n, exact: true });
  const progresso = (txt) => page.locator('.progresso-texto').getByText(txt, { exact: true });
  assert.ok(await page.getByRole('button', { name: 'Adicionar à cota' }).isDisabled());
  for (const n of [1, 2, 3, 4, 5, 6]) await num(n).click();
  await page.getByText('6 de 6 números escolhidos: 1 · 2 · 3 · 4 · 5 · 6').waitFor();
  assert.equal(await num(3).getAttribute('aria-pressed'), 'true');
  await num(7).click();
  await page.getByText('Este jogo já tem 6 números.').waitFor();
  await page.getByRole('button', { name: 'Adicionar à cota' }).click();
  await progresso('1 de 10').waitFor();
  await page.getByRole('heading', { name: 'Jogo 2 de 10' }).waitFor();
  for (const n of [6, 5, 4, 3, 2, 1]) await num(n).click();
  await page.getByRole('button', { name: 'Adicionar à cota' }).click();
  await page.getByText('Este jogo já está na sua cota.').waitFor();
  await page.getByRole('button', { name: 'Limpar' }).click();
  await page.getByRole('button', { name: 'Surpresinha' }).click();
  await page.getByText(/^6 de 6 números escolhidos/).waitFor();
  assert.equal(await page.locator('.bola.marcada').count(), 6);
  await page.getByRole('button', { name: 'Adicionar à cota' }).click();
  await progresso('2 de 10').waitFor();
  await page.waitForTimeout(450);
  await page.screenshot({ path: '/tmp/e2e-volante.png', fullPage: true });

  await page.getByRole('button', { name: 'Editar' }).first().click();
  await page.getByRole('heading', { name: 'Editando um jogo' }).waitFor();
  assert.equal(await page.locator('.bola.marcada').count(), 6);
  await page.getByRole('button', { name: 'Limpar' }).click();
  for (const n of [10, 20, 30, 40, 50, 60]) await num(n).click();
  await page.getByRole('button', { name: 'Salvar alteração' }).click();
  await progresso('2 de 10').waitFor();
  assert.ok(await page.locator('.jogos li').first().getByText('60', { exact: true }).isVisible());
  await page.getByRole('button', { name: 'Remover' }).last().click();
  await progresso('1 de 10').waitFor();

  for (let i = 0; i < 20 && (await page.getByRole('heading', { name: /^Jogo \d+ de 10$/ }).count()) > 0; i++) {
    await page.getByRole('button', { name: 'Surpresinha' }).click();
    await page.getByRole('button', { name: 'Adicionar à cota' }).click();
    await page.waitForTimeout(80);
  }
  await progresso('10 de 10').waitFor();
  await page.getByText('Cota completa!').waitFor();
  assert.equal(await page.getByRole('button', { name: 'Adicionar à cota' }).count(), 0);

  // 6c) menu lateral (gaveta no celular), minhas cotas e transições
  await page.getByRole('button', { name: '☰ Bolões e menu' }).click();
  await page.locator('.menu.aberto .mini').waitFor();
  assert.ok(await page.locator('.menu.aberto .mini').getByText('Cota completa').isVisible());
  await page.waitForTimeout(350);
  await page.screenshot({ path: '/tmp/e2e-menu.png' });
  await page.getByRole('button', { name: /^Minhas cotas/ }).click();
  await page.getByRole('heading', { name: 'Minhas cotas' }).waitFor();
  assert.ok(await page.getByText('10 de 10 jogos montados').isVisible());
  await page.getByRole('button', { name: 'Abrir' }).click();
  await page.locator('.hero').waitFor();

  // 7) sessão e jogos persistem ao recarregar
  await page.reload();
  await page.locator('.hero').waitFor();
  await progresso('10 de 10').waitFor();

  // 7b) em tela larga o menu fica fixo à direita
  await page.setViewportSize({ width: 1200, height: 800 });
  assert.ok(await page.locator('.menu .mini').isVisible());
  assert.equal(await page.getByRole('button', { name: '☰ Bolões e menu' }).isVisible(), false);
  await page.waitForTimeout(450);
  await page.screenshot({ path: '/tmp/e2e-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });

  // 7c) desistir da cota libera a vaga
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Desistir desta cota' }).click();
  await page.getByRole('button', { name: 'Iniciar minha cota' }).waitFor();
  assert.ok(await page.locator('.hero').getByText('20 de 20').isVisible());

  // 8) o código do convite não funciona duas vezes
  await page.getByRole('button', { name: 'Sair' }).click();
  await page.goto(srv.urlSite + '/?convite=' + codigo);
  await page.getByLabel('Seu nome').fill('Outra Pessoa');
  await page.getByLabel('Usuário').fill('outra');
  await page.getByLabel('Senha', { exact: true }).fill('senha-outra-1');
  await page.getByLabel('Repita a senha').fill('senha-outra-1');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await page.getByText('Convite inválido ou expirado.').waitFor();

  // 9) login errado e certo
  await page.getByRole('tab', { name: 'Entrar' }).click();
  await page.getByLabel('Usuário').fill('admin');
  await page.getByLabel('Senha').fill('errada-errada');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.getByText('Usuário ou senha inválidos.').waitFor();
  await page.getByLabel('Senha').fill('senha-forte-1');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.getByRole('heading', { name: 'Bolões', exact: true }).waitFor();

  // 9b) o administrador também pode participar
  await page.getByRole('tab', { name: 'Participar' }).click();
  await page.locator('.hero').waitFor();
  await page.getByRole('tab', { name: 'Administrar bolões' }).click();

  // 10) editar (sem cotas: tudo editável) e depois com cota (campos travados)
  await page.getByRole('button', { name: 'Editar' }).click();
  await page.getByLabel('Nome', { exact: true }).fill('Mega da Virada');
  await page.getByLabel('Limite de cotas').fill('25');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await page.getByText('0 de 25 (25 vagas)').waitFor();

  const bolao = srv.env.ctx.lerTabela('Boloes')[0];
  srv.env.ctx.inserir('Cotas', { id: 'c1', bolaoId: bolao.id, userId: 'u1', status: 'rascunho', criadoEm: Date.now(), atualizadoEm: Date.now() });
  await page.reload();
  await page.getByRole('button', { name: 'Editar' }).click();
  assert.ok(await page.getByText(/só o nome e o prazo podem ser alterados/).isVisible());
  assert.ok(await page.getByLabel('Limite de cotas').isDisabled());
  assert.ok(await page.getByLabel('Valor da cota (R$)').isDisabled());
  assert.ok(await page.getByLabel('Nome', { exact: true }).isEnabled());
  await page.screenshot({ path: '/tmp/e2e-admin-editar-travado.png' });
  await page.getByRole('button', { name: 'Cancelar' }).click();

  // 11) excluir com cotas arquiva
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Excluir' }).click();
  await page.getByText('Nenhum bolão criado ainda.').waitFor();
  assert.equal(srv.env.ctx.lerTabela('Boloes')[0].status, 'arquivado');

  // 12) propriedades gerais
  assert.equal(srv.pedidos.options, 0, 'a API não pode receber preflight (OPTIONS)');
  assert.ok(srv.pedidos.posts > 10);
  assert.deepEqual(errosPagina, []);
});

test('sem URL configurada mostra aviso claro', async (t) => {
  const srv = await subir();
  const browser = await chromium.launch();
  t.after(async () => { await browser.close(); srv.fechar(); });
  const page = await browser.newPage();
  await page.addInitScript(() => { window.BOLAO_CONFIG = { API_URL: '' }; });
  await page.goto(srv.urlSite);
  await page.getByText('Configuração pendente').waitFor();
});

test('servidor fora do ar mostra mensagem de conexão e não apaga o login', async (t) => {
  const srv = await subir();
  const browser = await chromium.launch();
  t.after(async () => { await browser.close(); srv.fechar(); });
  const page = await browser.newPage();
  await page.addInitScript(() => { window.BOLAO_CONFIG = { API_URL: 'http://127.0.0.1:9/exec' }; localStorage.setItem('bolao.token', 'x'.repeat(64)); });
  await page.goto(srv.urlSite);
  await page.getByText('Sem conexão').first().waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem('bolao.token')), 'x'.repeat(64));
});
