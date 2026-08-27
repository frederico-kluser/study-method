# Trilha Node.js do Zero — especificação de conteúdo (rodada 8)

> Contrato de CONTEÚDO da trilha `nodejs-do-zero` (resources/tracks/nodejs-do-zero).
> O formato dos arquivos é o de `trackTypes.ts` (rodada 8) — quem cria aula é o
> CLI de autoria; o aluno só consome. Este documento define O QUÊ cada módulo e
> aula ensina e o que se presume que o aluno sabe — a base para os arquivos
> `lesson.json`/`challenge.json` que os agentes de conteúdo escrevem.
>
> Base de pesquisa: relatório deep-research da rodada 8 (106 agentes, 24 min,
> 7 findings verificados). Fontes principais: The Odin Project (trilha Node),
> Full Stack Open (Parte 3 — servidor depois de fundamentos), Gray et al. (ICER
> '07, fading de exemplos trabalhados), Chen (ACM TOCE 2025, worked examples +
> auto-explicação), Jung et al. (2025, pre-training + metacognição), Morr
> (subgoal labels, NSF 2012–2023), modelo Nebraska (SIGCSE 2005/2006) e PSIv1
> (SIGCSE 2023, proficiência sem pressupor programação), e o efeito da pressão
> de tempo (d = 0,35 — timers generosos).

## Princípios pedagógicos aplicados (dos findings)

1. **JS antes de Node** — mesmo uma trilha "do absoluto zero" com objetivo
   backend sequencia fundamentos de JavaScript antes do Node (Odin/FSO).
2. **Pre-training → worked example → fading → prática independente** — cada
   aula entrega PRIMEIRO a base teórica (conceito + estratégia), depois um
   exemplo COMPLETAMENTE resolvido com sub-objetivos rotulados, e só então o
   desafio (prática guiada). O desafio nunca é "resolva do zero sem andaime".
3. **Auto-explicação guiada** — exemplos trazem comentários explicando o "por
   quê" de cada passo; o tutor pede ao aluno para explicar com as próprias
   palavras.
4. **Linguagem simples, zero jargão sem explicação** — analogias do dia a dia;
   se o aluno não entender, o tutor sugere as aulas anteriores (prerequisites).
5. **Fontes fora do fluxo** — as URLs ficam em `sources[]` e aparecem SÓ no
   botão "Fontes".
6. **Proficiência sem pressupor programação** — o teste de proficiência cobre
   os conceitos CENTRAIS de todos os módulos com enunciados em linguagem
   simples; a 1ª estrela demora a sumir (carência 120s) porque pressão de tempo
   degrada a acurácia.

## Estrutura da trilha

8 módulos, 36 aulas, 1 desafio por aula, 1 teste de proficiência (cobre TUDO).

| # | Módulo | Aulas | Presume-se que o aluno sabe |
|---|---|---|---|
| 1 | `fundamentos-javascript` | 7 | Nada — é o zero absoluto |
| 2 | `nodejs-primeiros-passos` | 5 | Variáveis, funções, arrays (M1) |
| 3 | `assincronismo` | 5 | Rodar scripts Node, modules (M2) |
| 4 | `http-e-express` | 5 | Promises/async-await, npm (M3+M2) |
| 5 | `dados-e-persistencia` | 4 | Express, rotas, JSON (M4) |
| 6 | `autenticacao-e-seguranca` | 4 | Express + persistência (M4+M5) |
| 7 | `testes-e-qualidade` | 3 | APIs REST + async (M4+M3) |
| 8 | `deploy-e-producao` | 3 | Tudo acima |

## Conteúdo por aula

### Módulo 1 — fundamentos-javascript (zero absoluto)

| Aula | Ensina | Presume |
|---|---|---|
| `o-que-e-programacao` | O que é um programa, o que é código, o que o computador faz; como JS roda (motor, navegador/Node); o primeiro "Olá" | nada |
| `variaveis-e-tipos` | let/const, atribuição, string/number/boolean, template literals, typeof | aula 1 |
| `funcoes` | O que é função, declaração, parâmetros, retorno, chamada; por que funções organizam código | aulas 1–2 |
| `condicionais` | if/else, comparações (===, >, <), operadores lógicos && \|\| !, truthy/falsy | aulas 1–3 |
| `loops` | while e for, iterar contando, break/continue, quando usar cada um | aulas 1–4 |
| `arrays-e-objetos` | arrays (push, indexação, length, for...of), objetos (propriedades, aninhamento), combinação | aulas 1–5 |
| `erros-e-debug` | tipos de erro (Syntax/Reference/Type), ler stack trace, console.log como ferramenta, erro é esperado | aulas 1–6 |

### Módulo 2 — nodejs-primeiros-passos

| Aula | Ensina | Presume |
|---|---|---|
| `o-que-e-nodejs` | Node = JS fora do navegador; V8; diferença navegador×Node (sem DOM); o que dá para fazer | M1 |
| `executando-seu-primeiro-script` | node arquivo.mjs, console.log, process.argv, erros de execução | M1 |
| `modulos-e-import` | import/export (ESM), um arquivo por responsabilidade, importar funções | M1 + aulas 1–2 |
| `npm-e-package-json` | npm init, package.json (scripts, dependencies), instalar pacote (ex.: chalk), node_modules | M1 + aulas 1–3 |
| `core-modules-do-node` | path, os, fs (ler/escrever arquivo síncrono), process.env | M1 + aulas 1–4 |

