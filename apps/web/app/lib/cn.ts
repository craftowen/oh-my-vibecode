/**
 * Class name joiner. Deliberately dependency-free — the kit ships zero extra
 * runtime deps, so this replaces clsx/tailwind-merge.
 *
 * Because there is no tailwind-merge, `className` does NOT win over a
 * component's base classes by string order (Tailwind resolves conflicts by
 * stylesheet order, not attribute order). Use `variant`/`size` props to change
 * a component's look, and reserve `className` for layout concerns the component
 * does not set itself (w-full, mt-4, col-span-2, ...).
 */
export type ClassValue =
  | string
  | number
  | null
  | false
  | undefined
  | ClassValue[];

export function cn(...inputs: ClassValue[]): string {
  const out: string[] = [];
  for (const input of inputs) {
    if (!input && input !== 0) continue;
    if (Array.isArray(input)) {
      const nested = cn(...input);
      if (nested) out.push(nested);
    } else {
      out.push(String(input));
    }
  }
  return out.join(" ");
}
