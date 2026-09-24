/**
 * tools/design/claims.ts — reescreve toda afirmação `[medido]` dos arquivos do
 * contrato com o valor CALCULADO.
 *
 * Número de contraste em comentário é afirmação, não lembrança. Em vez de o
 * autor recalcular à mão (e errar), este script lê cada afirmação na forma
 * fixa do contrato, mede com a MESMA função normativa que os testes usam e
 * devolve o comentário com o número de verdade.
 *
 * Uso:
 *   npx tsx tools/design/claims.ts          # mostra o que mudaria
 *   npx tsx tools/design/claims.ts --write  # grava de volta
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  contrastRatio,
  redFlashRatio,
  SURFACE_LIGHT,
  SURFACE_DARK,
  INK_LIGHT,
  INK_DARK,
  ACCENT_LIGHT,
  ACCENT_DARK,
  NONTEXT_LIGHT,
  NONTEXT_DARK,
  DIVIDER_LIGHT,
  DIVIDER_DARK,
  SCRIM,
} from '../../src/lib/designTokens';

const ROOT = join(__dirname, '..', '..');
const FILES = [join(ROOT, 'src', 'lib', 'designTokens.ts'), join(ROOT, 'src', 'theme.ts')];

const CLAIM_TOKENS: Record<string, unknown> = {
  SURFACE_LIGHT,
  SURFACE_DARK,
  INK_LIGHT,
  INK_DARK,
  ACCENT_LIGHT,
  ACCENT_DARK,
  NONTEXT_LIGHT,
  NONTEXT_DARK,
  DIVIDER_LIGHT,
  DIVIDER_DARK,
  SCRIM,
};

function resolve(ref: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(ref)) return ref.toLowerCase();
  const parts = ref.split('.');
  let node: unknown = CLAIM_TOKENS[parts[0]!];
  if (node === undefined) {
    throw new Error(`afirmação cita "${ref}", e "${parts[0]}" não é token de designTokens`);
  }
  for (const part of parts.slice(1)) {
    node = (node as Record<string, unknown>)[part];
    if (node === undefined) throw new Error(`afirmação cita "${ref}", quebra em "${part}"`);
  }
  return node as string;
}

function pt(value: number, places: number): string {
  return value.toFixed(places).replace('.', ',');
}

const CONTRAST_RE = /(\[medido\]\s+)(\S+)(\s+x\s+)(\S+)(\s+=\s+)(\d+,\d{2})(:1)/g;
const RED_FLASH_RE = /(\[medido\]\s+red-flash\()(\S+?)(\)\s*=\s*)(\d,\d{3})/g;

function main(): void {
  const write = process.argv.includes('--write');
  let total = 0;

  for (const file of FILES) {
    const original = readFileSync(file, 'utf8');
    let changed = 0;

    let out = original.replace(CONTRAST_RE, (_m, p1, a, p3, b, p5, _old, p7) => {
      const actual = contrastRatio(resolve(a), resolve(b));
      const next = pt(actual, 2);
      total += 1;
      if (next !== _old) changed += 1;
      return `${p1}${a}${p3}${b}${p5}${next}${p7}`;
    });

    out = out.replace(RED_FLASH_RE, (_m, p1, c, p3, _old) => {
      const actual = redFlashRatio(resolve(c));
      const next = pt(actual, 3);
      total += 1;
      if (next !== _old) changed += 1;
      return `${p1}${c}${p3}${next}`;
    });

    // GUARDA: o varredor de tests/theme.test.ts achata as linhas de comentário
    // antes de procurar, então uma afirmação QUEBRADA em duas linhas passa
    // despercebida por este corretor e é medida pelo teste — e reprova lá, com
    // um número que ninguém reescreveu. Toda afirmação tem que caber em UMA
    // linha, e aqui quem quebra a regra falha alto.
    const countClaims = (text: string): number => {
      const contrast = text.match(new RegExp(CONTRAST_RE.source, 'g'))?.length ?? 0;
      const flashes = text.match(new RegExp(RED_FLASH_RE.source, 'g'))?.length ?? 0;
      return contrast + flashes;
    };
    const lineClaims = countClaims(original);
    const flatClaims = countClaims(
      original.replace(/\n[ \t]*(?:\*\/|\*|\/\/)?[ \t]*/g, ' '),
    );
    if (flatClaims !== lineClaims) {
      throw new Error(
        `${file}: há afirmação [medido] quebrada em duas linhas ` +
          `(${lineClaims} em linha única, ${flatClaims} depois de achatar). ` +
          'Mova cada afirmação para UMA linha só.',
      );
    }

    const rel = file.replace(ROOT, '.');
    if (changed === 0) {
      console.log(`${rel}: nenhuma correção`);
    } else {
      console.log(`${rel}: ${changed} afirmação(ões) corrigida(s)`);
      if (write) writeFileSync(file, out);
    }
  }

  console.log(`${total} afirmação(ões) conferida(s) no total${write ? ' (gravadas)' : ' (dry-run)'}`);
}

main();
