// Teste de ponta a ponta no navegador. Requer o pacote "playwright" instalado (não roda no `npm test`).
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

async function entrar(page, usuario, senha) {
  await page.getByLabel('Usuário').fill(usuario);
  await page.getByLabel('Senha').fill(senha);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
}

test('fluxo completo: admin, config, carrossel, volante, PIX, aprovação e página pública', async (t) => {
  const srv = await subir();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errosPagina = [];
  page.on('pageerror', (e) => errosPagina.push(String(e)));
  await page.addInitScript((u) => { window.BOLAO_CONFIG = { API_URL: u }; }, srv.urlApi);
  t.after(async () => { await browser.close(); srv.fechar(); });
  const progresso = (txt) => page.locator('.progresso-texto').getByText(txt, { exact: true });
  const num = (n) => page.getByRole('button', { name: 'Número ' + n, exact: true });
  const completarCota = async () => {
    await page.getByRole('heading', { name: /^Jogo \d+ de 10$/ }).waitFor(); // espera o volante aparecer
    for (let i = 0; i < 25 && (await page.getByRole('heading', { name: /^Jogo \d+ de 10$/ }).count()) > 0; i++) {
      await page.getByRole('button', { name: 'Surpresinha', exact: true }).click();
      await page.getByRole('button', { name: 'Adicionar à cota' }).click();
      await page.waitForTimeout(80);
    }
    await progresso('10 de 10').waitFor();
  };

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

  // 2) validações do formulário de bolão e criação (nome com tentativa de HTML)
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
  await page.getByLabel('Nome', { exact: true }).fill('<img src=x onerror="window.__xss=1"> Mega');
  await page.getByLabel('Números por jogo').fill('6');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await page.getByText('Rascunho', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.__xss), undefined, 'HTML do nome não pode executar');
  assert.ok(await page.getByText('<img src=x onerror="window.__xss=1"> Mega').isVisible());

  // 3) editar enquanto não há cotas, depois abrir inscrições
  await page.getByRole('button', { name: 'Editar' }).click();
  await page.getByLabel('Nome', { exact: true }).fill('Mega da Virada');
  await page.getByLabel('Limite de cotas').fill('25');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await page.getByText('0 de 25 (25 vagas)').waitFor();
  await page.getByRole('button', { name: 'Abrir inscrições' }).click();
  await page.getByText('Aberto', { exact: true }).waitFor();

  // 4) configurações: PIX, QR, banner do topo, carrossel
  await page.getByRole('tab', { name: 'Configurações' }).click();
  await page.getByLabel('Chave PIX').fill('bolao@exemplo.com');
  await page.getByRole('button', { name: 'Salvar dados do PIX' }).click();
  await page.getByText('Com a chave PIX, informe também o nome do recebedor e a cidade.').waitFor();
  await page.getByLabel('Nome do recebedor').fill('João da Silva');
  await page.getByLabel('Cidade do recebedor').fill('Brasília');
  await page.getByLabel('Instruções para o participante').fill('Pague e aguarde a aprovação.');
  await page.getByRole('button', { name: 'Salvar dados do PIX' }).click();
  await page.getByText('Dados do PIX salvos.').waitFor();
  await page.getByLabel('Enviar QR Code do PIX (imagem)').setInputFiles(arquivoPng('qr.png', 60, 20));
  await page.locator('.pix-qr-img.carregada').waitFor();
  assert.ok(await page.getByRole('button', { name: 'Remover QR Code' }).isVisible());

  await page.getByLabel('Enviar banner do topo').setInputFiles(arquivoPng('topo.png', 80, 120));
  await page.locator('.topo-site .topo-img.carregada').waitFor();
  await page.getByLabel('Link ao clicar no banner (opcional)').fill('http://inseguro.com');
  await page.getByRole('button', { name: 'Salvar link' }).click();
  await page.getByText('O link deve começar com https://').waitFor();
  await page.getByLabel('Link ao clicar no banner (opcional)').fill('https://exemplo.com/promo');
  await page.getByRole('button', { name: 'Salvar link' }).click();
  await page.getByText('Link salvo.').waitFor();
  assert.equal(await page.locator('.topo-site a').getAttribute('href'), 'https://exemplo.com/promo');

  await page.getByLabel('Título (opcional)').fill('Promoção de fim de ano');
  await page.getByLabel('Escolher imagem do banner').setInputFiles(arquivoPng('b1.png', 90, 60));
  await page.getByLabel('Título do banner 1').waitFor();
  await page.getByLabel('Título (opcional)').fill('Aviso importante');
  await page.getByLabel('Escolher imagem do banner').setInputFiles(arquivoPng('b2.png', 90, 200));
  await page.getByLabel('Título do banner 2').waitFor();
  await page.getByRole('button', { name: 'Subir banner 2' }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="Título do banner 1"]').value === 'Aviso importante');
  await page.getByRole('button', { name: 'Descer banner 1' }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="Título do banner 1"]').value === 'Promoção de fim de ano');
  await page.getByLabel('Tempo de cada banner (2 a 30 segundos)').evaluate((el) => { el.value = '3'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.getByRole('button', { name: 'Salvar carrossel' }).click();
  await page.getByText('Carrossel atualizado.').waitFor();
  assert.equal(srv.env.ctx.lerConfig()['carrossel.segundos'], '3');
  await page.screenshot({ path: '/tmp/e2e-admin-config.png', fullPage: true });

  // 5) convite de participante
  await page.getByRole('tab', { name: 'Convites' }).click();
  await page.getByRole('button', { name: 'Gerar convite' }).click();
  const codigo = await page.getByLabel('Código do convite').inputValue();
  assert.match(codigo, /^[0-9A-F]{5}(-[0-9A-F]{5}){3}$/);

  // 6) participante se cadastra e vê o carrossel (bolão + 2 banners) e o banner do topo
  await page.getByRole('button', { name: 'Sair' }).click();
  await page.getByRole('button', { name: 'Entrar', exact: true }).first().waitFor();
  await page.goto(srv.urlSite + '/?convite=' + codigo);
  assert.equal(await page.getByRole('link', { name: 'Ver a página pública dos jogos' }).getAttribute('href'), 'publico.html');
  await page.getByLabel('Seu nome').fill('Maria Silva');
  await page.getByLabel('Usuário').fill('maria');
  await page.getByLabel('Senha', { exact: true }).fill('senha-maria-1');
  await page.getByLabel('Repita a senha').fill('senha-maria-1');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await page.locator('.carrossel').waitFor();
  assert.equal(await page.locator('.car-slide').count(), 3);
  assert.equal(await page.locator('.car-ponto').count(), 3);
  await page.locator('.topo-site .topo-img.carregada').waitFor();
  assert.equal(await page.getByRole('button', { name: 'Novo bolão' }).count(), 0);
  assert.equal(await page.getByRole('tab', { name: 'Convites' }).count(), 0);
  await page.waitForFunction(() => document.querySelector('.carrossel').dataset.atual !== '0', null, { timeout: 9000 }); // passa sozinho (3 s)
  await page.getByRole('button', { name: 'Anterior' }).click();
  await page.getByRole('button', { name: 'Próximo' }).click();
  await page.locator('.car-slide[inert]').first().waitFor({ state: 'attached' });
  await page.getByRole('button', { name: 'Ir para Mega da Virada' }).click();
  await page.waitForFunction(() => document.querySelector('.carrossel').dataset.atual === '0');
  await page.screenshot({ path: '/tmp/e2e-participante.png' });

  // 7) volante: limites, duplicado, surpresinha, editar, remover
  await page.getByRole('button', { name: 'Iniciar minha cota' }).click();
  await page.getByRole('heading', { name: 'Jogo 1 de 10' }).waitFor();
  assert.ok(await page.getByRole('button', { name: 'Adicionar à cota' }).isDisabled());
  for (const n of [1, 2, 3, 4, 5, 6]) await num(n).click();
  await page.getByText('6 de 6 números escolhidos: 1 · 2 · 3 · 4 · 5 · 6').waitFor();
  await num(7).click();
  await page.getByText('Este jogo já tem 6 números.').waitFor();
  await page.getByRole('button', { name: 'Adicionar à cota' }).click();
  await progresso('1 de 10').waitFor();
  for (const n of [6, 5, 4, 3, 2, 1]) await num(n).click();
  await page.getByRole('button', { name: 'Adicionar à cota' }).click();
  await page.getByText('Este jogo já está na sua cota.').waitFor();
  await page.getByRole('button', { name: 'Limpar' }).click();
  await page.getByRole('button', { name: 'Surpresinha', exact: true }).click();
  await page.getByRole('button', { name: 'Adicionar à cota' }).click();
  await progresso('2 de 10').waitFor();
  await page.getByRole('button', { name: 'Editar' }).first().click();
  await page.getByRole('heading', { name: 'Editando um jogo' }).waitFor();
  await page.getByRole('button', { name: 'Limpar' }).click();
  for (const n of [10, 20, 30, 40, 50, 60]) await num(n).click();
  await page.getByRole('button', { name: 'Salvar alteração' }).click();
  await progresso('2 de 10').waitFor();
  await page.getByRole('button', { name: 'Remover' }).last().click();
  await progresso('1 de 10').waitFor();

  // 8) desistir libera a vaga; iniciar de novo e completar os 10 jogos
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Desistir desta cota' }).click();
  await page.getByRole('button', { name: 'Iniciar minha cota' }).waitFor();
  await page.getByRole('button', { name: 'Iniciar minha cota' }).click();
  await completarCota();
  await page.getByText('Bolão escolhido!').waitFor();
  assert.equal(await page.getByRole('button', { name: 'Adicionar à cota' }).count(), 0);

  // 9) menu lateral (gaveta), minhas cotas, persistência
  await page.getByRole('button', { name: '☰ Bolões e menu' }).click();
  assert.ok(await page.locator('.menu.aberto .mini').getByText('Bolão escolhido').isVisible());
  await page.waitForTimeout(350);
  await page.screenshot({ path: '/tmp/e2e-menu.png' });
  await page.getByRole('button', { name: /^Minhas cotas/ }).click();
  await page.getByRole('heading', { name: 'Minhas cotas' }).waitFor();
  await page.getByRole('button', { name: 'Abrir' }).click();
  await page.locator('.carrossel').waitFor();
  await page.reload();
  await progresso('10 de 10').waitFor();
  await page.setViewportSize({ width: 1200, height: 800 });
  assert.ok(await page.locator('.menu .mini').isVisible());
  await page.waitForTimeout(450);
  await page.screenshot({ path: '/tmp/e2e-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });

  // 10) gerar PIX: trava os jogos e mostra QR, copia e cola e instruções
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Gerar PIX e enviar para aprovação' }).click();
  await page.getByRole('heading', { name: 'Aguardando aprovação do administrador' }).waitFor();
  const copia = await page.locator('textarea.codigo-pix').inputValue();
  assert.match(copia, /^000201/);
  assert.ok(copia.includes('60.00'));
  await page.locator('.pix .pix-qr-img.carregada').waitFor();
  assert.ok(await page.getByText('Pague e aguarde a aprovação.').isVisible());
  assert.equal(await page.getByRole('button', { name: 'Editar' }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Remover' }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Desistir desta cota' }).count(), 0);
  await page.waitForTimeout(450);
  await page.screenshot({ path: '/tmp/e2e-pix.png', fullPage: true });

  // 11) o convite não vale duas vezes
  await page.getByRole('button', { name: 'Sair' }).click();
  await page.goto(srv.urlSite + '/?convite=' + codigo);
  await page.getByLabel('Seu nome').fill('Outra Pessoa');
  await page.getByLabel('Usuário').fill('outra');
  await page.getByLabel('Senha', { exact: true }).fill('senha-outra-1');
  await page.getByLabel('Repita a senha').fill('senha-outra-1');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await page.getByText('Convite inválido ou expirado.').waitFor();

  // 12) admin: login errado e certo; reprova com motivo
  await page.getByRole('tab', { name: 'Entrar' }).click();
  await entrar(page, 'admin', 'errada-errada');
  await page.getByText('Usuário ou senha inválidos.').waitFor();
  await entrar(page, 'admin', 'senha-forte-1');
  await page.getByRole('tab', { name: /^Aprovações \(1\)/ }).click();
  await page.getByText('Maria Silva (@maria)').waitFor();
  await page.getByText('Ver os 10 jogos').click();
  await page.screenshot({ path: '/tmp/e2e-admin-aprovacoes.png', fullPage: true });
  page.once('dialog', (d) => d.accept('Comprovante ilegível'));
  await page.getByRole('button', { name: 'Reprovar' }).click();
  await page.getByText('Nenhum pagamento aguardando aprovação.').waitFor();

  // 13) participante vê o motivo e gera o PIX de novo
  await page.getByRole('button', { name: 'Sair' }).click();
  await entrar(page, 'maria', 'senha-maria-1');
  await page.getByText('O administrador não aprovou o pagamento:').waitFor();
  assert.ok(await page.getByText('Comprovante ilegível').isVisible());
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Gerar PIX e enviar para aprovação' }).click();
  await page.getByRole('heading', { name: 'Aguardando aprovação do administrador' }).waitFor();

  // 14) admin aprova
  await page.getByRole('button', { name: 'Sair' }).click();
  await entrar(page, 'admin', 'senha-forte-1');
  await page.getByRole('tab', { name: /^Aprovações \(1\)/ }).click();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Aprovar' }).click();
  await page.getByText('Nenhum pagamento aguardando aprovação.').waitFor();
  await page.getByRole('heading', { name: 'Confirmadas (1)' }).waitFor();

  // 14b) auditoria: comprovante, jogos registrados (divergência e conferência), registro oficial
  const jogosSistema = srv.env.ctx.lerTabela('Jogos').map((j) => j.numeros.split('-').map(Number));
  assert.equal(jogosSistema.length, 10);
  const linhaJogo = (j, i) => String.fromCharCode(65 + i) + ' ' + j.map((n) => String(n).padStart(2, '0')).join(' ') + ' SU';
  const textoOk = jogosSistema.map(linhaJogo).join('\n');
  const textoDiverge = [...jogosSistema.slice(0, 9), [60, 59, 58, 57, 56, 55]].map(linhaJogo).join('\n') + '\nCOTA 1/25';
  await page.getByRole('tab', { name: 'Auditoria' }).click();
  await page.getByRole('heading', { name: 'Auditoria do registro oficial' }).waitFor();
  assert.ok(await page.getByText('Ainda não registrado').isVisible());
  await page.getByLabel('Enviar comprovante (foto ou print)').setInputFiles(arquivoPng('recibo.png', 120, 90));
  await page.getByRole('button', { name: 'Abrir comprovante 1' }).waitFor();
  await page.getByRole('button', { name: 'Abrir comprovante 1' }).click();
  await page.locator('.visualizador .visualizador-img.carregada').waitFor();
  await page.keyboard.press('Escape');
  await page.locator('.visualizador').waitFor({ state: 'detached' });
  await page.locator('textarea[name=jogosRegistrados]').fill(textoDiverge);
  await page.getByRole('button', { name: 'Salvar e comparar com os jogos dos participantes' }).click();
  await page.getByText('Divergência encontrada.').waitFor();
  assert.ok(await page.getByText('Estão no sistema e faltam no registro (1)').isVisible());
  assert.ok(await page.getByText('Estão no registro e não são de nenhum participante (1)').isVisible());
  await page.locator('textarea[name=jogosRegistrados]').fill(textoOk);
  await page.getByRole('button', { name: 'Salvar e comparar com os jogos dos participantes' }).click();
  await page.getByText('Confere: os jogos registrados são exatamente os dos participantes.').waitFor();
  await page.getByLabel('Número do concurso').fill('3100');
  await page.getByRole('button', { name: 'Marcar como registrado oficialmente' }).click();
  await page.getByText('Bolão marcado como registrado.').waitFor();
  assert.ok(await page.getByText('Concurso 3100').first().isVisible());
  await page.screenshot({ path: '/tmp/e2e-auditoria.png', fullPage: true });

  // 14c) conferência: resultado com 4 dezenas de um jogo = pelo menos uma quadra
  const g0 = jogosSistema[0];
  const extras = Array.from({ length: 60 }, (_, i) => i + 1).filter((n) => !g0.includes(n)).slice(0, 2);
  await page.getByRole('tab', { name: 'Conferência' }).click();
  await page.getByRole('heading', { name: 'Conferência de resultado' }).waitFor();
  await page.getByLabel('Número do concurso').fill('3100');
  await page.getByLabel('Resultado oficial (dezenas sorteadas)').fill('1 2 3');
  await page.getByText('3 de 6 dezenas').waitFor();
  await page.getByRole('button', { name: 'Pesquisar nos bolões registrados' }).click();
  await page.getByText('O resultado de Mega-Sena tem 6 dezenas.').waitFor();
  await page.getByLabel('Resultado oficial (dezenas sorteadas)').fill([...g0.slice(0, 4), ...extras].join(' '));
  await page.getByRole('button', { name: 'Pesquisar nos bolões registrados' }).click();
  await page.getByText(/jogo\(s\) premiado\(s\)!/).waitFor();
  assert.ok(await page.getByText('Maria Silva · jogo A').isVisible());
  assert.ok((await page.locator('.chip.acerto').count()) >= 4);
  assert.ok(await page.getByText(/Quadra/).first().isVisible());
  await page.getByText(/concurso 3100 ·/).waitFor(); // histórico
  await page.screenshot({ path: '/tmp/e2e-conferencia.png', fullPage: true });
  await page.getByLabel('Resultado oficial (dezenas sorteadas)').fill('50 51 52 53 54 55');
  await page.getByRole('button', { name: 'Pesquisar nos bolões registrados' }).click();
  await page.getByText('Nenhum jogo premiado nos bolões registrados.').waitFor();

  // 15) participante vê a confirmação
  await page.getByRole('button', { name: 'Sair' }).click();
  await entrar(page, 'maria', 'senha-maria-1');
  await page.getByText('Participação confirmada!').waitFor();
  assert.equal(await page.getByRole('button', { name: 'Gerar PIX e enviar para aprovação' }).count(), 0);

  // 16) página pública, sem login: só o aprovado, nome abreviado, sem usuário
  const anonimo = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pub = await anonimo.newPage();
  await pub.addInitScript((u) => { window.BOLAO_CONFIG = { API_URL: u }; }, srv.urlApi);
  await pub.goto(srv.urlSite + '/publico.html');
  await pub.getByText('Maria S.').waitFor();
  await pub.locator('.topo-site .topo-img.carregada').waitFor();
  assert.equal(await pub.locator('.recibo').count(), 1);
  assert.equal(await pub.locator('.recibo-jogo').count(), 10);
  assert.equal(await pub.locator('.recibo-letra').first().innerText(), 'A');
  assert.equal(await pub.locator('.recibo-letra').last().innerText(), 'J');
  const textoRecibo = await pub.locator('.recibo').innerText();
  assert.match(textoRecibo, /COTA 1\/25/);
  assert.match(textoRecibo, /CONCURSO\s*3100/);
  assert.match(textoRecibo, /REGISTRADO OFICIALMENTE EM/);
  assert.match(textoRecibo, /Não substitui o recibo oficial/);
  assert.match(await pub.locator('.recibo-nums').first().innerText(), /^\d{2}(\s+\d{2}){5}$/);
  assert.equal(await pub.getByRole('link', { name: 'Entrar no sistema' }).getAttribute('href'), 'index.html');
  assert.equal(await pub.getByText('Cotas confirmadas').count(), 1);
  const textoPublico = await pub.locator('body').innerText();
  for (const proibido of ['Maria Silva', '@maria', 'maria"', 'bolao@exemplo.com', 'senha']) assert.ok(!textoPublico.includes(proibido), proibido);
  assert.equal(await pub.locator('.car-slide').count(), 2); // só os banners do administrador
  await pub.waitForTimeout(450);
  await pub.screenshot({ path: '/tmp/e2e-publico.png', fullPage: true });
  await anonimo.close();

  // 17) admin: participa também; bolão com cota aprovada só aceita nome e prazo; excluir arquiva
  await page.getByRole('button', { name: 'Sair' }).click();
  await entrar(page, 'admin', 'senha-forte-1');
  await page.getByRole('tab', { name: 'Participar' }).click();
  await page.locator('.carrossel').waitFor();
  await page.getByRole('tab', { name: 'Administrar bolões' }).click();
  await page.getByRole('button', { name: 'Editar' }).click();
  assert.ok(await page.getByText(/só o nome e o prazo podem ser alterados/).isVisible());
  assert.ok(await page.getByLabel('Limite de cotas').isDisabled());
  await page.getByRole('button', { name: 'Cancelar' }).click();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Excluir' }).click();
  await page.getByText('Nenhum bolão criado ainda.').waitFor();
  assert.equal(srv.env.ctx.lerTabela('Boloes')[0].status, 'arquivado');

  // 18) propriedades gerais
  assert.equal(srv.pedidos.options, 0, 'a API não pode receber preflight (OPTIONS)');
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

test('escolha dos jogos é imediata mesmo com servidor lento; salva em lote e se recupera de falha', async (t) => {
  const srv = await subir();
  const env = srv.env;
  // preparação direta no backend (rápida): admin, bolão aberto e uma participante
  const adm = env.chamar('cadastrar', { codigoConvite: srv.codigoAdmin, usuario: 'admin', nome: 'Admin', senha: 'senha-forte-1' }).dados.token;
  const bolao = env.chamar('admin.boloes.criar', { token: adm, nome: 'Mega', modalidade: 'mega-sena', qtdNumeros: 6, valorCotaCentavos: 6000, jogosPorCota: 10, limiteCotas: 20, prazo: Date.now() + 7 * 864e5 }).dados;
  env.chamar('admin.boloes.status', { token: adm, id: bolao.id, status: 'aberto' });
  const conv = env.chamar('admin.convites.criar', { token: adm }).dados.codigo;
  env.chamar('cadastrar', { codigoConvite: conv, usuario: 'maria', nome: 'Maria Silva', senha: 'senha-maria-1' });

  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const erros = [];
  page.on('pageerror', (e) => erros.push(String(e)));
  await page.addInitScript((u) => { window.BOLAO_CONFIG = { API_URL: u }; }, srv.urlApi);
  t.after(async () => { await browser.close(); srv.fechar(); });

  await page.goto(srv.urlSite);
  await entrar(page, 'maria', 'senha-maria-1');
  await page.locator('.carrossel').waitFor();
  srv.definirAtraso(900); // a partir daqui cada chamada ao servidor leva 0,9 s
  await page.getByRole('button', { name: 'Iniciar minha cota' }).click();
  await page.getByRole('heading', { name: 'Jogo 1 de 10' }).waitFor();

  const num = (n) => page.getByRole('button', { name: 'Número ' + n, exact: true });
  const adicionar = async (nums, proximo) => {
    for (const n of nums) await num(n).click();
    const t0 = Date.now();
    await page.getByRole('button', { name: 'Adicionar à cota' }).click();
    await page.getByRole('heading', { name: 'Jogo ' + proximo + ' de 10' }).waitFor();
    return Date.now() - t0;
  };
  const tempos = [];
  tempos.push(await adicionar([1, 2, 3, 4, 5, 6], 2));
  tempos.push(await adicionar([7, 8, 9, 10, 11, 12], 3));
  tempos.push(await adicionar([13, 14, 15, 16, 17, 18], 4));
  for (const ms of tempos) assert.ok(ms < 600, 'o próximo jogo deve aparecer sem esperar o servidor (0,9 s): ' + ms + ' ms');
  assert.equal(await page.locator('.progresso-texto strong').innerText(), '3 de 10');
  assert.ok((await page.locator('.jogos li.pendente').count()) >= 1, 'jogos ainda não gravados aparecem como "salvando…"');
  assert.equal(srv.env.ctx.lerTabela('Jogos').length, 0, 'o servidor ainda não gravou nada (lento)');

  // grava tudo em lote, em segundo plano
  await page.locator('.salvando').first().waitFor({ state: 'detached', timeout: 15000 });
  assert.equal(srv.env.ctx.lerTabela('Jogos').length, 3);
  assert.ok((srv.pedidos.porAcao['jogos.salvarVarios'] || 0) <= 2, 'poucas chamadas em lote: ' + srv.pedidos.porAcao['jogos.salvarVarios']);
  assert.equal(srv.pedidos.porAcao['jogos.salvar'], undefined, 'nenhuma chamada jogo a jogo');
  assert.equal(await page.locator('.jogos li').count(), 3);

  // duplicado é barrado na hora, sem ir ao servidor
  const antes = srv.pedidos.posts;
  for (const n of [6, 5, 4, 3, 2, 1]) await num(n).click();
  await page.getByRole('button', { name: 'Adicionar à cota' }).click();
  await page.getByText('Este jogo já está na sua cota.').waitFor();
  assert.equal(srv.pedidos.posts, antes);
  await page.getByRole('button', { name: 'Limpar' }).click();

  // falha do servidor: aviso, jogo preservado e "Tentar de novo"
  let falhar = true;
  await page.route(srv.urlApi, (route) => {
    if (falhar && (route.request().postData() || '').includes('jogos.salvarVarios')) {
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ok: false, erro: 'Falha simulada do servidor' }) });
    }
    return route.continue();
  });
  await adicionar([20, 21, 22, 23, 24, 25], 5);
  await page.getByText('Não foi possível salvar seus jogos:').waitFor();
  assert.ok(await page.getByText('Falha simulada do servidor').isVisible());
  assert.equal(srv.env.ctx.lerTabela('Jogos').length, 3, 'nada foi gravado na falha');
  assert.ok((await page.locator('.jogos li.pendente').count()) >= 1, 'o jogo digitado continua na tela');
  falhar = false;
  await page.getByRole('button', { name: 'Tentar de novo' }).click();
  await page.locator('.salvando').first().waitFor({ state: 'detached', timeout: 15000 });
  assert.equal(srv.env.ctx.lerTabela('Jogos').length, 4);
  assert.equal(await page.getByText('Não foi possível salvar seus jogos:').count(), 0);

  // completar o resto com surpresinha: uma única chamada em lote
  const lotesAntes = srv.pedidos.porAcao['jogos.salvarVarios'];
  page.once('dialog', (d) => d.accept());
  const t1 = Date.now();
  await page.getByRole('button', { name: 'Completar os 6 restantes com surpresinha' }).click();
  await page.locator('.progresso-texto strong').filter({ hasText: '10 de 10' }).waitFor();
  assert.ok(Date.now() - t1 < 700, 'os 6 jogos aparecem na hora: ' + (Date.now() - t1) + ' ms');
  await page.getByText('Salvando seus jogos…').waitFor();
  await page.getByText('Bolão escolhido!').waitFor({ timeout: 15000 });
  assert.equal(srv.pedidos.porAcao['jogos.salvarVarios'], lotesAntes + 1);
  assert.equal(srv.env.ctx.lerTabela('Jogos').length, 10);
  assert.equal(srv.env.ctx.lerTabela('Cotas')[0].status, 'completa');
  assert.equal(new Set(srv.env.ctx.lerTabela('Jogos').map((j) => j.numeros)).size, 10, 'sem jogos repetidos');
  assert.deepEqual(erros, []);
});
