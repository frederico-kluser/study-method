# Trilha Node.js do Zero — especificação de conteúdo (rodada 9)

> ## ⛔ A TRILHA FOI REMOVIDA EM 2026-09-02
>
> `app/resources/tracks/nodejs-do-zero/` (274 arquivos, 1,8 MB) e o diretório de trabalho
> `app/content-src/programacao-do-zero/` foram **apagados**, junto com a trilha micro
> `programacao-do-zero`. `app/resources/tracks/` está vazio. Este documento **fica** — ele é o
> registro de por que o conteúdo foi descartado, e apagá-lo apagaria a lição.
>
> **O placar medido que motivou a remoção** (gate determinístico da engine, modo `inferred` —
> leitura permissiva, o número real é maior, nunca menor):
>
> | Medição | Valor |
> |---|---|
> | Violações (erros) | **717** |
> | Desafios com ao menos uma violação | **112 de 118** (95%) |
> | Lacunas de currículo (construção que **nenhuma** aula ensina) | **249** |
> | Avisos (bateria A13–A16) | 92 |
> | Construções novas na aula 1 (`fundamentos-javascript/o-que-e-programacao`) | **16 verdadeiramente novas** — o teto é **4** |
>
> **O motivo, em uma aula.** A AULA 1 — a primeira coisa que um iniciante absoluto encontra no
> curso — introduzia 16 construções novas, e o PRIMEIRO desafio dela exigia `IfStatement`,
> `typeof`, `!==` e `throw new Error`. O gate aponta as linhas:
>
> ```
> linha 2 do solutionCode combina 5 construções novas (form:IfStatement[alternate=null],
>    node:IfStatement, node:TypeOfExpression, op:binary:!==, op:unary:typeof)
> linha 3 combina 3 construções novas (global:Error, node:NewExpression, node:ThrowStatement)
> ```
>
> Um curso que começa falando de função, parâmetro e `throw` na primeira aula não é um curso para
> quem está começando. Não havia o que salvar por reescrita pontual: 112 dos 118 desafios estavam
> quebrados e 249 construções cobradas não tinham aula nenhuma que as ensinasse.
>
> **O que sobreviveu.** A engine (`app/electron/main/engine/`, `npm run engine`) e o gate que
> mediu tudo isto — ver `docs/16-engine-de-trilha.md`. O contrato de conteúdo abaixo continua
> válido como ESPECIFICAÇÃO: quem escrever a próxima trilha de Node começa por aqui, agora com o
> gate rodando desde a primeira aula em vez de depois de 118.
>
> **Como reproduzir o placar:** não dá mais — o conteúdo não existe. Os números acima são o
> registro da última medição, feita em 2026-09-02 com
> `cd app && npm run engine -- audit nodejs-do-zero --limite 0` sobre o conteúdo já apagado.

> Contrato de CONTEÚDO da trilha `nodejs-do-zero` (resources/tracks/nodejs-do-zero).
> O formato dos arquivos é o de `trackTypes.ts` (rodadas 8–9; a rodada 9 adiciona
> `files[]` para desafios multi-arquivo) — quem cria aula é o CLI de autoria; o
> aluno só consome. Este documento define O QUÊ cada módulo e aula ensina e o que
> se presume que o aluno sabe — a base para os arquivos
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

18 módulos, 118 aulas, 1 desafio por aula, 1 desafio de MÓDULO por módulo e
1 teste de proficiência (cobre TUDO) — 137 desafios no total.

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
| 9 | `arrays-profundas` | 14 | Arrays e objetos do M1 |
| 10 | `objetos-profundos` | 8 | Objetos do M1 |
| 11 | `poo` | 11 | Objetos e funções (M10+M1) |
| 12 | `funcoes-avancadas` | 8 | Funções e arrays do M1 |
| 13 | `assincronismo-avancado` | 6 | Async/await e event loop básico (M3) |
| 14 | `nodejs-avancado` | 8 | Core modules e async (M2+M3) |
| 15 | `http-avancado` | 6 | Express, rotas, middleware (M4) |
| 16 | `banco-de-dados-avancado` | 5 | SQLite e CRUD (M5) |
| 17 | `arquitetura-e-padroes` | 8 | APIs REST e middleware (M4) |
| 18 | `especialista` | 8 | Tudo acima (deploy e testes em especial) |

