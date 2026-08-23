# Bootstrap — a sequência de abertura

Instrução operacional. Vale **toda vez** que a skill é invocada, não só na primeira.
Referência de primeiro nível: carregada direto do `SKILL.md`.

## Sumário
Constantes · Passo 1 `resolve_target` · Passo 2 `verify_setup` · Passo 3 `bootstrap_or_ask`
(a única parada obrigatória) · A entrevista de criação · Passo 4 `load_memory` ·
Passo 5 `ingest_docs` · Passo 6 `open_session` · Modo efêmero · Regras permanentes ·
Falas modelo · Decisões abertas geradas aqui

## Constantes

```
SETUP_ROOT = raiz do setup do aluno
SETUP_DOCS = $SETUP_ROOT/docs      # o `docs/` do setup — material teórico
SETUP_MEM  = $SETUP_ROOT/memory
SETUP_CTL  = $SETUP_ROOT/.study-method
MANIFEST   = $SETUP_CTL/manifest.json
REGISTRY   = ${STUDY_METHOD_HOME:-${XDG_DATA_HOME:-$HOME/.local/share}/study-method}/registry.json
```

## Passo 1 — resolve_target

Precedência **fixa**: argumento explícito > diretório corrente (ou ancestral) > registry.

1. Se a invocação trouxe um caminho, use-o e pule para o passo 2.
2. Senão, procure `MANIFEST` em `$PWD` e depois em cada ancestral, parando em `$HOME` **inclusive**.
   Nunca acima de `$HOME`.
3. Senão, leia `REGISTRY`.
   - ausente ou vazio → passo 3;
   - entradas cujo diretório sumiu → marque `setup_status: missing`, avise em uma linha, continue;
   - exatamente 1 ativo → **abra e anuncie**, com o escape na mesma frase. Não é parada;
   - 2 ou mais → menu curto, ordenado por `last_used_at`, mais recente primeiro.

`REGISTRY` é índice derivado. Se estiver ilegível: **não sobrescreva**, avise, siga com registry
vazio em memória, e só mova o arquivo quebrado para `registry.json.corrupt-<timestamp>` na hora em
que houver algo real para gravar.

## Passo 2 — verify_setup

Classifique o alvo antes de confiar nele:

| Estado | Condição | Ação |
|---|---|---|
| `valid` | `MANIFEST` parseia + 4 diretórios + `README.md` | siga |
| `incomplete` | falta diretório ou `README.md` | recrie **só estrutura vazia** e o `README.md` do template; avise em uma linha |
| `corrupt` | `MANIFEST` não parseia | **pare e pergunte** (3 saídas, abaixo) |
| `candidate` | sem `MANIFEST`, mas ≥2 diretórios canônicos | **pare e pergunte**: adotar (recriar só o controle)? |
| `none` | nada | passo 3 |

Nunca sobrescreva nem apague um `MANIFEST` corrompido. As três saídas: remontar o controle a partir
do disco (movendo o quebrado para `.corrupt-<timestamp>`), abrir somente-leitura, ou apontar outro
setup.

Antes de prometer qualquer gravação, teste `test -w "$SETUP_ROOT"`. Sem permissão de escrita: diga
**agora**, não no meio da aula, e ofereça modo efêmero.

## Passo 3 — bootstrap_or_ask (a ÚNICA parada obrigatória)

Só executa quando não há setup em lugar nenhum. Numa retomada normal, este passo **não roda**.

Pergunte em três frases: diagnóstico sem drama · oferta com o custo declarado · saída na mesma
mensagem. Depois **espere**. Não crie nada antes do "sim".

Proibido neste passo:
- criar diretório, arquivo ou entrada de registry antes do consentimento;
- assumir que `$PWD` é o lugar certo (o lugar é a pergunta Q2);
- rodar `git init`, instalar pacote, baixar qualquer coisa;
- repetir a oferta mais de **uma** vez depois de uma recusa;
- fazer a entrevista antes do "sim".

Tratamento das respostas:

| Resposta | Ação |
|---|---|
| "sim" | entrevista abaixo |
| "não" | **modo efêmero**; diga o que ainda consegue fazer e como reabrir depois; não volte ao assunto |
| "já tenho um em `<caminho>`" | volte ao passo 1 com esse caminho (adoção, não criação) |
| ambígua / pergunta de conteúdo | **responda a pergunta primeiro**, em modo efêmero; reofereça **uma vez**, em uma linha, no fim |
| silêncio | nada foi gravado, nada a limpar |
| caminho impossível (sem permissão) | teste antes de tentar, explique, proponha um caminho gravável |

