/**
 * app/electron/main/engine/runtime/jsonTail.ts — separa o objeto JSON de topo
 * da CAUDA de checksum que o prompt canônico do autor manda o modelo escrever
 * DEPOIS do JSON (§7.1 R18, A-P11-5, `docs/16-engine-de-trilha.md`).
 *
 * DE ONDE ISTO VEIO (onda anterior, `curriculumGap.ts`): as fases `f7Theory.ts`
 * e `f8Challenges.ts` faziam `JSON.parse` direto sobre a resposta do autor, e
 * a regra 18 do prompt TERMINA pedindo o checksum de cauda (a repetição da
 * lista de construções permitidas) DEPOIS do JSON — então o parse falhava por
 * construção contra qualquer modelo obediente. O conserto reusou
 * `separarJsonECauda`, que já existia em `modes/curriculumGap.ts` (o primeiro
 * lugar que precisou dela). Isso funcionou, mas abriu um CICLO no grafo de
 * módulos: `f7Theory → curriculumGap → f7Theory` (via `blocosDeCodigoDaTeoria`,
 * que `curriculumGap` importa de `f7Theory`) e
 * `f8Challenges → curriculumGap → f7Theory → f8Challenges`. Um ciclo
 * empiricamente inofensivo (nenhum dos três usa o binding do outro em tempo
 * de AVALIAÇÃO, só dentro de função — `tsc` limpo, suíte verde), mas que
 * INVERTIA A CAMADA: `phases/` passando a depender de `modes/`, quando
 * `modes/` é quem deveria orquestrar `phases/` (é `curriculumGap` que importa
 * `blocosDeCodigoDaTeoria` de `f7Theory`, nunca o contrário — ver o cabeçalho
 * de `curriculumGap.ts`). Esta onda faz a extração mecânica que o revisor
 * recomendou: mover a função, byte-idêntica, para um módulo-FOLHA.
 *
 * POR QUE AQUI (`runtime/`, e não um arquivo dentro de `phases/` ou `modes/`):
 * os outros oito arquivos deste diretório (`callLlm.ts`, `llmCache.ts`,
 * `backoff.ts`, `ledger.ts`, `runState.ts`, `scheduler.ts`, `semaphore.ts`,
 * `task.ts`) são todos primitivas de INFRAESTRUTURA da engine — transporte,
 * cache, retry, auditoria, persistência, escalonamento, concorrência — e
 * NENHUM deles importa de `phases/` nem de `modes/` (conferido: only
 * `node:*` e módulos irmãos dentro do próprio `runtime/`). Este arquivo entra
 * na mesma categoria pelo mesmo motivo: é uma função PURA e SEM ESTADO sobre
 * uma string — o formato bruto que `callLlm` devolve em `LlmCallResult.content`
 * quando o prompt segue a convenção "JSON seguido de cauda" — e três
 * consumidores de camadas DIFERENTES (`phases/f7Theory.ts`,
 * `phases/f8Challenges.ts`, `modes/curriculumGap.ts`) precisam da MESMA
 * implementação. Não coube em nenhum dos oito arquivos existentes porque
 * nenhum deles lida com o CONTEÚDO textual de uma resposta de LLM — eles
 * lidam com o transporte da chamada, não com o que o texto de volta CONTÉM —
 * então um arquivo novo, e não uma função a mais em `callLlm.ts`, mantém cada
 * arquivo deste diretório com uma responsabilidade só.
 *
 * O QUE ESTE MÓDULO NÃO FAZ: não valida o JSON contra nenhum schema (isso é
 * dos chamadores, com o schema de cada um), não decide se a cauda BATE com o
 * que era esperado (isso é `compararChecksum`, em `prompts/author.ts`), e não
 * "conserta" JSON malformado — sem um objeto de topo BALANCEADO, devolve
 * `null` e quem chamou recusa (fail-closed, §9.3).
 *
 * FOLHA, de propósito: este arquivo não importa nada de `../phases` nem de
 * `../modes` (a suíte estrutural `tests/engineModuleGraphAcyclic.test.ts`
 * tranca isso lendo o grafo de imports de `engine/**` — não só o `tsc`, que
 * tolera ciclo, nem o `npm run build`, que nem alcança estes arquivos: o
 * bundle do electron-vite não inclui `engine/phases` nem `engine/modes`, só o
 * CLI via `tsx` os usa).
 */

/**
 * Estado da leitura do objeto: profundidade de chaves + a máquina de estados
 * da string (`emString`/`escapado`). A transição por caractere está dividida
 * em `avancarEmString`/`avancarForaDeString` (refatoração L06, CC≤8): o
 * comportamento é byte a byte o do laço original, agora auditável por partes.
 */
interface EstadoLeitura {
  profundidade: number;
  emString: boolean;
  escapado: boolean;
}

/**
 * Avança o estado DENTRO de uma string: `\` abre fuga (o próximo caractere é
 * literal, inclusive `"` e `\`), `"` fecha a string. É o ramo `if (emString)`
 * do laço original, semântica preservada caractere a caractere.
 */
function avancarEmString(estado: EstadoLeitura, c: string): void {
  if (estado.escapado) {
    estado.escapado = false;
    return;
  }
  if (c === '\\') {
    estado.escapado = true;
    return;
  }
  if (c === '"') estado.emString = false;
}

/**
 * Avança o estado FORA de string: `"` abre string, `{` aprofunda, `}` rasa —
 * devolve `true` quando o `}` fecha o objeto de topo. `[`, `]`, `,`, `:` e
 * prosa qualquer são ignorados pela contagem de profundidade (como no laço
 * original: só `{`/`}` contam, e só fora de string).
 */
function avancarForaDeString(estado: EstadoLeitura, c: string): boolean {
  if (c === '"') {
    estado.emString = true;
    return false;
  }
  if (c === '{') {
    estado.profundidade += 1;
    return false;
  }
  if (c === '}') {
    estado.profundidade -= 1;
    return estado.profundidade === 0;
  }
  return false;
}

/**
 * Percorre `conteudo` a partir do `{` em `inicio` e devolve o índice do `}`
 * que fecha o objeto de topo — ou `null` quando ele nunca fecha (fail-closed:
 * sem objeto balanceado não há o que extrair).
 */
function encontrarFimDoObjeto(conteudo: string, inicio: number): number | null {
  const estado: EstadoLeitura = { profundidade: 0, emString: false, escapado: false };
  for (let i = inicio; i < conteudo.length; i += 1) {
    const c = conteudo[i];
    if (estado.emString) {
      avancarEmString(estado, c);
      continue;
    }
    if (avancarForaDeString(estado, c)) return i;
  }
  return null;
}

/**
 * Extrai o objeto JSON da resposta do autor. O prompt canônico do §7.1 TERMINA
 * pedindo o checksum de cauda (a repetição da lista de construções permitidas)
 * DEPOIS do JSON — então `JSON.parse` do conteúdo inteiro falha por
 * construção. Esta função devolve o primeiro objeto de topo BALANCEADO e a
 * cauda que sobrou, sem nunca "consertar" JSON: se não há objeto balanceado,
 * devolve `null` e o chamador recusa.
 */
export function separarJsonECauda(conteudo: string): { json: string; cauda: string } | null {
  const inicio = conteudo.indexOf('{');
  if (inicio < 0) return null;
  const fim = encontrarFimDoObjeto(conteudo, inicio);
  if (fim === null) return null;
  return { json: conteudo.slice(inicio, fim + 1), cauda: conteudo.slice(fim + 1) };
}
