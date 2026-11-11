# Bolão da Sorte – Apostas

Sistema de organização de bolão em grupo. Não é um canal oficial de apostas da CAIXA.

## Estrutura
- `shared/` regras das modalidades (com faixas de premiação), rateio, geração de PIX e conferência de resultados (testados)
- `backend/src/` código do Apps Script em partes; `backend/Codigo.gs` é o arquivo gerado (único) que se cola no Apps Script
- `frontend/` telas (HTML/CSS/JS puros) publicadas no Netlify; a URL da API fica em `frontend/config.js`; `publico.html` é a página pública dos jogos aprovados
- `tests/` testes automatizados
- `netlify.toml` publica a pasta `frontend`

## Testes e build
Requer Node 18 ou superior.
- `npm test` roda os testes de lógica (regras, rateio, PIX, backend simulado, utilitários da tela)
- `npm run test:e2e` roda a tela num navegador real contra o backend simulado (requer `npm i -D playwright` e `npx playwright install chromium`)
- `npm run build` regenera `backend/Codigo.gs` (rode sempre que mudar `shared/` ou `backend/src/`)

## Segurança
Repositório público. Nunca versionar chave PIX, senhas ou dados de participantes.
Segredos ficam nas Propriedades do Script do Apps Script.

## Recursos
- Participante: escolha de jogos em volante (salva em lote, em segundo plano), PIX e acompanhamento da aprovação
- Administrador: bolões, aprovação de pagamentos, **Auditoria** (comprovantes e jogos registrados na lotérica), **Conferência** de resultado por concurso, convites e configurações (PIX, banners, carrossel)
- Administrador: botão **Limpar dados de teste** (Configurações) apaga bolões e tudo que depende deles, com contagem prévia e frase de confirmação
- Página pública (`publico.html`): comprovante do grupo por participante aprovado
- Administrador: aba **Propagandas** — resultados das loterias (Mega-Sena, Lotofácil, Quina) com fonte da API configurável e botão de teste, e três espaços de propaganda (faixa abaixo do banner do topo, coluna da direita e rodapé), cada um com imagem + link ou código de anúncio. O código roda dentro de um quadro isolado (iframe com sandbox), sem acesso à página nem ao login. O banner do topo e o carrossel continuam em Configurações.

## Observação sobre a lotérica
Os comprovantes da página pública são internos do grupo e não substituem o recibo oficial.
O selo "registrado oficialmente" só aparece depois que o administrador envia os comprovantes na Auditoria.
