// tests/fixtures/typescript/camada-de-tipos.ts
//
// FONTE TypeScript de referência da suíte do adaptador. Não é executada: ela é
// PARSEADA. Cada linha existe para provar um ponto do §"Vocabulário de átomos
// desta trilha" de `docs/18-trilha-typescript.md` — a construção de tipo que
// ela introduz está nomeada ao lado.
//
// Este arquivo é lido como TEXTO pelo teste (fs.readFileSync) e nunca
// importado. Ele é, de propósito, TypeScript que o `tsc` reprovaria em
// `--strict` só nas linhas marcadas — o que se prova aqui é o PARSER e as
// chaves, não a semântica.

export interface Pessoa {          // node:InterfaceDeclaration
  nome: string;                    // node:PropertySignature + node:StringKeyword
  idade?: number;                  // form:PropertySignature[questionToken!=null]
}

export type Identificador = string | number; // node:TypeAliasDeclaration + node:UnionType

export enum Cor {                  // node:EnumDeclaration
  Vermelho,                        // node:EnumMember
  Azul,
}

export type ChaveDePessoa = keyof Pessoa;        // node:TypeOperator -> node:KeyOfType
export type ListaCongelada = readonly string[];  // node:TypeOperator -> node:ReadonlyArrayType

export function saudar(p: Pessoa, enfaticamente?: boolean): string {
  //                    ^ form:Parameter[type!=null]   ^ form:FunctionDeclaration[type!=null]
  const bruto = { nome: p.nome } as Pessoa;      // node:AsExpression
  const marca: boolean = enfaticamente ?? false; // form:VariableDeclaration[type!=null]
  return marca ? `OLA, ${bruto.nome}!` : `Ola, ${bruto.nome}.`;
}

export function primeiroNome(nomes: string[]): string {
  //                                ^ node:ArrayType
  return nomes[0] ?? '';
}

export function parcial(p: Partial<Pessoa>): Identificador {
  //                        ^ global:Partial (tipo utilitário de lib.es5.d.ts)
  //                                          ^ node:TypeReference
  return p.nome ?? 0;
}
