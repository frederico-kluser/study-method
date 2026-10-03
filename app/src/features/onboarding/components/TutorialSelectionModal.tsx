/**
 * src/features/onboarding/components/TutorialSelectionModal.tsx
 *
 * MODAL de seleção do tutorial (primeira execução) — pergunta "Quer um tour?".
 *
 * Oferece DOIS tours (nomes localizados em pt-BR: "Tour rápido" e "Tour
 * completo"; em en: "Quick tour"/"Full tour"):
 *  - Tour rápido — sempre disponível (não exige chaves). É o cartão DOMINANTE
 *    do diálogo (uma ação primária clara por diálogo, regra da casa): chip
 *    "Recomendado" persistente, borda 2px e fundo `action.selected`;
 *  - Tour completo — guia por todas as abas (chaves → aula → desafio),
 *    GATEADO por `hasKeys` (OpenRouter + Brave preenchidas). Sem chaves, fica
 *    DESABILITADO (mesma forma `outlined` — a geometria nunca muda) com a nota
 *    "Requer chaves de API" FORA do botão (irmão, nunca descendente — ACHADO-2:
 *    `<button disabled>` suprime clicks) e o CTA "Configurar chaves", que é um
 *    `<Button>` REAL (achado-8: `role="button"` fake em `<span>` é anti-padrão).
 *
 * CONTRATO DE DIÁLOGO (achado-1 CRÍTICO da auditoria 4-tour, espelhado do
 * OnboardingOverlay.tsx): `role="dialog" aria-modal="true"` só é verdade com
 * gestão de foco. Sem ela, o Tab passeia pelo app inteiro atrás do scrim e o
 * `aria-modal` mente (SC 2.4.3). A CASCA é o `ModalScrim` (auditoria §6 —
 * fixed + scrim + blur + centrado seguro + laço de foco; a cópia que vivia
 * aqui era uma das cinco) e é ele quem desenha o `role="dialog"`, o
 * `aria-modal`, o laço de Tab/Shift+Tab, o Escape e a devolução de foco ao
 * abridor. O contrato achado-1 liga-se pelas props `ariaLabelledBy` /
 * `ariaDescribedBy` do primitivo: o TÍTULO nomeia o diálogo e o SUBTÍTULO o
 * descreve (os ids continuam a ser os de baixo).
 *
 * VERDADE DA DISPENSA (achado-2): "Agora não" não promete devolver a oferta —
 * o latch `study-method-onboarding-offered-v1` é one-shot por decisão de
 * produto (onboardingStorage.service). Por isso a nota de rodapé junto da
 * dispensa diz onde reabrir o tour ("Ajuda e tutorial"): a promessa tem de ser
 * verdadeira no ponto de decisão.
 *
 * Texto via `t('translation:tutorial.*')`. MUI v9. Portal em `document.body`.
 */

