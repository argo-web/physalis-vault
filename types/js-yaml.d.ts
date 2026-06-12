// Déclaration minimale — @types/js-yaml absent. js-yaml v4 : `load` est le
// chargeur sûr (safeLoad déprécié). On n'utilise que load/dump.
declare module "js-yaml" {
  export function load(input: string, options?: unknown): unknown;
  export function dump(obj: unknown, options?: unknown): string;
}
