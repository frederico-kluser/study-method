/**
 * src/views/RoadmapView/ProficiencyCard.tsx — bloco do TESTE DE PROFICIÊNCIA
 * da trilha (desafio que cobre TUDO — destrava a trilha inteira).
 *
 * Bloco puro (só props) — documentado em `Componentes/Roadmap/ProficiencyCard`.
 * O botão diz "Fazer o teste"/"Refazer" conforme o aluno já é proficiente.
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import WorkspacePremiumIcon from '@mui/icons-material/WorkspacePremium';

export interface ProficiencyCardProps {
  /** O aluno já passou no teste (botão "Refazer"). */
  proficient: boolean;
  onOpen(): void;
}

export function ProficiencyCard({ proficient, onOpen }: ProficiencyCardProps): ReactElement {
  const { t } = useTranslation();
  return (
            <Card variant="outlined" sx={{ bgcolor: 'action.hover' }}>
              <CardContent
                sx={{
                  display: 'flex',
                  // Onda 1 (botões com ícone): `flexWrap: 'wrap'` — em largura
                  // apertada o botão "Fazer o teste" (nowrap) PULA para a
                  // linha própria em vez de esmagar/estourar o card. O texto
                  // com `minWidth: 0` quebra normalmente.
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: 2,
                  p: 1.5,
                  '&:last-child': { pb: 1.5 },
                }}
              >
                <WorkspacePremiumIcon color="primary" sx={{ fontSize: 40 }} />
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                    {t('translation:roadmap.proficiencyTitle')}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    {t('translation:roadmap.proficiencyDescription')}
                  </Typography>
                </Box>
                <Button
                  variant="contained"
                  onClick={onOpen}
                  startIcon={<WorkspacePremiumIcon />}
                  // Onda 1 (botões com ícone): `flexShrink: 0` + `flexWrap`
                  // no CardContent — o label inteiro ("Fazer o teste"/
                  // "Refazer") fica sempre visível, sem corte nem quebra.
                  sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}
                >
                  {proficient
                    ? t('translation:roadmap.proficiencyRetake')
                    : t('translation:roadmap.proficiencyStart')}
                </Button>
              </CardContent>
            </Card>
  );
}
