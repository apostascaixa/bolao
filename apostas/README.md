# Bolão da Sorte – Apostas

Sistema de organização de bolão em grupo. Não é um canal oficial de apostas da CAIXA.

## Estrutura
- `shared/` regras das modalidades, rateio e geração de PIX (testados)
- `backend/src/` código do Apps Script em partes; `backend/Codigo.gs` é o arquivo gerado (único) que se cola no Apps Script
- `frontend/` telas (HTML/CSS/JS puros) publicadas no Netlify; a URL da API fica em `frontend/config.js`
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
