/**
 * tests/piProviderMapper.test.ts — funções puras do mapeamento/objeto Model.
 *
 * O bloco "thinkingLevel → reasoning.effort" é o coração desta suíte: ele prova
 * que NENHUM dos 7 valores de PiThinkingLevel produz um effort que o modelo
 * rejeitaria (um effort inválido volta HTTP 400 e, historicamente neste
 * repositório, um 400 caiu no caminho de SUCESSO do cliente).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PiThinkingLevel } from '@shared/ipc-contract';
import {
  OPENROUTER_ATTRIBUTION_HEADERS,
  OPENROUTER_EFFORTS,
  OPENROUTER_MAX_EFFORT,
  OPENROUTER_MODEL,
  OPENROUTER_PROVIDER_POLICY,
  type OpenRouterEffort,
} from '@shared/llm/constants';
import {
  buildOpenRouterModelObject,
  buildPiModelConfig,
  isSupportedOpenRouterEffort,
  mapThinkingLevelToOpenRouterEffort,
  mapThinkingLevelToPiSdk,
  mapWorkflowModelToPi,
  mapWorkflowProviderToPi,
  OPENROUTER_REASONING_EFFORT_MAP,
  PI_SDK_THINKING_LEVELS,
  piModelSupportsTemperature,
  type PiSdkThinkingLevel,
} from '../electron/main/services/piProviderMapper';

test('mapWorkflowProviderToPi: openrouter → openrouter; outros passam direto', () => {
  assert.equal(mapWorkflowProviderToPi('openrouter'), 'openrouter');
  assert.equal(mapWorkflowProviderToPi('anthropic'), 'anthropic');
  assert.equal(mapWorkflowProviderToPi('weird-provider'), 'weird-provider');
});

test('mapWorkflowModelToPi: passthrough', () => {
  assert.equal(mapWorkflowModelToPi('openrouter', OPENROUTER_MODEL.id), OPENROUTER_MODEL.id);
  assert.equal(mapWorkflowModelToPi('openai', 'gpt-x'), 'gpt-x');
});

test('buildPiModelConfig: mapeia provider + model + thinkingLevel off → sem thinkingLevel', () => {
  const cfg = buildPiModelConfig('openrouter', OPENROUTER_MODEL.id, 'off');
  assert.deepEqual(cfg, {
    provider: 'openrouter',
    model: OPENROUTER_MODEL.id,
    thinkingLevel: undefined,
  });
});

test('buildPiModelConfig: thinkingLevel != off é propagado', () => {
  const cfg = buildPiModelConfig('openrouter', OPENROUTER_MODEL.id, 'max');
  assert.equal(cfg.thinkingLevel, 'max');
});

test('buildPiModelConfig: default thinkingLevel é off (sem campo)', () => {
  const cfg = buildPiModelConfig('openrouter', OPENROUTER_MODEL.id);
  assert.equal('thinkingLevel' in cfg && cfg.thinkingLevel === undefined, true);
});

test('piModelSupportsTemperature: openrouter (não-OpenAI-native) aceita temperatura', () => {
  assert.equal(piModelSupportsTemperature({ provider: 'openrouter', reasoning: true }), true);
  assert.equal(piModelSupportsTemperature(null), true);
  assert.equal(piModelSupportsTemperature(undefined), true);
});

test('piModelSupportsTemperature: OpenAI-native reasoning NÃO aceita temperatura', () => {
  assert.equal(piModelSupportsTemperature({ provider: 'openai', reasoning: true }), false);
  assert.equal(piModelSupportsTemperature({ provider: 'openai-codex', reasoning: true }), false);
  assert.equal(piModelSupportsTemperature({ provider: 'azure-openai-responses', reasoning: true }), false);
});

test('piModelSupportsTemperature: OpenAI-native SEM reasoning aceita temperatura', () => {
  // A regra só omite a temperatura quando o model é OpenAI-native E reasoning.
  assert.equal(piModelSupportsTemperature({ provider: 'openai', reasoning: false }), true);
  assert.equal(piModelSupportsTemperature({ provider: 'openai-codex', reasoning: false }), true);
  assert.equal(piModelSupportsTemperature({ provider: 'openai', reasoning: undefined }), true);
  assert.equal(piModelSupportsTemperature({ provider: 'openai' }), true);
  // provider não-estringa (valor inesperado) → trata como não-OpenAI-native.
  assert.equal(piModelSupportsTemperature({ provider: 123, reasoning: true } as never), true);
});

test('buildOpenRouterModelObject: campos exatos do contrato', () => {
  const model = buildOpenRouterModelObject('sk-or-v1-abc');
  assert.deepEqual(model, {
    id: 'z-ai/glm-5.3-flash',
    name: 'GLM 5.3 Flash',
    api: 'openai-completions',
    provider: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    reasoning: true,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 1_048_576,
    maxTokens: 131_072,
    headers: {
      Authorization: 'Bearer sk-or-v1-abc',
      'HTTP-Referer': 'https://github.com/ondokai/study-method',
      'X-Title': 'study-method',
    },
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: true,
      maxTokensField: 'max_tokens',
      reasoningEffortMap: { minimal: 'low', low: 'low', medium: 'high', high: 'high', xhigh: 'max' },
      openRouterRouting: { require_parameters: true },
    },
  });
});

test('buildOpenRouterModelObject: os literais VÊM do contrato (não são cópias)', () => {
  const model = buildOpenRouterModelObject('k');
  assert.equal(model.id, OPENROUTER_MODEL.id);
  assert.equal(model.name, OPENROUTER_MODEL.name);
  assert.equal(model.baseUrl, OPENROUTER_MODEL.baseUrl);
  assert.equal(model.contextWindow, OPENROUTER_MODEL.contextWindow);
  assert.equal(model.maxTokens, OPENROUTER_MODEL.maxTokens);
  for (const [header, value] of Object.entries(OPENROUTER_ATTRIBUTION_HEADERS)) {
    assert.equal(model.headers?.[header], value);
  }
  // require_parameters é load-bearing: sem ele o OpenRouter pode rotear para um
  // upstream que IGNORA `reasoning` e devolver 200 SEM raciocínio.
  assert.deepEqual(model.compat?.openRouterRouting, { ...OPENROUTER_PROVIDER_POLICY });
});

test('buildOpenRouterModelObject: a chave só aparece no Authorization', () => {
  const model = buildOpenRouterModelObject('sk-or-v1-secret');
  assert.equal(model.headers?.Authorization, 'Bearer sk-or-v1-secret');
  const withoutAuth = { ...model, headers: { ...model.headers, Authorization: '' } };
  assert.equal(JSON.stringify(withoutAuth).includes('sk-or-v1-secret'), false);
});

/* ------------------------------------------------------------------------- *
 * thinkingLevel → reasoning.effort                                          *
 * ------------------------------------------------------------------------- */

