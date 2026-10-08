import { cn } from "../../lib/cn";

const base =
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors " +
  "disabled:pointer-events-none disabled:opacity-50 " +
  "focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2 " +
  "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0";

const variants = {
  default: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs",
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  outline: "border bg-background hover:bg-accent hover:text-accent-foreground shadow-xs",
  ghost: "hover:bg-accent hover:text-accent-foreground",
  destructive:
    "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-xs",
  link: "text-primary underline-offset-4 hover:underline",
} as const;

const sizes = {
  default: "h-9 px-4 py-2",
  sm: "h-8 px-3 text-xs",
  lg: "h-11 px-6",
  icon: "size-9",
} as const;

export type ButtonVariant = keyof typeof variants;
export type ButtonSize = keyof typeof sizes;

/**
 * The button's classes, without the element.
 *
 * Use this to make a **link** look like a button:
 *
 * ```tsx
 * <Link to="/signup" className={buttonStyles({ size: "lg" })}>Get started</Link>
 * ```
 *
 * Never wrap a `<Button>` in a `<Link>` — nesting a button inside an anchor is
 * invalid HTML, gives keyboard users two tab stops for one control, and exposes
 * the control twice to screen readers.
 */
export function buttonStyles(
  options: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {},
): string {
  const { variant = "default", size = "default", className } = options;
  return cn(base, variants[variant], sizes[size], className);
}

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** React 19 passes `ref` as an ordinary prop — no forwardRef needed. */
  ref?: React.Ref<HTMLButtonElement>;
}

export function Button({
  className,
  variant = "default",
  size = "default",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      data-slot="button"
      type={type}
      className={buttonStyles({ variant, size, className })}
      {...props}
    />
  );
}

export { variants as buttonVariants, sizes as buttonSizes };
