// Every choice shown in a form is an Option: the UI shows `label`, the server sends `value`
// to Twenty (CLAUDE.md rule 8). Values are Twenty API values, never UI labels.
export type Option<V extends string = string> = { readonly value: V; readonly label: string };

export const valuesOf = <V extends string>(options: readonly Option<V>[]) =>
  options.map((option) => option.value) as [V, ...V[]];

export function labelOf<V extends string>(options: readonly Option<V>[], value: V): string {
  const option = options.find((o) => o.value === value);
  if (!option) throw new Error(`Unknown option value: ${value}`);
  return option.label;
}