/**
 * A tabela COMPLETA da decisão. Sendo um `Record<PiThinkingLevel, …>`, esquecer
 * um valor do enum NÃO COMPILA — a exaustividade é garantida pelo tipo, não
 * pela disciplina de quem edita.
 */
const EXPECTED_EFFORT: Record<PiThinkingLevel, OpenRouterEffort | undefined> = {
  off: undefined,
  minimal: 'low',
  low: 'low',
  medium: 'high',
  high: 'high',
  xhigh: 'max',
  max: 'max',
};

const ALL_THINKING_LEVELS = Object.keys(EXPECTED_EFFORT) as PiThinkingLevel[];

for (const level of ALL_THINKING_LEVELS) {
  test(`thinkingLevel '${level}': o effort resultante é aceito pelo modelo`, () => {
    const effort = mapThinkingLevelToOpenRouterEffort(level);
    assert.equal(effort, EXPECTED_EFFORT[level], `mapeamento de '${level}' mudou`);
    if (level === 'off') {
      // 'off' é o ÚNICO caso sem effort: o chamador não seta thinkingLevel.
      assert.equal(effort, undefined);
      assert.equal(mapThinkingLevelToPiSdk(level), undefined);
      return;
    }
    assert.ok(
      isSupportedOpenRouterEffort(effort),
      `'${level}' → '${String(effort)}' NÃO está em ${OPENROUTER_EFFORTS.join('|')} — a API devolveria 400`,
    );
  });
}

test('thinkingLevel: os 7 valores do enum estão cobertos (nenhum cai em undefined por engano)', () => {
  assert.equal(ALL_THINKING_LEVELS.length, 7);
  const withEffort = ALL_THINKING_LEVELS.filter(
    (l) => mapThinkingLevelToOpenRouterEffort(l) !== undefined,
  );
  assert.equal(withEffort.length, 6, 'só o "off" pode ficar sem effort');
});