import { useCallback, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import type { OnboardingTutorialId } from '../types/onboarding.types';
import { ModalScrim } from '../../../components/ui/ModalScrim';
import { LAYOUT, Z_INDEX } from '../../../lib/designTokens';
import { createOpenSettingsHandler } from './tutorialSelectionHelpers';

/* O LAÇO DE FOCO do painel `aria-modal` vive no `ModalScrim` (o adapter
 * `components/ui/useFocusTrap` sobre o `lib/focusTrap.ts` — auditoria de
 * layout §7): foco de entrada no painel, `Escape` dispensa, `Tab`/`Shift+Tab`
 * circulam DENTRO do painel e o foco volta ao abridor ao fechar. Sem o laço,
 * o `aria-modal="true"` mente (SC 2.4.3). Este ficheiro só decide QUEM
 * dispensa (`handleDismiss`, o caminho único abaixo).
 * `button:not([disabled])` é deliberado (a lista canónica está em
 * `lib/focusTrap.ts`): o cartão do Tour completo desabilitado fica FORA do
 * ciclo (controle desabilitado não recebe foco), mas o CTA "Configurar chaves"
 * — irmão, não descendente — continua alcançável. */

/** Nome acessível do diálogo = o título que ele renderiza. */
const TITLE_ID = 'tutorial-selection-title';
/** Descrição acessível do diálogo = o subtítulo que ele renderiza. */
const SUBTITLE_ID = 'tutorial-selection-subtitle';

/**
 * Piso de alvo de toque do design system (TOUCH_TARGET_PX = 44, regra da casa).
 * O "×" antigo era 28px e falhava o piso generoso do SC 2.5.8 do repo; o novo
 * `IconButton` é 44×44 (token local, como em FileExplorer/LessonSidebarHeader).
 */
const TOUCH_TARGET_PX = 44;

/**
 * CHROME do cartão (o slot `cardSx` do `ModalScrim` — a moldura medida deste
 * modal compõe por cima da superfície base do primitivo): o raio `2` (= 24px,
 * `theme.shape.borderRadius` × 2) e o padding `3` eram os do `Paper` antigo e
 * continuam a ser os deste diálogo. O que SAI é a sombra de elevação 8: a
 * REGRA DO MODAL do tema manda a elevação ser COR — o scrim separa o cartão
 * do fundo nos dois esquemas (`src/theme.ts`, MuiDialog: `boxShadow: 'none'`)
 * — e a superfície passa a seguir essa mesma regra (nível 1 no claro, nível 4
 * no escuro) em vez do `background.paper` do `Paper`.
 */
const TUTORIAL_CARD_SX = { borderRadius: 2, p: 3 } as const;

export interface TutorialSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTutorial: (tutorialId: OnboardingTutorialId) => void;
  /** Chaves OpenRouter + Brave preenchidas (gate do Tour completo). */
  hasKeys: boolean;
  /** Navega para as Configurações (CTA "Configurar chaves"). */
  onOpenSettings: () => void;
}