### Módulo 3 — assincronismo

| Aula | Ensina | Presume |
|---|---|---|
| `operacoes-lentas` | Por que I/O é lento; o problema de bloquear; o event loop (analogia do restaurante) | M2 |
| `callbacks` | função como argumento, callback de sucesso/erro, callback hell (o problema) | M2 + aula 1 |
| `promises` | Promise, resolve/reject, .then/.catch, encadeamento; promise de fs | M2 + aulas 1–2 |
| `async-await` | async function, await, try/catch, Promise.all; código linear de novo | M2 + aulas 1–3 |
| `event-loop-e-fs-assincrono` | fs.readFile/promises, microtasks vs macrotasks (o essencial), setTimeout | M2 + aulas 1–4 |

### Módulo 4 — http-e-express

| Aula | Ensina | Presume |
|---|---|---|
| `como-a-web-funciona` | cliente/servidor, request/response, URL, métodos HTTP (GET/POST), status code | M3 |
| `http-com-node` | http.createServer, req.url/method, res.writeHead/end, JSON.stringify | M3 + aula 1 |
| `express-primeiros-passos` | o que é um framework, instalar express, app.get, listen, res.send | M3 + aulas 1–2 |
| `rotas-e-middleware` | req.params/query, app.use, middleware (log, json), ordem importa | M3 + aulas 1–3 |
| `apis-rest-e-json` | REST (recursos, verbos), res.json, 404, separar rotas em arquivos | M3 + aulas 1–4 |

### Módulo 5 — dados-e-persistencia

| Aula | Ensina | Presume |
|---|---|---|
| `dados-em-memoria` | array como "banco" em memória, CRUD manual com find/filter/push/splice | M4 |
| `arquivos-json` | fs + JSON.parse/stringify, persistir lista em arquivo, ler na subida | M4 + aula 1 |
| `sqlite-basico` | por que um banco; CREATE/INSERT/SELECT simples; node:sqlite | M4 + aulas 1–2 |
| `crud-completo` | CRUD real em API com SQLite (create/read/update/delete por id) | M4 + aulas 1–3 |

### Módulo 6 — autenticacao-e-seguranca

| Aula | Ensina | Presume |
|---|---|---|
| `senhas-e-hash` | por que NUNCA guardar senha em texto; hash (crypto.createHash/scrypt), comparação | M5 |
| `tokens-e-sessoes` | o que é um token, gerar/validar, header Authorization, o que NÃO fazer (JWT caseiro) | M5 + aula 1 |
| `headers-e-cors` | headers comuns (Content-Type, Authorization), CORS: o que é e o básico | M4 + aulas 1–2 |
| `erros-comuns-de-seguranca` | injeção de SQL, XSS básico, secrets no código, princípio do menor privilégio | M4–M6 |

### Módulo 7 — testes-e-qualidade

| Aula | Ensina | Presume |
|---|---|---|
| `por-que-testar` | o que é teste automatizado, o ciclo red-green, o que um bom teste cobre | M4+M3 |
| `node-test-basico` | node:test + assert, test(), asserções, rodar com node --test | M4+M3+aula 1 |
| `testes-de-api` | testar rotas com fetch real (app.listen ephemeral), cenários feliz/erro | M4 + aulas 1–2 |

### Módulo 8 — deploy-e-producao

| Aula | Ensina | Presume |
|---|---|---|
| `variaveis-de-ambiente` | .env, process.env, por que config não vai no git, dotenv | M7 |
| `deploy-em-servidores` | o que é deploy, build/start scripts, PM2 básico, porta/health check | M7 + aula 1 |
| `observabilidade-e-logging` | logs estruturados, erros 500 vs 404, morgan, o que monitorar | M7 + aulas 1–2 |

## Teste de proficiência (proficiency.json)

Cobre os conceitos CENTRAIS de todos os módulos: variáveis/funções, módulos,
promessas, HTTP/Express (rota GET), persistência (ler/gravar), e uma noção de
teste. Enunciado em linguagem simples (não presume programação). Dificuldade 5,
carência da 1ª estrela 120s. Quem passa destrava a trilha inteira.

## Regras para os desafios (challenge.json)

- `language: 'nodejs'`; `solution.mjs` exporta a(s) função(ões); `test.mjs`
  importa de `./solution.mjs` e usa `node:test` + `assert/strict`;
- o teste deve FALHAR com o starter (throw "não implementado") e PASSAR com a
  solução; `expectedTestCount` = nº de testes; 2–4 testes (normal + limite +
  erro);
- a função do desafio é derivada do slug (kebab → camelCase: `dobro-do-numero`
  → `dobroDoNumero`);
- statement em markdown pt-BR, linguagem simples, termina lembrando de ler o
  enunciado e clicar em "Começar".
