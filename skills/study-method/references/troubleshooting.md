# Troubleshooting — o catálogo de falhas

Instrução operacional. Referência de primeiro nível: carregada direto do `SKILL.md`. Cada entrada
é sintoma → causa → o que você faz → o que dizer ao aluno. Fale sempre em linguagem de gente: sem
jargão de sistema, sem despejar stack trace, sem culpar o aluno por nada disto — são todas falhas
de máquina ou de ambiente, nunca dele.

## Sumário
Toolchain ausente · `pip install` e PEP 668 · Setup movido ou apagado · Sessão órfã · Sessão
concorrente · Schema inválido (exit 5) · Desafio rejeitado 3× · `docs/` do setup acima do
orçamento · PDF sem extrator · Sandbox degradada · Registry corrompido · Gráfico que não renderiza.

---

## Toolchain da linguagem ausente

**Sintoma**: o aluno pede um desafio numa linguagem e `detect-toolchains.sh --language <l>`
devolve `available: false`, ou `challenge-new.sh` sai `5` por falta de template de layout.

**Causa**: hoje só **5 linguagens têm o ciclo de desafio completo implementado** — Python, Node,
Go, Rust e C. As outras 14 do enum (`java`, `csharp`, `ruby`, `elixir`, `kotlin`, `swift`, `cpp`,
`php`, `lua`, `julia`, `r`, `haskell`, `bash`, `typescript`) existem no vocabulário, mas ainda não
têm o par `runner.sh`/`layout_profile` validado por execução nesta máquina.

**O que você faz**: nunca tenta gerar um desafio na linguagem que falhou. Ofereça a linguagem mais
próxima entre as 5 prontas (Ruby/PHP → Python; C# → Go; Elixir/Kotlin/Java → sem vizinha direta,
ofereça Go ou Python mesmo assim) ou um desafio em papel (sem execução, sem `challenge_status:
validated`, deixando claro que este não passa pelo verificador). Nunca instala toolchain sozinho.

**O que dizer ao aluno**: "Ainda não tenho o desafio com teste automático pronto para Elixir — só
Python, Node, Go, Rust e C por enquanto. Quer fazer este em Python (a lógica é a mesma) ou prefere
um exercício sem correção automática, só para praticar no papel?"

---

## `pip install` falhando por PEP 668

**Sintoma**: qualquer `pip install` no Python do sistema falha com
`error: externally-managed-environment` (o arquivo `EXTERNALLY-MANAGED` existe nesta instalação).

**Causa**: a distro protege o Python do sistema para não colidir com o gerenciador de pacotes do
SO (PEP 668). Isso não é um bug nem uma permissão faltando — é intencional.

**O que você faz**: nunca use `--break-system-packages` e nunca instale nada sem oferecer e
esperar a confirmação. A saída correta é um **venv dedicado da skill**
(`~/.local/share/study-method/venv`, ~60 MB, criado uma vez), e ele é sempre **oferecido**, nunca
imposto — a aula segue normalmente sem ele, com o renderizador stdlib (SVG/HTML/ASCII).

**O que dizer ao aluno**: "Para gráfico com mais recurso eu preciso de uma biblioteca (matplotlib)
que o Python do sistema não deixa instalar direto — é proteção da distro, não erro. Posso criar um
ambiente isolado só para isso (uma pasta de ~60 MB, não mexe no resto do seu sistema). Quer que eu
faça, ou seguimos com o gráfico simples que já funciona sem instalar nada?"

---

## Setup movido ou apagado

**Sintoma**: `bootstrap` resolve um `setup.json` num caminho e o `setup_id` de lá já existe no
registry, apontando para outro `path`. Ou: uma entrada do registry aponta para um diretório que
não existe mais.

**Causa**: o aluno moveu, renomeou ou apagou a pasta do setup fora da skill (mv, backup, disco
externo desmontado). O registry é só **cache de descoberta** — a identidade real é o `setup_id`
(12 hex, sorteado uma vez, gravado dentro do próprio `setup.json`); `path` é atributo volátil,
**nunca** a chave.

