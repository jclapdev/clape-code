import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

// Radix Select doesn't allow an empty string as an item value, so "" maps to this placeholder.
const NONE = "__none__";

/** shadcn Select for a flat list of options, where "" means "nothing chosen" (e.g. "All projects"). */
export function SimpleSelect({
  value,
  onChange,
  options,
  label,
  placeholder,
  className,
  disabled,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  label: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <Select value={value === "" ? NONE : value} onValueChange={(v) => onChange(v === NONE ? "" : v)} disabled={disabled}>
      <SelectTrigger id={id} aria-label={label} className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value || NONE} value={o.value === "" ? NONE : o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