## A entrevista de criação

Máximo **7 trocas** entre o "sim" e a primeira frase de aula. Só entram decisões marcadas
`ask_when: setup-init`.

| # | Pergunta | Grava |
|---|---|---|
| Q1 | O que você quer estudar? | `subject`, `subject_slug` |
| Q2 | Crio a pasta em `<default>`? | `setup_path` |
| Q3 | Já tem material (PDF, slides, anotações) ou começo do zero? | `theory_source` |
| Q4 | Vai ter exercício de código? Em qual linguagem? | `practice_language` (`none` é válido) |
| Q5 | Quanto tempo por sessão? | `session_minutes` |
| Q6 | Está começando do zero, enferrujado, ou já manja? | `starting_level` |
| — | Confirmação mostrando exatamente o que será criado | — |

Q4 oferece **apenas linguagens detectadas na máquina** (`detect-toolchains.sh`). Nunca ofereça uma
linguagem que não roda aqui.

Logo depois de Q1, ofereça o atalho, com os defaults visíveis na frase. Se o aluno topar, o caminho
inteiro vira 2 trocas. Grave `default_used: true` em cada campo assumido e **diga uma vez** o que
assumiu — nunca aplique default em silêncio.

Não pergunte agora: versionar `memory/` no git · orçamento de leitura · compactação/RAG · formato de
visualização · sandbox · intervalos de revisão · idioma (infira da conversa) · preferências de
analogia (observe, não pergunte).

Ordem de escrita, e só depois do "pode":
```
1. mkdir dos 4 diretórios + $SETUP_CTL/cache
2. README.md a partir do template
3. $MANIFEST
4. entrada no $REGISTRY   (por último — nunca aponte para setup pela metade)
5. se theory_source == generated -> gere a base teórica (marcada, ver abaixo)
```
`setup-init.sh` é idempotente: rodar duas vezes no mesmo caminho não duplica nem sobrescreve.

**Material gerado por você é sempre marcado**, em três camadas: mora em `$SETUP_DOCS/generated/`,
tem `provenance: generated_researched|generated_unsourced` no frontmatter, e abre com o aviso em
pt-BR de que foi gerado por IA e pode conter erro. Na conversa, sempre que se apoiar nele, diga de
onde veio. Material do aluno **vence** material gerado em qualquer conflito — e o conflito é
apontado, nunca resolvido em silêncio.

## Passo 4 — load_memory

- `memory/` vazia → primeira aula: pule digest, proponha um roteiro curto.
- Com histórico → leia `INDEX.json` + `profile.json` e use o digest montado **por código**. Nunca
  leia os brutos em sequência para "descobrir o que importa".
- `INDEX.json` ausente ou mais velho que o bruto mais novo → reconstrua antes.
- Bruto ilegível → pule, liste quais, siga. Nunca aborte a aula por causa disso.
- Sessão com `status: in_progress` → menu de 3: retomar · fechar como está e abrir nova · descartar.
  "Descartar" **move** para `memory/discarded/`, nunca apaga. Sessão órfã sem conteúdo nenhum:
  descarte sozinho e mencione em quatro palavras.
- Fato com `needs_reconfirmation: true` → **pergunte**, não afirme. Nunca abra a aula tratando um
  rótulo antigo como verdade atual.

## Passo 5 — ingest_docs

Regido por `references/docs-ingest.md`, que é referência de primeiro nível do `SKILL.md` — não uma
continuação deste arquivo. O contrato mínimo que este passo garante:

- `$SETUP_DOCS` ausente → recrie vazio, avise em uma linha, siga para o menu de pasta vazia;
- vazio → menu de 3: você põe o material agora · eu gero a base (marcada) · seguimos sem base;
- dentro do orçamento → leia tudo, anuncie em uma linha;
- acima do orçamento → carregue só o relevante e **declare por nome o que ficou de fora**;
- nada legível (PDF sem extrator, binário) → diga qual arquivo e por quê, com saídas concretas.

Nunca diga "li seu material" quando leu uma fração dele.

## Passo 6 — open_session

Crie `memory/NNNN.json` (4 dígitos, zero-padded) com `status: in_progress`, e anuncie o plano da
aula em uma frase, terminando com um convite a corrigir o rumo ("sigo por aí?").