**O que você faz**: se o `path` antigo não existe mais, corrija o registry sozinho (é reconciliação
determinística, sem alternativa razoável) e registre a correção como uma linha no `NNNN.json`
(`registry_path_fixed`) — não pergunta. Se o diretório sumiu e não há candidato novo, marque
`setup_status: missing` e siga; a entrada nunca é apagada (pode haver `cross_setup_refs`
apontando para ela, e um backup pode trazê-la de volta). Menção a um setup `missing`: no máximo
uma vez por sessão, só se for relevante.

**O que dizer ao aluno**: ao corrigir sozinho, nem precisa falar — é transparente. Se sumiu de
vez: "O setup de Rust que estava em `/mnt/dados/rust` não está acessível agora — talvez um disco
desmontado. Marquei como sumido, sem apagar nada; se reaparecer, eu religo sozinho, ou você me diz
o caminho novo."

---

## Sessão órfã

**Sintoma**: existe `memory/NNNN.json` com `status: "in_progress"` e nenhum lock vivo
correspondente — `.session.lock` ausente, com `hostname` de outra máquina, ou **expirado**. ⚑
"Expirado" tem **duas** leituras, e a segunda é a comum: com `pid` numérico o lock morre quando o
processo morre (`kill -0` falha); com **`pid: null`** — o caso normal, sem `SM_SESSION_OWNER_PID` —
ele morre por **tempo**, quando `started_at` passa do `SM_SESSION_LOCK_TTL` (default 8 h).

**Causa**: a sessão anterior foi interrompida sem `close_session` rodar — terminal fechado, crash,
`kill`. É o modo de falha mais comum do sistema em uso real.

**O que você faz**: a recuperação é **automática e silenciosa em `memory-index.sh --verify`**,
sempre no passo `load_memory` — **nunca pergunta "quer retomar/fechar/descartar?"**. `status` vira
`abandoned`, `finalized_by: "auto_orphan_recovery"`, `finalized_at` recebe o `mtime` do arquivo, e
todo o conteúdo já escrito é preservado (o checkpoint incremental do passo `teach` é o que dá valor
a isso). A retomada entra como **primeiro item da agenda** em `plan_lesson`, razão `orphan_resume`
— nunca como pergunta solta na abertura.

**O que dizer ao aluno**: em uma linha, sem drama, e só quando `days_ago <= 7`: "Da última vez a
gente ficou no meio de derivada por partes — sigo daí, ou prefere outra coisa hoje?"

---

## Sessão concorrente

**Sintoma**: `session-new.sh` sai **exit 4**: `.session.lock` existe, `hostname` bate com esta
máquina, e o lock está **vivo** por uma das duas vias — `pid` numérico com `kill -0` respondendo,
ou `pid: null` com `started_at` dentro do TTL (`SM_SESSION_LOCK_TTL`, default **8 h**).

**Causa**: há outra sessão viva no mesmo setup — outro terminal aberto —, **ou** uma trava que a
skill não liberou num crash recente. ⚠ **Não diagnostique por `kill -0` sozinho.** No caso comum o
lock nasce com `pid: null` e não há processo nenhum para consultar: `kill -0` não responde coisa
alguma, e um crash de 10 minutos atrás deixa um lock que continua **vivo pelo TTL** por até 8
horas. Quem decide é `sm_session_lock_alive`; o motivo dele fica em `SM_SESSION_LOCK_REASON` e sai
em stderr.

**O que você faz**: **não abra uma segunda sessão sobre a mesma**. O default é abortar e explicar;
a alternativa é abrir em modo somente-leitura, sem gravar `NNNN.json` nenhum. Nunca tenta
"resolver" apagando o lock sozinho — se o lock está vivo, apagá-lo colidiria com a outra sessão de
verdade. Se o aluno tem certeza de que não há outra sessão aberta (foi um crash), o caminho é
**esperar o TTL** ou pedir a ele que apague `memory/.session.lock` — decisão dele, anunciada, nunca
sua por conta própria.

**O que dizer ao aluno**: "Esse setup já está aberto em outra sessão sua agora (outro terminal ou
aba). Posso continuar aqui só de leitura, sem salvar nada, ou você fecha a outra primeiro e eu
retento. Qual prefere?"

---