Os módulos 1–8 foram definidos na rodada 8; os módulos 9–18 (rodada 9) levam a
trilha do intermediário ao **especialista**: primeiro a linguagem em
profundidade (arrays, objetos, POO, funções, assincronismo), depois o Node e o
servidor em profundidade (Node avançado, HTTP avançado, banco avançado,
arquitetura e padrões) e, por fim, um módulo de excelência em produção.

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

### Módulo 9 — arrays-profundas (rodada 9)

| Aula | Ensina | Presume |
|---|---|---|
| `adicionar-e-remover` | push/pop/shift/unshift: colocar e tirar itens das pontas da lista | arrays-e-objetos (M1) |
| `concatenar-arrays` | concat e espalhamento (`...`): juntar duas ou mais listas em uma | aula 1 |
| `juntar-em-texto` | join e toString: transformar a lista inteira em um único texto | aula 2 |
| `fatiar-arrays` | slice: pegar um pedaço da lista sem tocar na original | aula 3 |
| `cortar-e-substituir` | splice: remover, inserir e trocar itens no meio da lista | aula 4 |
| `procurar-posicao` | indexOf e lastIndexOf: em que posição um valor está, de frente ou de trás | aula 5 |
| `verificar-existencia` | includes: sim/não para "este item está na lista?" | aula 6 |
| `encontrar-elemento` | find e findIndex: caçar o primeiro item que satisfaz uma condição | aula 7 |
| `filtrar-elementos` | filter: lista nova só com os itens que passam num teste | aula 8 |
| `transformar-elementos` | map: aplicar a mesma regra em todos os itens e receber lista nova | aula 9 |
| `reduzir-a-um-valor` | reduce: percorrer a lista acumulando um resultado único | aula 10 |
| `testar-todos` | some e every: algum item passa, ou todos passam? | aula 11 |
| `ordenar-arrays` | sort e reverse: ordenar e virar a lista — sem sujar a original | aula 12 |
| `achatar-e-criar` | flat, flatMap, Array.from e fill: desdobrar listas aninhadas e criar listas novas | aula 13 |

### Módulo 10 — objetos-profundos (rodada 9)

| Aula | Ensina | Presume |
|---|---|---|
| `objetos-base` | criar objetos, ler/trocar propriedades com ponto e colchetes, aninhar objetos | arrays-e-objetos (M1) |
| `shorthand-e-chaves-dinamicas` | propriedades curtas (shorthand) e chaves com nomes vindos de variáveis | aula 1 |
| `destructuring-de-objetos` | extrair várias propriedades numa linha só, com valores padrão e novos nomes | aula 2 |
| `spread-e-rest-em-objetos` | copiar/mesclar objetos com `...` e separar o "resto" com rest | aula 3 |
| `this-e-contexto` | this — o objeto dono do método — e function vs arrow nesse contexto | aula 4 |
| `object-keys-values-entries` | Object.keys/values/entries e hasOwnProperty: o objeto por dentro | aula 5 |
| `getters-e-setters` | propriedades que calculam na hora (get) e validam antes de guardar (set) | aula 6 |
| `objetos-aninhados-e-copias` | referência vs cópia; copiar de verdade com structuredClone e JSON | aula 7 |

### Módulo 11 — poo (rodada 9)