export function TutorialSelectionModal({
  isOpen,
  onClose,
  onSelectTutorial,
  hasKeys,
  onOpenSettings,
}: TutorialSelectionModalProps): ReactElement | null {
  const { t } = useTranslation();

  // CAMINHO ÚNICO de dispensa (achados 2 e 9): o "×", o "Agora não", o clique
  // no scrim e o Escape passam TODOS por aqui (o `onDismiss` do `ModalScrim`
  // cobre o scrim e o Escape). A dispensa é one-shot (latch de produto,
  // testado em onboardingStorage.test.ts) e a nota de rodapé é quem torna a
  // promessa verdadeira.
  const handleDismiss = useCallback(() => {
    onClose();
  }, [onClose]);

  // ─── CONTRATO DO DIÁLOGO `aria-modal` (achado-1, SC 2.4.3) ────────────────
  // Espelhado do OnboardingOverlay.tsx: ao abrir, o foco ENTRA no painel (o
  // teclado não fica no app atrás do scrim); Escape fecha; Tab circula DENTRO
  // do painel; ao fechar, o foco VOLTA para o elemento que abriu o modal
  // (`<body>` não conta como abridor — a falha documentada no exemplar). Tudo
  // isso é o `useFocusTrap` da base (auditoria §7), ligado pelo `ModalScrim`
  // logo abaixo: este ficheiro só decide QUEM dispensa (`handleDismiss`, o
  // caminho único acima) e para ONDE o foco volta (sem âncora própria — o
  // abridor é o único candidato deste diálogo).
  //
  // O `open` do `ModalScrim` é o `isOpen`: a saída ANIMA (o `AnimatePresence`
  // do primitivo envolve a condicional) em vez de sumir a seco.
  if (typeof document === 'undefined') {
    return null;
  }

  const goToSettings = createOpenSettingsHandler(onClose, onOpenSettings);

  return createPortal(
    <ModalScrim
      open={isOpen}
      ariaLabelledBy={TITLE_ID}
      ariaDescribedBy={SUBTITLE_ID}
      zIndex={Z_INDEX.tutorialModal}
      maxWidth={LAYOUT.modalCardPx}
      onDismiss={handleDismiss}
      cardSx={TUTORIAL_CARD_SX}
    >
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography variant="h5" component="h2" id={TITLE_ID}>
          {t('translation:tutorial.selection.title')}
        </Typography>
        {/* O "×" glifo virou IconButton com ícone Rounded: alvo de 44px
            (TOUCH_TARGET_PX, regra da casa — o de 28px falhava) e rótulo
            acessível PRÓPRIO do modal ("Fechar", não "Fechar tutorial": este
            diálogo é uma OFERTA de tour, não um tour em curso). */}
        <IconButton
          size="small"
          aria-label={t('translation:tutorial.selection.close')}
          onClick={handleDismiss}
          sx={{ minWidth: TOUCH_TARGET_PX, minHeight: TOUCH_TARGET_PX, color: 'text.secondary' }}
        >
          <CloseRounded fontSize="small" />
        </IconButton>
      </Stack>

      <Typography variant="body2" id={SUBTITLE_ID} sx={{ color: 'text.secondary', mb: 2 }}>
        {t('translation:tutorial.selection.subtitle')}
      </Typography>

      <Stack spacing={1.5}>
        {/* Tour rápido — o cartão DOMINANTE (uma ação primária clara por
            diálogo). O preenchimento `action.selected` (lavagem 8% no claro /
            16% no escuro sobre o Paper do modal) é superfície de NÍVEL 4, e a
            regra 3b manda: ali o texto é TINTA e o acento só entra como
            preenchimento/borda. Por isso o rótulo herda `text.primary` —
            mede 14,12:1 no claro (#ebebeb composto) e 9,50:1 no escuro (o
            composto coincide com SURFACE.level4) — e NÃO `accentText`, que
            como rótulo sobre a lavagem mede 4,67:1 no claro e 3,96:1 no
            escuro (reprova o piso AA de 4,5:1 no escuro). A borda 2px e o
            chip "Recomendado" (acento COMO PREENCHIMENTO, par `fill`/`onFill`
            do contrato: 4,70:1 no claro e 5,42:1 no escuro) fecham a
            hierarquia. Ambos os cards levam o MESMO endIcon de seta: o
            affordance de clique tem de ser igual entre irmãos (achado-4). */}
        <Button
          type="button"
          variant="outlined"
          fullWidth
          data-testid="tutorial-option-quick-start"
          endIcon={<ArrowForwardRounded fontSize="small" />}
          onClick={() => onSelectTutorial('quick-start')}
          sx={{
            textAlign: 'left',
            p: 2,
            alignItems: 'flex-start',
            justifyContent: 'flex-start',
            color: 'text.primary',
            borderWidth: 2,
            borderColor: 'primary.accentText',
            bgcolor: 'action.selected',
            // Hover mantém o preenchimento de estado (o feedback de hover já
            // vem do tema: scale 1.02 em movimento SPATIAL).
            '&:hover': { bgcolor: 'action.selected' },
          }}
        >
          <Stack sx={{ flex: 1, minWidth: 0, gap: 0.5, textAlign: 'left' }}>
            {/* flexWrap: em janelas estreitas o chip QUEBRA para a linha de
                baixo em vez de espremer o título (achado-13; quebra, nunca
                recorta). `component="span"` nos Typography dentro do
                `<button>`: `<h6>`/`<p>` dentro de botão é content model
                inválido e injeta headings fantasmas no outline do SR
                (achado-11). O nome acessível continua name-from-content. */}
            <Stack direction="row" sx={{ alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Typography variant="subtitle1" component="span" sx={{ fontWeight: 600 }}>
                {t('translation:tutorial.selection.quickStartTitle')}
              </Typography>
              <Box
                component="span"
                sx={{
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: 0.08,
                  px: 1,
                  py: 0.25,
                  borderRadius: 1,
                  // Acento COMO PREENCHIMENTO (regra 3b): o chip é fill, o
                  // rótulo é o `onFill` do par — medido no contrato
                  // (4,70:1 claro / 5,42:1 escuro). Sobre o cartão lavado,
                  // `action.selected` (o fundo do chip ANTIGO) seria invisível
                  // e `accentText` como texto reprovaria no escuro (3,96:1).
                  bgcolor: 'primary.fill',
                  color: 'primary.onFill',
                }}
              >
                {t('translation:tutorial.selection.badgeRecommended')}
              </Box>
            </Stack>
            <Typography variant="body2" component="span" sx={{ color: 'text.secondary' }}>
              {t('translation:tutorial.selection.quickStartDescription')}
            </Typography>
          </Stack>
        </Button>

        {/* Tour completo — gateado por hasKeys.
            Nota (ACHADO-2): o card é um `<Button disabled={!hasKeys}>`; a nota
            "Requer chaves de API" e o CTA "Configurar chaves" ficam COMO
            IRMÃOS ABAIXO do botão (não descendentes) para continuarem
            legíveis/clicáveis mesmo com o card desabilitado. A forma é
            `outlined` nos DOIS estados (achado-4: a geometria nunca vira
            `text` — o desligado é sinalizado pela calibração de disabled do
            tema, `text.secondary` medido 5,24:1 no pior par, não por sumir a
            moldura). Sem o spread `text.disabled` do título (achado-7): o
            tema ABANDONOU esse token por ilegível. */}
        <Box>
          <Button
            type="button"
            variant="outlined"
            fullWidth
            disabled={!hasKeys}
            data-testid="tutorial-option-full"
            endIcon={<ArrowForwardRounded fontSize="small" />}
            onClick={() => onSelectTutorial('first-workflow')}
            sx={{ textAlign: 'left', p: 2, alignItems: 'flex-start', justifyContent: 'flex-start' }}
          >
            <Stack sx={{ flex: 1, minWidth: 0, gap: 0.5, textAlign: 'left' }}>
              <Stack direction="row" sx={{ alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography variant="subtitle1" component="span" sx={{ fontWeight: 600 }}>
                  {t('translation:tutorial.selection.fullTutorialTitle')}
                </Typography>
              </Stack>
              <Typography variant="body2" component="span" sx={{ color: 'text.secondary' }}>
                {t('translation:tutorial.selection.fullTutorialDescription')}
              </Typography>
            </Stack>
          </Button>
          {!hasKeys ? (
            <>
              {/* Achado-6: o requisito era uma FRASE de 43 caracteres em
                  badge 11px ALL-CAPS — a string que mais precisa de ser lida
                  no estado bloqueado, no estilo menos legível. Agora é uma
                  LINHA curta, corpo normal, tinta secundária (mede 7,79:1 no
                  claro e 8,61:1 no escuro sobre o Paper), FORA do botão
                  desabilitado (controle desabilitado é dispensado da ordem de
                  tab do SR). O detalhe (OpenRouter + Brave) vive na descrição
                  do card. */}
              <Stack direction="row" spacing={1} sx={{ mt: 0.5, px: 2, alignItems: 'flex-start' }}>
                <InfoOutlined fontSize="small" sx={{ color: 'text.secondary', mt: 0.25 }} />
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  {t('translation:tutorial.selection.requiresKeys')}
                </Typography>
              </Stack>
              {/* Achado-8: `<span role="button">` era anti-padrão (e o Space
                  rolava a página: sem preventDefault no keydown). `<Button>`
                  real resolve semântica, estados e Space sem rolar. O tema
                  reaponta `text` para `accentText` (mede 5,57:1 no claro e
                  6,52:1 no escuro sobre o Paper — AA de folga). */}
              <Button
                size="small"
                variant="text"
                onClick={goToSettings}
                sx={{ ml: 1.5, mt: 0.5, px: 1 }}
              >
                {t('translation:tutorial.selection.openSettings')}
              </Button>
            </>
          ) : null}
        </Box>
      </Stack>

      <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end', mt: 2.5 }}>
        {/* A dispensa sai de `color="inherit"` (pesada demais para uma saída
            secundária, achado-9) para a tinta secundária. */}
        <Button
          size="small"
          variant="text"
          data-testid="tutorial-selection-dismiss"
          onClick={handleDismiss}
          sx={{ color: 'text.secondary' }}
        >
          {t('translation:tutorial.selection.dismiss')}
        </Button>
      </Stack>
      {/* Nota de VERDADE da dispensa (achado-2): "Agora não" não promete
          re-oferta (o latch é one-shot), então o rodapé diz onde reabrir o
          tour ("Ajuda e tutorial", no pé da barra lateral). Sem travessões. */}
      <Typography
        variant="caption"
        component="p"
        sx={{ color: 'text.secondary', textAlign: 'right', mt: 1 }}
      >
        {t('translation:tutorial.selection.reopenHint')}
      </Typography>
    </ModalScrim>,
    document.body,
  );
}
