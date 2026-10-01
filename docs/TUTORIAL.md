# Tutorial — primeiros passos no Study Method

> **Para quem é este documento:** para quem nunca usou o Study Method e quer
> estudar já hoje. É um guia passo a passo do **app desktop (GUI)**. Se quiser
> usar a **skill** dentro de um agente de código (sem janela), o caminho é
> outro e curto: ver ["Uso em 60 segundos"](../README.md#uso-em-60-segundos) no
> README.
>
> Tempo estimado: **10 minutos** até à primeira aula concluída.

---

## O que este app faz (em 4 linhas)

O Study Method é um **tutor de estudo** para programação e matemática. Você
escolhe uma **trilha** (um curso pronto — C, Python, Rust…), estuda **aula a
aula** com um tutor em chat (teoria em seções, quiz, visualizações) e resolve
**desafios validados por teste**, com feedback de um avaliador. O seu progresso
fica guardado **no seu computador** — não há conta, nem perfil, nem nuvem.

---

## 1. Instalar

**Requisitos:** Linux · `bash`, `python3`, `jq` · **Node ≥ 22.13** e **npm ≥ 11**
(confira com `node -v` e `npm -v`).

```bash
git clone <url-do-repositorio> study-method
cd study-method
./install.sh
```

O `install.sh` instala tudo de uma vez: as skills locais do projeto, as
dependências do app (`npm ci` em `app/`) e cria `app/.env.local` (vazio — as
chaves você preenche no passo 3, pela própria interface). Ele **não** escreve
fora do clone e **não** usa `sudo`.

> Antes de rodar qualquer coisa de um repositório novo, leia o que ele faz:
> o [`README.md`](../README.md) tem a secção "Antes de instalar — o aviso
> honesto" com comandos para verificar que os scripts não usam rede nem `sudo`.

## 2. Rodar

```bash
./run.sh
```

Sobe a janela do app. Na primeira execução o app mostra a tela **"Antes de
começar"** — ela pede as duas chaves de API do passo seguinte. É normal: sem
elas o tutor não consegue nem pesquisar fontes nem conversar.

## 3. As duas chaves de API

| Chave | Para que serve | Onde obter |
|---|---|---|
| **OpenRouter** (`sk-or-v1-…`) | o tutor (chat, quizzes de recuperação) e o feedback dos desafios | [openrouter.ai/keys](https://openrouter.ai/keys) |
| **Brave Search** | a pesquisa de fontes que sustenta o material | [brave.com/search/api](https://brave.com/search/api/) |

Na tela "Antes de começar", cole cada chave, clique **Validar** e depois
**Salvar**. O app valida antes de aceitar — um ícone verde/vermelho mostra o
resultado. Você também pode fazer isto depois em **Configurações → Chaves de
API**.

**Preciso das duas?** O conteúdo das trilhas já vem pronto no app; as chaves são
para a parte viva — tutor, quiz de recuperação e feedback de desafio (OpenRouter)
e pesquisa de fontes (Brave). Sem elas o app não passa da tela inicial.

**Quero só feedback local, sem nuvem:** em **Configurações → LLM local** pode
baixar um modelo para o seu computador (`Detectar hardware` → baixar → ativar) e
escolher **"Modelo local"** como provedor de feedback do desafio.

## 4. O tutorial dentro do app

Depois de liberar o app, ele oferece um tour:

- **Quick Start** — a interface em 1 minuto, sem exigir chaves.
- **Tutorial Completo** — passo a passo pelas chaves, a aula e o desafio
  (exige as chaves configuradas; sem elas, o botão oferece "Configurar chaves").

Pulou por engano? **Reabra a qualquer momento**: no pé da coluna lateral (ao
lado do tema e do idioma) há o botão **Ajuda e tutorial** — ele volta a abrir a
escolha de tour.

## 5. Estudar a primeira aula

1. **Início** — escolha uma das **trilhas** listadas ("C iniciante",
   "Python iniciante", "Rust iniciante"…). Cada trilha tem módulos e aulas já
   definidos, do zero ao avançado.
2. **Trilha** — o mapa do curso mostra o que está concluído, em andamento e
   travado (uma aula só destrava quando a anterior é concluída — ou quando você
   passa no teste de proficiência). Clique numa aula.
3. **Aula** — a aula é um **chat com o tutor**:
   - clique em **"Começar aula"** para receber a teoria em seções (se a
     digitação estiver a decorrer, "Mostrar tudo" revela a seção inteira);
   - peça qualquer dúvida no campo **"Sua dúvida…"** — o tutor responde no
     meio da conversa;
   - aos **quizzes**: escolha a alternativa e receba o veredito. Se errar, o
     tutor explica e apresenta um quiz de recuperação — a meta é dominar o
     conceito, não acertar à sorte;
   - termine com **"Concluir aula"** — o progresso é gravado e a próxima aula
     destrava.

**Atalhos úteis do chat:** o botão de microfone transcreve a sua voz (tudo
local); clicar no painel durante a digitação revela a seção mais cedo.

## 6. Resolver um desafio

Os desafios são a parte prática: código de verdade, testado de verdade.

- **Como chegar lá:** pelo card **"Tentar o desafio agora"** no início da aula,
  pelo botão **"Desafios"** no cabeçalho da aula, ou pela própria Trilha.
- **O enunciado** fica à esquerda, com a tabela de cenários que os testes cobrem.
- **O editor** (centro) não tem autocomplete de propósito — treina o código de
  memória. Salve com **Ctrl+S** (o teste roda o que está salvo; um ponto na aba
  marca o que ainda não foi).
- **"Testar resposta"** faz duas coisas: roda os **testes determinísticos** (o
  terminal mostra a saída real) e pede **feedback ao avaliador** sobre a sua
  solução.
- **Estrelas e cronómetro:** cada desafio começa com 3 estrelas e um relógio
  (só começa quando você clica em "Começar"). Tempo esgotado, sair da janela ou
  falhar nos testes custa estrelas — é o jogo, não é punição.
- **Não passou?** O veredito diz o que falhou e você pode **"Refazer desafio"**
  mantendo o seu código. Tentar, falhar e corrigir é o fluxo esperado.

> **Nunca-repetir:** desafios que você já tentou (passou, esgotou ou abandonou)
> saem da lista de seleção — a lista sempre mostra o que falta.

## 7. O que o app guarda (e onde)

- **Progresso** (aulas concluídas, tentativas, estrelas): `study.db` na pasta de
  dados do app (Linux: `~/.config/study-method-gui/`).
- **Modelos locais** (LLM/voz): `models/` dentro da mesma pasta.
- **Preferências** (tema, idioma, largura das colunas): `localStorage` do app.

Tudo fica na sua máquina. Para recomeçar do zero: **Configurações → Progresso →
Limpar progresso**.

## 8. Ajustes úteis

| Onde | O que dá para fazer |
|---|---|
| Pé da coluna lateral | tema **Claro · Sistema · Escuro** e idioma **PT/EN** |
| **Configurações → Chaves de API** | validar/trocar as chaves |
| **Configurações → LLM local** | baixar modelo local, escolher o provedor de feedback do desafio |
| **Configurações → Aparência / Som** | tema e voz |
| **Configurações → Progresso** | ver e limpar o progresso |
| Botão **Ajuda e tutorial** (coluna lateral) | reabrir os tours |

A coluna lateral tem uma **divisória arrastável** — arraste (ou use o teclado
nela) para dar mais espaço ao texto ou ao código.

## 9. Problemas comuns

| Sintoma | O que fazer |
|---|---|
| A tela "Antes de começar" não avança | As duas chaves precisam estar **validadas** (ícone verde). Confira se colou a chave inteira (`sk-or-v1-…` para o OpenRouter). |
| "Erro 401: chave inválida…" | A chave está errada ou revogada — gere outra em openrouter.ai/keys e valide de novo. |
| A geração/aula aborta a dizer que falta a chave Brave | A pesquisa de fontes precisa da chave Brave Search válida — valide em Configurações. |
| `./run.sh` reclama da versão do Node | Instale **Node ≥ 22.13** e **npm ≥ 11**. |
| O tour não apareceu na primeira vez | Reabra pelo botão **Ajuda e tutorial**, no pé da coluna lateral. |
| "Testar resposta" não apanha as minhas alterações | Salve primeiro (**Ctrl+S**) — os testes rodam o ficheiro salvo. |
| O feedback do desafio demora ou falha | Confirme a chave OpenRouter, ou ative um **modelo local** em Configurações → LLM local. |
| Quero voltar à última aula | **Aba Aula** restaura a última aula aberta; ou use **Continuar** na Home. |

## 10. Para ir mais longe

| Documento | O que responde |
|---|---|
| [`README.md`](../README.md) | o que é o projeto, a skill em 60 segundos, privacidade e segurança |
| [`docs/app-gui.md`](app-gui.md) | manual técnico da GUI: cada painel, cada contrato |
| [`docs/02-pedagogia.md`](02-pedagogia.md) | por que o tutor conversa como conversa |
| [`docs/16-engine-de-trilha.md`](16-engine-de-trilha.md) | como as trilhas são fabricadas e validadas |
| [`CONTRIBUTING.md`](../CONTRIBUTING.md) | como rodar os testes e contribuir |

Bons estudos — e quando errar um desafio, lembre-se: o app foi desenhado para
você errar, ver porquê e tentar de novo.