## Schema inválido (exit 5)

**Sintoma**: um script sai `5` — fora de um `--apply` do protocolo REQUEST/APPLY (esse caso tem
regra própria: refazer o pedido, nunca forçar).

**Causa**: um JSON em disco não bate com o schema esperado — dado corrompido, campo de tipo
errado, um `NNNN.json` escrito por versão antiga.

**O que você faz**: **nunca copie o stderr cru** (linhas `<json-pointer>: <motivo>`) para o
aluno — isso é ruído de implementação, não informação útil para ele. Siga o caminho degradado do
passo em questão: arquivo de memória vai para `memory/broken/` (quarentena, nunca apagado);
`docs-index.json` corrompido se reconstrói reindexando; um evento de progresso sem artefato
correspondente é descartado com aviso. A aula não trava por causa disto.

**O que dizer ao aluno**: traduza para o efeito prático, nunca para o erro técnico: "Um dos seus
registros de sessão antigos ficou corrompido — não vou conseguir ler aquele em especial, mas o
resto do seu histórico está inteiro e eu não apago nada quebrado, só guardo de lado."

---

## Desafio rejeitado pelo verificador 3 vezes seguidas

**Sintoma**: `challenge-verify.sh` devolve `verdict: rejected` (ou `weak`) em três tentativas
seguidas de regeneração do mesmo desafio.

**Causa**: o gerador não está conseguindo produzir um teste que passe pelo harness determinístico
(gate de execução: `build_failed`, `test_gap` demais, `fails_on_reference`, etc.) — não é o aluno
que errou, é a geração do desafio que não fechou.

**O que você faz**: **desiste do desafio, não insiste numa quarta tentativa.**
`challenge_status: "rejected"`, descarte o artefato, e **ensine com um exemplo resolvido** no lugar
— mostre a solução de referência como worked example, com a lógica explicada passo a passo. Depois,
se fizer sentido, proponha **outro** desafio do mesmo conceito, gerado do zero.

**O que dizer ao aluno**: "Não consegui montar um teste confiável para este exercício depois de
algumas tentativas — problema meu, não seu. Deixa eu te mostrar a solução resolvida e explicada, e
já te preparo um outro exercício do mesmo assunto pra você praticar de verdade."

---

## `docs/` do setup acima do orçamento

**Sintoma**: `docs-index.sh` mede o `docs/` do setup e ele passa do teto (~20k tokens de partida,
~60% do orçamento total da aula).

**Causa**: material grande — um livro inteiro, várias apostilas — que não cabe no contexto de uma
sessão só.

**O que você faz**: modo indexado (manifesto). `docs-index.sh <setup_root> --select` monta os
candidatos por score determinístico e pode pedir sua escolha final entre os empatados (protocolo
REQUEST/APPLY, `select_sections`). Carregue só as seções relevantes ao tópico de hoje.

**O que dizer ao aluno, sempre, por nome**: nunca "carreguei seu material" de forma vaga. Declare o
que entrou e o que ficou de fora: "Seu material tem 340 páginas. Carreguei os capítulos 3 e 4
(limites e continuidade), que é onde estamos. Ficaram de fora: séries, integrais, apêndice de
trigonometria — se a aula esbarrar em algum, é só pedir que eu abro na hora."

---

## PDF sem extrator

**Sintoma**: o `docs/` do setup tem um `.pdf` e a extração de texto falha ou não roda.

**Causa**: cadeia de detecção `pdftotext` (poppler) → `pypdf` → `PyMuPDF` → nenhum. **Nesta
máquina, `pdftotext` está presente** — então este caso hoje é raro aqui, mas pode acontecer em
outra instalação, ou o PDF pode ser escaneado (imagem, sem texto nenhum para extrair, mesmo com o
extrator presente e funcionando).

**O que você faz**: nunca instala nada sozinho, nunca finge que leu o que não leu. Três saídas
concretas, e você só **sugere** o comando de instalação quando o extrator falta de verdade:

