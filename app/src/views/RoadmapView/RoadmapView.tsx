/**
 * src/views/RoadmapView/RoadmapView.tsx — TRILHA (rodada 8): VIEW PURA +
 * container (state/view split — STORY-SPEC §5).
 *
 * `RoadmapViewView` é a VIEW PURA (só props — o que as histórias e os testes
 * SSR renderizam); `RoadmapView` é o CONTAINER que liga `useRoadmapView` e
 * mantém o export público do registry de views.
 *
 * A trilha JÁ VEM com os itens (módulos e aulas pré-definidos pelo CLI de
 * autoria) — o aluno escolhe a aula, nunca gera:
 *   - módulos em ordem, com as aulas (título, resumo, dificuldade) e os
 *     estados done/current/pending + TRAVAMENTO sequencial (locked);
 *   - o TESTE DE PROFICIÊNCIA no topo (ProficiencyCard);
 *   - ADITIVO (rodada 9): o DESAFIO DO MÓDULO (ModuleCard);
 *   - clicar numa aula → pendingTrackLesson + navega para a aba Aula;
 *   - entrada: pendingTrackSlug (Home → Trilha) drenado na montagem (hook).
 */
import { useMemo, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { ModuleCard } from './ModuleCard';
import { ProficiencyCard } from './ProficiencyCard';
import type { RoadmapViewViewProps } from './useRoadmapView';
import { useRoadmapView } from './useRoadmapView';
import type { ViewProps } from '../placeholders';
import { LAYOUT } from '../../lib/designTokens';
import { CenteredColumn } from '../../components/ui/CenteredColumn';
// §10/§3 (LAYOUT-DRY-AUDIT): cartão de lista acionável e erro+retentativa são
// os primitivos partilhados (a copy fica aqui).
import { InfoCard } from '../../components/ui/InfoCard';
import { RetryAlert } from '../../components/ui/RetryAlert';
// §1: o piso de alvo de toque é UM objeto de estilo (`touchTargetSx`).
import { touchTargetSx } from '../../lib/layoutSx';

export type { RoadmapViewViewProps, RoadmapTrackSummary } from './useRoadmapView';

// (O antigo `TOUCH_TARGET_PX` local saiu — ver `lib/layoutSx.ts` → `touchTargetSx`.)

export function RoadmapViewView({
  track,
  loading,
  loadError,
  selected,
  tracks,
  noTracks,
  justUnlocked,
  unlockedTitles,
  openLesson,
  openTrack,
  goBackToList,
  openProficiency,
  openModuleChallenge,
  loadTrack,
  loadTracks,
}: RoadmapViewViewProps): ReactElement {
  const { t } = useTranslation();
  const tI = useMemo(
    () => t as unknown as (key: string, options?: Record<string, string | number>) => string,
    [t],
  );

  // Seletor de trilha (quando nenhuma veio pendente).
  if (selected === null && !loading && tracks && tracks.length > 0) {
    return (
      <CenteredColumn>
        <Typography variant="h5" component="h1" gutterBottom>
          {t('translation:roadmap.pickTitle')}
        </Typography>
 <Stack spacing={1}>
          {tracks.map((tr) => (
            // §10 InfoCard (LAYOUT-DRY-AUDIT) ACIONÁVEL: `CardActionArea` — o
            // cartão inteiro vira botão real (Tab + Enter/Espaço), nunca uma
            // div com onClick (o antigo bloco Card+CardActionArea+CardContent).
            // ONDA1-NAV-UI: abrir uma trilha GRAVA no roadmapNav — a próxima
            // montagem (voltar de outra aba) restaura o detalhe.
            <InfoCard
              key={tr.slug}
              title={tr.title}
              subtitle={tI('roadmap.trackCount', { done: tr.doneCount, total: tr.lessonCount })}
              selectable
              onClick={() => openTrack(tr.slug)}
            />
          ))}
        </Stack>
      </CenteredColumn>
    );
  }

  return (
    <CenteredColumn width={LAYOUT.panelColumnPx}>
      {/* Spinner do DETALHE: só com trilha selecionada e ainda sem conteúdo
          (nem erro). O spinner da LISTA (sem seleção) usa o `loading` — ambos
          têm timeout: canal mudo vira loadError com retry, nunca spinner
          eterno. W3 (falsy-proof): só `null` significa "sem erro". */}
      {/* ONDA11-CADEADO — O ANÚNCIO. A informação do destravamento não pode
          viver só no movimento (quem usa leitor de tela, ou desligou o
          movimento, recebe a MESMA coisa). A região existe SEMPRE, montada
          antes do payload chegar: um `role="status"` que nasce já com texto
          costuma não ser anunciado — é a MUDANÇA de conteúdo, depois da carga
          assíncrona da trilha, que o leitor de tela lê. Texto INFORMATIVO
          ("Aula destravada: X"), nunca elogio (§8.2 do ux-redesign). */}
      <Typography
        role="status"
        aria-live="polite"
        variant="caption"
        sx={{ color: 'text.secondary', display: 'block', minHeight: 0 }}
      >
        {unlockedTitles.length > 0
          ? tI(
              unlockedTitles.length > 1
                ? 'roadmap.justUnlockedAnnounceMany'
                : 'roadmap.justUnlockedAnnounce',
              { titles: unlockedTitles.join(', ') },
            )
          : ''}
      </Typography>
      {/* Nome acessível nas duas barras de carga: sem ele o progressbar
          indeterminado anunciava só "progressbar" sem dizer o que carrega
          (SC 4.1.2) — `common.loading` é a chave existente adequada. */}
      {selected !== null && !track && loadError === null ? (
        <LinearProgress aria-label={t('translation:common.loading')} />
      ) : null}
      {selected === null && loading && loadError === null ? (
        <LinearProgress aria-label={t('translation:common.loading')} />
      ) : null}
      {/* ONDA9 (cache-reconcilia): pasta de trilhas vazia — estado legítimo e
          legível (info + como criar a primeira), NUNCA um alerta de erro. */}
      {noTracks && loadError === null && selected === null ? (
        <Box sx={{ mt: 1 }} data-testid="roadmap-no-tracks">
          <Alert severity="info">{t('translation:roadmap.noTracks')}</Alert>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1 }}>
            {t('translation:roadmap.noTracksHint')}
          </Typography>
        </Box>
      ) : null}
      {loadError !== null ? (
        <Box sx={{ mt: 1 }}>
          {/* §3 RetryAlert (LAYOUT-DRY-AUDIT): erro + "Tentar de novo" é o
              primitivo partilhado (o retry mantém o piso de alvo de toque).
              A ação EXTRA "Voltar" fica no chamador: o primitivo não tem slot
              de segunda ação (pendente registado no relatório desta onda). */}
          <RetryAlert
            severity="warning"
            message={loadError}
            onRetry={() => (selected !== null ? loadTrack(selected) : loadTracks())}
          />
          {/* ONDA1-NAV-UI: sem este VOLTAR, uma trilha que FALHOU ao carregar
              (timeout/canal mudo) prenderia o usuário no detalhe quebrado —
              o roadmapNav ainda aponta para ela e a próxima montagem a
              restauraria de novo. Voltar zera o store e libera a lista. */}
          {selected !== null ? (
            <Button
              variant="text"
              size="small"
              startIcon={<ArrowBackIcon fontSize="small" />}
              onClick={goBackToList}
              sx={{ ...touchTargetSx, mt: 1 }}
            >
              {t('translation:roadmap.backButton')}
            </Button>
          ) : null}
        </Box>
      ) : null}

      {track ? (
 <Stack spacing={2}>
          {/* Cabeçalho da trilha: VOLTAR (onda1-nav-ui) + título. O botão fica
              ACIMA do título, alinhado à esquerda (padrão lista→detalhe):
              leva de volta à LISTA de trilhas e zera o roadmapNav (a próxima
              montagem volta a abrir a lista, não este detalhe). */}
          <Box>
            <Button
              size="small"
              variant="text"
              startIcon={<ArrowBackIcon fontSize="small" />}
              onClick={goBackToList}
              aria-label={t('translation:roadmap.backButton')}
              // O visual de link (variant text, px curtinho) fica; o antigo
              // `minHeight: 0` encolhia o ALVO abaixo do piso de toque — a
              // caixa cresce até ao piso (`touchTargetSx`), o glifo igual.
              sx={{ mb: 0.5, px: 1, textTransform: 'none', ...touchTargetSx }}
            >
              {t('translation:roadmap.backButton')}
            </Button>
            <Typography variant="h4" component="h1" gutterBottom>
              {track.title}
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: LAYOUT.readingColumnPx }}>
              {track.description}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {tI('roadmap.trackCount', { done: track.doneCount, total: track.lessonCount })}
              {track.proficient ? ` · ${t('translation:roadmap.proficientBadge')}` : ''}
            </Typography>
          </Box>

          {/* Teste de proficiência: desafio que cobre TUDO. */}
          {track.proficiencyAvailable ? (
            <ProficiencyCard proficient={track.proficient} onOpen={openProficiency} />
          ) : null}

          {/* Módulos com as aulas (itens JÁ PRONTOS da trilha). */}
          {track.modules.map((mod, i) => (
            <ModuleCard
              key={mod.slug}
              mod={mod}
              onOpenLesson={openLesson}
              onOpenModuleChallenge={openModuleChallenge}
              justUnlocked={justUnlocked}
              // ONDA 15 — O EFEITO NÃO PODE NASCER DENTRO DE UMA GAVETA FECHADA.
              // Só o módulo 1 abria por padrão. Concluir a ÚLTIMA aula de um
              // módulo destrava a PRIMEIRA do seguinte — que estava dentro de
              // um `<Collapse in={false}>`. A revisão adversarial mediu, com
              // sonda no app: selo no DOM = 1, selo VISÍVEL = false, e o tile
              // da aula recém-aberta com `count: 0` (o `visibility:hidden` do
              // Collapse tira o nó até da árvore de acessibilidade). O
              // `role="status"` salvava a INFORMAÇÃO — "Aula destravada: X" —,
              // mas o aluno não via nada até descobrir sozinho o módulo
              // fechado. Um efeito de destravamento invisível é pior que
              // nenhum: ele promete e não entrega.
              // O módulo que CONTÉM uma aula recém-destravada abre junto. Não
              // é abrir tudo (isso viraria ruído a cada visita): é abrir
              // exatamente onde há algo novo para ver, pela mesma regra que
              // decide o selo.
              defaultOpen={i === 0 || mod.lessons.some((l) => justUnlocked.has(l.slug))}
              tI={tI}
            />
          ))}

          {/* A dica sequencial é TEXTO VISÍVEL — o Tooltip que a repetia
              literalmente era ruído para o leitor de tela (o mesmo conteúdo
              lido duas vezes: tooltip + nó de texto) e não acrescentava nada a
              quem vê. Fica só o texto. */}
          <Typography variant="caption" sx={{ color: 'text.secondary' }} align="center">
            {t('translation:roadmap.sequentialHint')}
          </Typography>
        </Stack>
      ) : null}
    </CenteredColumn>
  );
}

/** Container: só liga o hook de estado à view pura (export público do app). */
export function RoadmapView(props: ViewProps): ReactElement {
  return <RoadmapViewView {...useRoadmapView(props)} />;
}