Em modo efêmero e em modo somente-leitura este passo **não roda** — e você não promete memória.

## Modo efêmero

Estado explícito, destino do "não", do setup somente-leitura e da opção "abrir só para leitura".
Nele: ensine normalmente · não escreva nada · não numere nada · não prometa lembrar · desafio com
teste executável fica indisponível, e diga o porquê uma vez, se o assunto surgir.

## Regras permanentes

Valem por toda a sessão, não só na abertura:

1. Nada é criado sem consentimento explícito. Diretório estrutural de um setup já consentido é a
   única exceção, e é anunciado.
2. Nenhum default aplicado em silêncio: grave `default_used: true` e diga uma vez.
3. Nunca leia material pela metade sem declarar o que ficou de fora.
4. Nunca apague dado do aluno; mova.
5. Anuncie em uma linha, não em um relatório de status.
6. Depois de uma recusa, no máximo uma reoferta — e só com contexto novo.

## Falas modelo

Exemplos de **tom**, não script para copiar. Adapte às palavras do aluno.

Parada obrigatória:
> "Dei uma olhada por aqui e não achei nenhum setup de estudo — nem nesta pasta, nem no meu
> registro. Quer que eu monte um agora? São 5 perguntas rápidas e a gente já começa a aula. Se
> preferir, dá pra gente só conversar sobre a matéria hoje, sem eu gravar nada."

O aluno já chegou com um assunto:
> "Bora. Antes: não tenho setup nenhum montado ainda — se você deixar eu criar um, eu guardo o que a
> gente vier fazendo e na próxima já retomo daí. Monto agora (2 minutos) ou respondo direto sobre
> derivada e a gente vê isso depois?"

Recusa (o caminho do "não" precisa soar tão natural quanto o do "sim"):
> "Beleza, sem setup. Te ajudo normal com a matéria hoje — só não vou lembrar disso na próxima
> conversa, e não monto desafio com teste, que precisa de pasta pra viver. Quando quiser, é só falar
> *cria um setup*."

Atalho da entrevista:
> "Posso assumir o resto e a gente ajusta no caminho: pasta em `~/estudos/calculo`, sessão de 60
> minutos, exercícios em Python, e eu monto uma base teórica inicial. Toco assim, ou prefere
> responder as 4 perguntas?"

Confirmação antes de escrever:
> "Vou criar em `~/estudos/calculo`: `docs`, `memory`, `researchs`, `challenges` e um `README.md`.
> Pode?"

Sessão órfã:
> "A sessão de terça (0018) ficou aberta — a gente estava em derivada de função composta e parou no
> meio. Retomo dali, fecho ela como está e começo uma nova, ou jogo fora?"

Retomada depois de duas semanas:
> "Faz duas semanas. A gente parou em limites laterais, e da última vez a definição formal estava
> meio escorregadia. Ainda está, ou você mexeu nisso nesse meio tempo?"

## Decisões abertas geradas aqui

| ID | Pergunta ao usuário | Opções | Default sugerido | Reversibilidade |
|----|---------------------|--------|------------------|-----------------|
| D-B03 | Quantas perguntas na criação do setup? | as 6 mínimas + confirmação · só o assunto e o resto no default · entrevista longa com todas as decisões | 6 + confirmação, com atalho de 2 trocas | cheap |
| D-B04 | Onde eu crio o setup por padrão? | na pasta atual · em `~/estudos/<assunto>` · sempre perguntar | pasta atual se vazia, senão `~/estudos/<assunto>` | moderate |
| D-B05 | Em que idioma o setup é escrito? | pt-BR fixo · o idioma da nossa conversa · perguntar | idioma da conversa | cheap |
| D-B06 | O que fazer com uma sessão que ficou aberta da vez anterior? | perguntar · retomar automático · fechar automático · descartar automático | perguntar (menu de 3) | cheap |
| D-B07 | Quando você roda a skill fora de uma pasta de estudo e existe um setup só, eu abro ele direto? | abro e aviso · sempre pergunto | abro e aviso, com escape na mesma frase | cheap |
| D-B10 | Onde fica o arquivo de controle do setup? | `.study-method/manifest.json` (oculto) · `setup.json` (visível na raiz) | `.study-method/manifest.json` — autoridade: sub-tarefa 2.1 | moderate |