**O que dizer ao aluno**:
- Sem extrator na máquina: "Tem um PDF aí que eu não consigo ler nesta máquina — falta uma
  ferramenta (poppler). Você pode instalar (`sudo pacman -S poppler` no Arch, `sudo apt install
  poppler-utils` no Debian) e eu releio na hora; exportar o PDF para `.txt`/`.md`; ou eu escrevo a
  base teórica do assunto, marcada como gerada. Qual prefere?"
- PDF escaneado (texto extraído é quase zero mesmo com o extrator funcionando): "Esse PDF é
  escaneado — são imagens de página, não texto. Sem OCR eu não leio. Tem alguma versão em texto
  dele?"

---

## Sandbox degradada

**Sintoma**: alguma camada da pilha de isolamento (namespace de rede, namespace de PID, cgroup de
memória, confinamento de escrita) não está disponível nesta máquina.

**Causa**: falta de privilégio do kernel, macOS sem os mesmos primitivos do Linux, ou ausência de
`bubblewrap`/Docker — varia por ambiente, e a skill sonda no início do setup e cacheia por sessão.

**O que você faz**: nunca finge que a proteção existe quando não existe, e nunca roda o teste do
aluno com a sandbox no piso **sem confirmação explícita dele naquele momento**. Diga em voz alta,
em uma linha, o que está e o que não está protegido — não é detalhe de implementação, é informação
de segurança real: por padrão, **mesmo no piso**, tempo (`ulimit -t`/`timeout -s KILL`) e ausência
de rede continuam garantidos; o que costuma faltar sem ferramenta extra é o **confinamento de
escrita** — sem `bubblewrap`/Docker, o código do teste pode escrever em qualquer lugar que o
usuário do sistema também possa.

**O que dizer ao aluno**: "Sandbox: tempo OK, sem rede OK, memória OK — mas escrita confinada NÃO
nesta máquina (não tenho bubblewrap aqui). Isso significa que, em teoria, um teste malicioso ou
com bug grave poderia escrever fora da pasta do desafio. Para código normal de aprendizado isso é
baixo risco, mas eu preciso que você saiba disso antes de rodar."

---

## Registry corrompido

**Sintoma**: `${STUDY_METHOD_HOME}/registry.json` não parseia (JSON inválido, truncado).

**Causa**: escrita interrompida no meio (queda de energia, `kill -9` no meio de uma gravação sem
ser via `sm_atomic_write` de outro processo, disco cheio).

**O que você faz**: **nunca bloqueia a aula por isso.** Renomeia o arquivo quebrado para
`registry.json.corrupt-<epoch>` (preservado, nunca destruído) e recria um registry vazio. Segue com
o setup atual normalmente — o registry é só cache de descoberta; qualquer setup é 100%
reconstruível a partir do seu próprio `setup.json`. O único efeito colateral é não conseguir listar
outros setups do aluno até ele apontar o caminho de novo.

**O que dizer ao aluno**: uma vez, sem alarme: "Meu índice de setups internos deu problema — não
perdi nada seu, cada setup guarda os próprios dados sozinho. Só não vou lembrar de outros setups
seus até você me apontar o caminho de novo."

---

## Gráfico que não renderiza

**Sintoma**: `render-plot.py` sai `1`/`2`/`3`, ou sai `0` mas com `warnings` avisando que o PNG (ou
outro formato) falhou.

**Causa**: spec malformada, série de dados vazia/não numérica, falha de escrita em disco, ou
ausência de uma biblioteca opcional (matplotlib) que só afeta o PNG.

**O que você faz**: falha de PNG **nunca** é motivo para abortar a explicação — as quatro saídas
obrigatórias (SVG, HTML autocontido, descrição textual, ASCII/braille) não dependem de biblioteca
nenhuma; o PNG é só um extra. Leia `description_text`, `stats` e `warnings` do stdout antes de
narrar qualquer coisa — você não vê a imagem gerada.

**O que dizer ao aluno**: se só o PNG falhou, nem precisa mencionar — as outras saídas cobrem a
explicação. Se a spec em si falhou (exit `1`/`2`): "Não consegui montar o gráfico com esses dados
— [motivo curto, ex.: 'a série veio vazia']. Deixa eu te descrever o resultado em texto enquanto eu
ajusto." e siga com a versão ASCII/texto, nunca trave a aula esperando a figura perfeita.
