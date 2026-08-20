import { cn } from "../../lib/cn";

type DivProps = React.HTMLAttributes<HTMLDivElement>;

export function Card({ className, ...props }: DivProps) {
  return (
    <div
      data-slot="card"
      className={cn(
        "flex flex-col gap-6 rounded-xl border bg-card py-6 text-card-foreground shadow-sm",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: DivProps) {
  return (
    <div
      data-slot="card-header"
      className={cn("flex flex-col gap-1.5 px-6", className)}
      {...props}
    />
  );
}

/** `as` exists so a card that IS the page (the signed-out auth pages) can make
 * its title a real <h1> — a styled <div> is invisible to heading navigation. */
export function CardTitle({
  className,
  as: Tag = "div",
  ...props
}: DivProps & { as?: "div" | "h1" | "h2" | "h3" }) {
  return (
    <Tag
      data-slot="card-title"
      className={cn("font-semibold leading-none", className)}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: DivProps) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: DivProps) {
  return <div data-slot="card-content" className={cn("px-6", className)} {...props} />;
}

export function CardFooter({ className, ...props }: DivProps) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-6", className)}
      {...props}
    />
  );
}
