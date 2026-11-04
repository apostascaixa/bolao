# Bolão da Sorte – Apostas

Sistema de organização de bolão em grupo. Não é um canal oficial de apostas da CAIXA.

## Estrutura
- `shared/` regras das modalidades, rateio e geração de PIX (testados)
- `backend/src/` código do Apps Script em partes; `backend/Codigo.gs` é o arquivo gerado (único) que se cola no Apps Script
- `frontend/` telas publicadas no Netlify (próxima etapa)
- `tests/` testes automatizados

## Testes e build
Requer Node 18 ou superior.
- `npm test` roda todos os testes
- `npm run build` regenera `backend/Codigo.gs` (rode sempre que mudar `shared/` ou `backend/src/`)

## Segurança
Repositório público. Nunca versionar chave PIX, senhas ou dados de participantes.
Segredos ficam nas Propriedades do Script do Apps Script.
