import { cn } from "../../lib/cn";

/** Placeholder block for streaming <Suspense> fallbacks. Match the real
 * content's box so the shell does not jump when the data arrives. */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}