test('thinkingLevel: undefined (campo ausente) se comporta como "off"', () => {
  assert.equal(mapThinkingLevelToOpenRouterEffort(undefined), undefined);
  assert.equal(mapThinkingLevelToPiSdk(undefined), undefined);
});

test("mapThinkingLevelToPiSdk: 'max' NUNCA vaza cru para o SDK", () => {
  // O SDK não conhece 'max' e o _clampThinkingLevel derruba um nível
  // desconhecido para 'off' — o raciocínio sumiria em silêncio.
  const sdkLevel = mapThinkingLevelToPiSdk('max');
  assert.equal(sdkLevel, 'xhigh');
  assert.ok(PI_SDK_THINKING_LEVELS.includes(sdkLevel!));
  // E 'xhigh' é o único nível do SDK que vira o effort MÁXIMO.
  assert.equal(OPENROUTER_REASONING_EFFORT_MAP[sdkLevel!], OPENROUTER_MAX_EFFORT);
});

test('mapThinkingLevelToPiSdk: todo resultado é um nível que o SDK conhece', () => {
  for (const level of ALL_THINKING_LEVELS) {
    const sdkLevel = mapThinkingLevelToPiSdk(level);
    if (sdkLevel === undefined) {
      assert.equal(level, 'off');
      continue;
    }
    assert.ok(
      PI_SDK_THINKING_LEVELS.includes(sdkLevel),
      `'${level}' → '${sdkLevel}' não é um ThinkingLevel do pi-ai`,
    );
  }
});

test('OPENROUTER_REASONING_EFFORT_MAP é TOTAL sobre os níveis do SDK', () => {
  // O SDK faz `reasoningEffortMap[level] ?? level`. Se o mapa tivesse um buraco,
  // o `?? level` mandaria o nível CRU ('medium', 'minimal', 'xhigh') na API —
  // que este modelo rejeita.
  for (const sdkLevel of PI_SDK_THINKING_LEVELS) {
    const effort = OPENROUTER_REASONING_EFFORT_MAP[sdkLevel];
    assert.ok(
      isSupportedOpenRouterEffort(effort),
      `nível do SDK '${sdkLevel}' sem effort válido (=> iria cru para a API)`,
    );
  }
  assert.equal(Object.keys(OPENROUTER_REASONING_EFFORT_MAP).length, PI_SDK_THINKING_LEVELS.length);
});

test('o effort declarado é EXATAMENTE o que o SDK calcularia', () => {
  // Reproduz a conta do pi-ai (openai-completions):
  //   effort = reasoningEffortMap[thinkingLevel] ?? thinkingLevel
  // aplicada ao Model object que este módulo monta.
  const compatMap = buildOpenRouterModelObject('k').compat?.reasoningEffortMap ?? {};
  for (const level of ALL_THINKING_LEVELS) {
    const sdkLevel = mapThinkingLevelToPiSdk(level);
    if (sdkLevel === undefined) continue;
    const onTheWire = compatMap[sdkLevel] ?? sdkLevel;
    assert.equal(
      onTheWire,
      mapThinkingLevelToOpenRouterEffort(level),
      `'${level}': o que sai no fio difere do mapeamento declarado`,
    );
    assert.ok(isSupportedOpenRouterEffort(onTheWire));
  }
});

test('isSupportedOpenRouterEffort: rejeita os efforts do enum GLOBAL que este modelo não aceita', () => {
  for (const accepted of OPENROUTER_EFFORTS) {
    assert.equal(isSupportedOpenRouterEffort(accepted), true);
  }
  for (const rejected of ['xhigh', 'medium', 'minimal', 'none', '', undefined, null, 0]) {
    assert.equal(isSupportedOpenRouterEffort(rejected), false, `'${String(rejected)}' deveria ser rejeitado`);
  }
});

test('PI_SDK_THINKING_LEVELS: espelha o ThinkingLevel do pi-ai v0.64.0', () => {
  const expected: PiSdkThinkingLevel[] = ['minimal', 'low', 'medium', 'high', 'xhigh'];
  assert.deepEqual([...PI_SDK_THINKING_LEVELS], expected);
});
