import { useId } from "react";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  name: string;
  error?: string;
}

/**
 * Label + input + inline error, wired for screen readers (`aria-invalid`,
 * `aria-describedby`). Use this for every form field so accessibility is not
 * something each new page has to remember.
 */
export function Field({ label, name, error, ...props }: FieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...props}
      />
      {error && (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