| Aula | Ensina | Presume |
|---|---|---|
| `o-que-e-poo` | o paradigma dos objetos: agrupar dados e comportamentos em "coisas" | objetos + funções (M10+M1) |
| `classes` | class + new: o molde (planta) e a instância (casa) | aula 1 |
| `construtor-e-campos` | constructor, campos com padrão e validação de entrada — o objeto nasce pronto | aula 2 |
| `metodos` | métodos de instância: ações que operam nos próprios dados com this | aula 3 |
| `getters-setters-de-classe` | get e set na classe: leitura/escrita controladas com sintaxe de propriedade | aula 4 |
| `membros-estaticos` | static: métodos e campos da classe inteira, sem instância | aula 5 |
| `heranca` | extends: herdar campos e métodos e sobrescrever quando o comportamento muda | aula 6 |
| `super` | super() no constructor e super.metodo(): a ponte para a classe mãe | aula 7 |
| `encapsulamento` | campos e métodos privados (#): o mundo exterior só fala com os métodos públicos | aula 8 |
| `polimorfismo` | um método, muitos comportamentos: tratar objetos pela forma comum | aula 9 |
| `composicao-vs-heranca` | "é um" (herança) vs "tem um" (composição); preferir composição; instanceof | aula 10 |

### Módulo 12 — funcoes-avancadas (rodada 9)

| Aula | Ensina | Presume |
|---|---|---|
| `closures` | closure: a função guarda o escopo onde nasceu, mesmo depois de a externa terminar | funcoes (M1) |
| `escopo-e-hoisting` | onde cada variável vive, hoisting e a zona morta temporal do let/const | aula 1 |
| `arrow-vs-function` | sintaxe enxuta das arrows e onde diferem de function: this, arguments, constructor | aula 2 |
| `parametros-default-e-rest` | valores padrão em parâmetros e número qualquer de argumentos com `...rest` | aula 3 |
| `higher-order-functions` | funções como valores: passar como argumento, devolver e compor pipelines | aula 4 |
| `call-apply-bind` | escolher o objeto do this na chamada com call, apply e bind | aula 5 |
| `iife-e-encapsulamento` | IIFE: escopos privados e o padrão de módulo para proteger estado | aula 6 |
| `recursao` | dividir em versões menores de si mesmo: caso base, chamada recursiva, pilha | aula 7 |

### Módulo 13 — assincronismo-avancado (rodada 9)

| Aula | Ensina | Presume |
|---|---|---|
| `event-loop-em-profundidade` | as fases do event loop do Node (timers, poll, check) e por que o JS nunca trava esperando | M3 (async-await, event loop básico) |
| `microtasks-e-macrotasks` | as duas filas: por que .then/await rodam antes de setTimeout — a regra de ouro | aula 1 |
| `promise-api` | Promise.all, allSettled, race e any: orquestrar várias promises e saber qual usar | aula 2 |
| `async-iterators` | for await...of e async generators: valores que chegam aos poucos | aula 3 |
| `abort-e-timeout` | AbortController e limites de tempo com Promise.race: quando desistir de esperar | aula 4 |
| `async-em-serie-vs-paralelo` | em série, em paralelo ou com limite de concorrência — e o custo de cada escolha | aula 5 |

### Módulo 14 — nodejs-avancado (rodada 9)

| Aula | Ensina | Presume |
|---|---|---|
| `buffers` | o que é um Buffer, por que o Node trabalha com bytes, conversão utf8/hex/base64 | core-modules + async (M2+M3) |
| `streams` | Readable/Writable/Transform, pipe e por que processar em pedaços economiza memória | aula 1 |
| `fs-em-profundidade` | fs/promises: mkdir recursivo, listagem, stat e watch de mudanças | aula 2 |
| `events` | EventEmitter: on, once, emit e o tratamento especial do evento error | aula 3 |
| `child-process` | spawn e exec: rodar outros programas lendo saída, erros e código de saída | aula 4 |
| `worker-threads` | paralelismo de verdade com troca de mensagens entre main e workers | aula 5 |
| `cluster` | um processo primário distribui conexões entre workers (todos os núcleos) | aula 6 |
| `process-e-utilitarios` | process.env/argv/exitCode e os e path com destreza | aula 7 |

### Módulo 15 — http-avancado (rodada 9)

| Aula | Ensina | Presume |
|---|---|---|
| `validacao-de-entrada` | conferir body e query antes de usar: tipo, obrigatoriedade, formato — erros 400 claros | rotas/middleware + REST (M4) |
| `middlewares-avancados` | cadeias com propósito, desvio de erros, async middlewares e fábricas de middleware | aula 1 |
| `tratamento-de-erros` | middleware central de erros: status certos (400/404/422/500) e mensagens seguras | aula 2 |
| `rest-na-pratica` | recursos e verbos de verdade, listas paginadas com links (HATEOAS leve), 201/204/404 | aula 3 |
| `upload-e-body-parsing` | formulários e arquivos (multipart), limites de tamanho, corpo grande como stream | aula 4 |
| `websockets` | conexão persistente baseada em eventos — e quando é melhor (ou pior) que polling | aula 5 |

### Módulo 16 — banco-de-dados-avancado (rodada 9)

| Aula | Ensina | Presume |
|---|---|---|
| `transacoes` | o que é uma transação, por que é "tudo ou nada" (ACID), BEGIN/COMMIT/ROLLBACK no node:sqlite | sqlite + CRUD (M5) |
| `indices` | o que é um índice, quando acelera, o que custa; CREATE INDEX (compostos e UNIQUE) | aula 1 |
| `joins` | relacionamentos 1:N com chave estrangeira; INNER JOIN e LEFT JOIN na consulta | aula 2 |
| `migracoes` | o schema tem história: mudanças versionadas como código, up e down | aula 3 |
| `sql-injection-defense` | por que colar texto digitado no SQL é fatal; parâmetros (?) impedem a injeção | aula 4 |

### Módulo 17 — arquitetura-e-padroes (rodada 9)

| Aula | Ensina | Presume |
|---|---|---|
| `camadas-e-modulos` | separar em camadas e módulos — uma responsabilidade por arquivo | REST + middleware (M4) |
| `repository` | a porta única dos dados: guardar, buscar e listar sem ninguém saber onde moram | aula 1 |
| `service` | regras de negócio no centro, recebendo o repositório pronto — handlers finos e testável | aula 2 |
| `factory` | objetos completos com uma fábrica: defaults, validação e independência entre instâncias | aula 3 |
| `singleton` | uma única instância compartilhada — e quando o padrão atrapalha (testes, acoplamento) | aula 4 |
| `observer` | desacoplar quem produz de quem reage: subscribe, emit e o EventEmitter do Node | aula 5 |
| `middleware-pattern` | a esteira que move o Express: contexto + next, interrupção e ordem de lista | aula 6 |
| `injecao-de-dependencias` | receber dependências prontas em vez de criar — trocar implementações e testar com fakes | aula 7 |

### Módulo 18 — especialista (rodada 9)

| Aula | Ensina | Presume |
|---|---|---|
| `debugging-profundo` | inspetor do Node, breakpoints, stack traces que contam história, logs de investigação | deploy + testes (M8+M7) |
| `performance-e-profiling` | medir antes de otimizar: timing, CPU profile, gargalos comuns, saúde do event loop | aula 1 |
| `seguranca-avancada` | headers seguros, rate limiting, segredos fora do código, cadeia de suprimentos, OWASP Top 10 | aula 2 |
| `testes-avancados` | cobertura que diz a verdade, integração real, mocking de dependências, testes por propriedades | aula 3 |
| `deploy-avancado` | containers, CI/CD, blue-green, rollback e paridade entre ambientes | aula 4 |
| `observabilidade` | os três pilares — logs estruturados, métricas e tracing — e alertas que só acordam quando importa | aula 5 |
| `design-de-apis` | versionamento, contratos, documentação e compatibilidade: evoluir sem quebrar quem usa | aula 6 |
| `ler-e-manter-codigo-alheio` | ler legado sem pânico, refatorar com rede de segurança, code review que agrega | aula 7 |

## Desafios de módulo (rodada 9)

No fim de CADA módulo (18 no total — os 10 módulos novos + os 8 originais) existe
um **desafio de MÓDULO** (`modules/<slug>/challenges/<slug>/challenge.json`,
declarado em `module.json` como `challenge`):

- **Multi-arquivo** — `files[]` com 2–3 arquivos (ex.: `lib/pedidos.mjs`,
  `lib/relatorio.mjs`) que se importam entre si; o editor mostra uma ABA por
  arquivo e o submit envia o código de TODOS; verificado por execução como
  qualquer desafio (starter falha + solução passa + igualdade de contagem);
- **Elaborado** — statement longo (cenário do mundo real com ~2–4 mil
  caracteres, ex.: "O sistema da lanchonete Sabor do Bairro") e 4–6 testes por
  verificação;
- **UI** — card "Desafio do módulo" na trilha, logo abaixo das aulas do módulo,
  com estados pendente/concluído (✓)/tentado;
- **Regeneração oculta** — desafios de módulo são AUTORAIS (não são gerados por
  LLM): o botão "Gerar novo desafio" não aparece quando o target é `module`. A
  regeneração com nunca-repetir continua existindo para desafios de AULA.

## UX: teoria pronta + checks por teste (rodada 9)

- **Teoria determinística** — a aula em chat apresenta a TEORIA direto do
  arquivo `lesson.json` (markdown, seção por seção): sem LLM e sem loading. O
  LLM é usado SÓ para dúvidas (`answer`) e para gerar novo desafio.
- **Falha rápida sem chave** — sem chave de LLM, o `answer` devolve erro
  estruturado (`TUTOR_UNAVAILABLE`); o fluxo nunca trava em spinner infinito.
- **Checks por teste** — o veredito do desafio mostra a LISTA de checks
  individuais (✓/✗ por teste, com nome) + a razão parcial "N de M testes
  passaram". Aprovação não é tudo-ou-nada: o aluno vê exatamente o que passou e
  o que falta. O botão "Gerar novo desafio" aparece em qualquer não-aprovação
  total (falhou OU timeout, incluindo veredito parcial); confete só com
  `passed=true`.

## Teste de proficiência (proficiency.json)

Cobre os conceitos CENTRAIS de todos os módulos: variáveis/funções, módulos,
promessas, HTTP/Express (rota GET), persistência (ler/gravar), e uma noção de
teste. Enunciado em linguagem simples (não presume programação). Dificuldade 5,
carência da 1ª estrela 120s. Quem passa destrava a trilha inteira.

## Regras para os desafios de AULA (challenge.json)

- `language: 'nodejs'`; `solution.mjs` exporta a(s) função(ões); `test.mjs`
  importa de `./solution.mjs` e usa `node:test` + `assert/strict`;
- o teste deve FALHAR com o starter (throw "não implementado") e PASSAR com a
  solução; `expectedTestCount` = nº de testes; 2–4 testes (normal + limite +
  erro);
- a função do desafio é derivada do slug (kebab → camelCase: `dobro-do-numero`
  → `dobroDoNumero`);
- statement em markdown pt-BR, linguagem simples, termina lembrando de ler o
  enunciado e clicar em "Começar";
- desafios de MÓDULO seguem as regras próprias da seção
  ["Desafios de módulo (rodada 9)"](#desafios-de-módulo-rodada-9) — multi-arquivo
  (`files[]`) e elaborados.

## Trilha micro `programacao-do-zero`

Resposta direta ao feedback do usuário: a primeira trilha projetada com **zero pressupostos** — 14
aulas micro, **≤1 avanço produtivo (≤2 receptivos) por aula**, e nada é cobrado sem ter sido
demonstrado antes (o "pecado nº 1" do feedback: cobrar `function`, parâmetro e `return` sem nenhuma
aula que os tivesse ensinado). A progressão produtiva da trilha tem 9 átomos:

`NumericLiteral → CallExpression → ExportKeyword → Parameter → ReturnStatement → decl:let →
StringLiteral → decl:const → FunctionDeclaration`

O contrato de CONTEÚDO detalhado dessa trilha (o `curriculo.md` — 14 aulas com avanço × atividade ×
desafio × provas — e o `relatorio-validacao.md`) **vive fora de docs/**, em
`app/content-src/programacao-do-zero/`; este documento registra apenas a existência da trilha e sua
assinatura pedagógica.
