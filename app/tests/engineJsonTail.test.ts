/**
 * tests/engineJsonTail.test.ts — `engine/runtime/jsonTail.ts` (a extração de
 * `separarJsonECauda`).
 *
 * ORIGEM: este teste morava em `tests/engineCurriculumGap.test.ts`, de quando
 * `separarJsonECauda` era definida em `modes/curriculumGap.ts`. Uma onda
 * anterior moveu a função (byte-idêntica) para `runtime/jsonTail.ts` — um
 * módulo-FOLHA que não importa de `phases/` nem de `modes/` — porque
 * `curriculumGap.ts` continuar como dono fechava um ciclo real no grafo de
 * módulos (`f7Theory → curriculumGap → f7Theory` e
 * `f8Challenges → curriculumGap → f7Theory → f8Challenges`, via
 * `blocosDeCodigoDaTeoria`, que `curriculumGap` importa de F7): `phases/`
 * dependendo de `modes/`, quando é `modes/` quem orquestra `phases/`. O teste
 * se muda com a função para o mesmo motivo: a asserção de comportamento mora
 * junto do módulo que a implementa, não junto de um dos três consumidores.
 *
 * `tests/engineModuleGraphAcyclic.test.ts` prova, por leitura estática do
 * grafo de imports (não só `tsc`, que tolera ciclo), que o ciclo continua
 * fechado.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { separarJsonECauda } from '../electron/main/engine/runtime/jsonTail';

describe('separarJsonECauda — separa o objeto JSON de topo da cauda de checksum', () => {
  it('separa o objeto do checksum de cauda, sem consertar JSON', () => {
    const partido = separarJsonECauda('{"a": "}{", "b": 1}\n=== CHECKSUM ===\n- x\n');
    assert.ok(partido);
    assert.deepEqual(JSON.parse(partido.json), { a: '}{', b: 1 });
    assert.match(partido.cauda, /CHECKSUM/);
  });

  it('sem objeto nenhum devolve null', () => {
    assert.equal(separarJsonECauda('sem objeto nenhum'), null);
  });

  it('objeto não fechado não é "consertado" — devolve null', () => {
    assert.equal(separarJsonECauda('{"a": 1'), null, 'objeto não fechado não é "consertado"');
  });

  it('cauda vazia quando o JSON ocupa a resposta inteira', () => {
    const partido = separarJsonECauda('{"a": 1}');
    assert.ok(partido);
    assert.equal(partido.cauda, '');
  });

  it('chaves e barras dentro de strings não confundem a contagem de profundidade', () => {
    const partido = separarJsonECauda('{"a": "} { \\" \\\\ ainda dentro da string"}\ncauda aqui');
    assert.ok(partido);
    assert.deepEqual(JSON.parse(partido.json), { a: '} { " \\ ainda dentro da string' });
    assert.equal(partido.cauda, '\ncauda aqui');
  });

  it('prosa antes do primeiro `{` não entra no JSON extraído', () => {
    const partido = separarJsonECauda('aqui vai o objeto:\n{"x": true}\ncauda');
    assert.ok(partido);
    assert.deepEqual(JSON.parse(partido.json), { x: true });
    assert.equal(partido.cauda, '\ncauda');
  });
});
