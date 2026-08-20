import { cn } from "../../lib/cn";

const variants = {
  default: "bg-card text-card-foreground",
  destructive: "border-destructive/40 bg-destructive/10 text-destructive",
  success: "border-success/40 bg-success/10 text-foreground",
} as const;

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: keyof typeof variants;
}

/** Inline, persistent message. Form-level errors use `variant="destructive"`
 * and get role="alert" so assistive tech announces them on submit. */
export function Alert({ className, variant = "default", ...props }: AlertProps) {
  return (
    <div
      data-slot="alert"
      role={variant === "destructive" ? "alert" : "status"}
      className={cn(
        "rounded-md border px-3 py-2 text-sm break-words",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
