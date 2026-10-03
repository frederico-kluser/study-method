# Plano da ronda 2 (lacunas das rondas 1) — trabalho do orquestrador

Origem: `novas_perguntas` dos retornos Q1, Q2, Q4, Q7 (arquivados/em contexto).
Filtro de entrada aplicado (§5.6): todas servem a pergunta-raiz (decisão catálogo
vs. jogo infinito + propostas para o app). Numeração: filhos do pai (Q1.1…).

## Prioridade ALTA (lançar na ronda 2, todos em paralelo)

- Q1.1 (fonte-unica) — Como funciona HOJE a progressão por ligas dos jogos
  multiplayer do CodinGame? (corroboração independente de F2/Q1; é a mecânica
  "jogo-sistema com níveis" mais próxima da alternativa infinita.)
- Q1.2 (atualidade) — Estado 2026 do catálogo CodinGame (nº puzzles, Academy,
  certificações, ligas, streaks/XP): as fontes datam de 2020-2023 e o site
  recusou extract.
- Q2.1 (contra-evidencia) — Métricas públicas de finalização/engajamento de
  TIS-100, EXAPUNKS, HRM, CodeCombat (além do "2% concluem SpaceChem"): o
  sucesso é generalizável ou de nicho?
- Q4.1 (quantificacao) — Tamanho de efeito EXATO (g/d + IC) da meta-análise de
  Costa (2023) e moderação por tipo de conceito de jogo.
- Q4.2 (lacuna) — Que desenho de puzzle/game maximiza TRANSFERÊNCIA para
  escrita de código real (o ponto de falha dos estudos nulos).
- Q7.1 (lacuna) — Isolamento local em Windows (AppContainer/Job Objects) e
  macOS (Seatbelt) para runner desktop sem Docker + limites suportados.
- Q7.2 (lacuna) — Proteção de testes escondidos/integridade da avaliação com
  runner LOCAL (ofuscação, verificação server-side, assinatura de resultados).
- Q6.2 (lacuna) — Como estruturam as plataformas os language adapters
  (compilação/execução/comparação) para vereditos normalizados
  (Accepted/WA/TLE/MLE/CE/RE) independentes da linguagem.
- Q5.1 (lacuna) — Desafios-chave cumulativos ("chefes") melhoram a retenção de
  conceitos de programação vs. quizzes espaçados equivalentes? (a evidência
  atual é indireta — testing effect — e é a mecânica central da proposta).
- Q8.1+Q5.2 (contra-evidencia/contradicao) — Que salvaguardas de ranking
  (opt-out, comparação consigo mesmo, ranking relativo por pares, reset
  periódico, pseudónimos) têm evidência de mitigar o dano? (Q8 e Q5 convergem:
  o DESIGN modera o sinal do efeito — uma só investigação.)
- Q8.2 (lacuna) — Dose-limiar de recompensas extrínsecas e calendário do
  efeito novidade em apps de estudo contínuo.
- Q3.1 (aprofundamento) — Os "coding duels" gerados por análise de programa
  (Code Hunt/Pex4Fun) mantêm dificuldade calibrada e solvabilidade à escala, ou
  degradam para variação superficial? (único sistema documentado que gera
  exercícios VERIFICADOS automaticamente — o candidato a "jogo infinito".)
- Q3.2 (contra-evidencia) — Existe estudo que quantifique o fracasso de
  validação humana de exercícios gerados por IA ("shallowness") na maioria dos
  casos? (a evidência atual é indireta: testes fracos, sub-especificação.)

## Para a SÍNTESE (design judgment — não precisa de investigador)

- Q6.1 (aprofundamento, alta) — Qual contrato de avaliação minimiza o custo por
  nova linguagem no app-alvo: stdin/stdout + verificador único, stubs+testes
  idiomáticos por linguagem, ou DSL/VM do jogo? Decisão de arquitetura a tomar
  na síntese com os padrões A-D do Q6 e a arquitetura existente do app
  (adaptadores + harness de testes já existem).

## Prioridade MÉDIA (só se a ronda 2 não saturar / em ronda 3)

- Q2.2 — Mecanismos de onboarding (zines/manuais/hints/skip) que mitigam atrito.
- Q2.3 — "Hacker battles" assíncronas do EXAPUNKS e retenção por competição social.
- Q4.3 — Retenção dos efeitos a 3-6 meses.
- Q7.3 — Limites concretos isolate/Judge0 em produção (wall-clock, memória…).
- Q7.4 — Viabilidade/overhead de WASM (Pyodide, C/Rust→wasm) como executor local.
- Q1.3 — Métricas de retenção (MAU/streaks/conclusão) das plataformas benchmark.
- Q1.4 — Mais encerramentos de coding-games; estado do Empire of Code (contra-evidência ao formato jogo-sistema).
- Q1.5 — Modos de duelo curto tipo Clash of Code (Codewars Kumite) (baixa).
- Q6.3 — API de jogo (loop por tick, orçamento de CPU) vs. I/O por lote em
  jogos contínuos/competitivos (Screeps/CodinGame multiplayer).
- Q6.4 — Como o Exercism versiona enunciados partilhados entre tracks
  (problem-specifications/canonical-data) e o que isso implica para puzzles
  multi-linguagem.
- Q5.3 — Streak repair (recuperação de streak, pausas planeadas): efeitos em
  ansiedade/retenção de aprendizes ocasionais.
- Q5.4 — Desbloqueio por mastery vs. progressão linear: autonomia, conclusão.
- Q8.3 — Em programação, a utilidade instrumental (emprego/notas) altera o
  efeito de sobrejustificação? (media)
- Q8.4 — Proteger quem fica no fim do ranking sem desmotivar o topo (media).

## Notas de integração (para a passagem de integração)

- Escudo: Q7 já limpo ("risco nenhum"); Q1/Q2/Q4 por passar ao escudo na
  transcrição para `.recon/games-research/retornos/`.
- Dedupe de fontes por DOI e depois por URL; atenção: Q4 F8 (Liu & Jeong 2022,
  doi 10.1007/s11423-021-09622-8) traz o URL errado (igual a F7) — o bibliotecário
  confirma.
- Contradições a registar na §5 do dossiê: magnitude gamificação (Q4:
  g=.25-.49 vs .822 vs nulo); Docker-as-sandbox (Q7); WASM especificação vs
  implementação (Q7); histogramas vs leaderboards (Q2); acessibilidade vs nicho
  (Q2); linguagens CodeCombat/CheckiO/Codewars (Q1, resolvíveis por data).
