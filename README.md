# Bolão da Sorte – Apostas

Sistema de organização de bolão em grupo. Não é um canal oficial de apostas da CAIXA.

## Estrutura
- `shared/` regras das modalidades, rateio e geração de PIX (testados)
- `backend/` código do Apps Script (próxima etapa)
- `frontend/` telas publicadas no Netlify (próxima etapa)
- `tests/` testes automatizados

## Testes
Requer Node 18 ou superior: `npm test`

## Segurança
Repositório público. Nunca versionar chave PIX, senhas ou dados de participantes.
Segredos ficam nas Propriedades do Script do Apps Script.
