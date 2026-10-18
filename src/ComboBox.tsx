import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

type Option = { id: string; label: string };
export function ComboBox({
  label,
  value,
  options,
  selectedId,
  onChange,
  onSelect,
  placeholder,
  editable = false,
  disabled = false,
}: {
  label: string;
  value: string;
  options: Option[];
  selectedId?: string;
  onChange: (value: string) => void;
  onSelect: (id: string) => void;
  placeholder?: string;
  editable?: boolean;
  disabled?: boolean;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(-1);
  const normalize = (text: string) => text.toLowerCase().replace(/[\s_-]/g, "");
  const filtered = options.filter((option) =>
    normalize(option.label).includes(normalize(query)),
  );
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  useEffect(() => {
    if (open && active >= 0)
      document
        .getElementById(`${id}-${active}`)
        ?.scrollIntoView({ block: "nearest" });
  }, [active, id, open]);
  function choose(option: Option) {
    onSelect(option.id);
    setOpen(false);
    setActive(-1);
    setQuery("");
  }
  return (
    <div
      className="combobox"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <input
        ref={input}
        role="combobox"
        aria-label={label}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        aria-activedescendant={
          open && filtered[active] ? `${id}-${active}` : undefined
        }
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        maxLength={120}
        disabled={disabled}
        onFocus={() => {
          setQuery(!editable && !selectedId ? value : "");
          setActive(-1);
          setOpen(true);
        }}
        onChange={(event) => {
          onChange(event.target.value);
          setQuery(event.target.value);
          setActive(-1);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            setActive(
              event.key === "ArrowDown"
                ? Math.min(active + 1, filtered.length - 1)
                : active < 0
                  ? filtered.length - 1
                  : Math.max(0, active - 1),
            );
          } else if (event.key === "Enter" && open) {
            event.preventDefault();
            const option =
              filtered[active] ?? (!editable ? filtered[0] : undefined);
            if (option) choose(option);
            else setOpen(false);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      <button
        className="combobox-arrow"
        type="button"
        tabIndex={-1}
        aria-label={`${label} options`}
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          if (open) setOpen(false);
          else {
            input.current?.focus();
            setQuery(!editable && !selectedId ? value : "");
            setActive(-1);
            setOpen(true);
          }
        }}
      >
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open && !disabled && (
        <div
          className="combobox-list"
          id={`${id}-list`}
          role="listbox"
          aria-label={`${label} choices`}
        >
          {filtered.map((option, index) => (
            <div
              id={`${id}-${index}`}
              key={option.id}
              role="option"
              aria-selected={selectedId === option.id}
              className={active === index ? "combobox-active" : ""}
              onMouseDown={(event) => event.preventDefault()}
              onMouseMove={() => setActive(index)}
              onClick={() => choose(option)}
            >
              {option.label}
            </div>
          ))}
          {!filtered.length && <div className="combobox-empty">No matches</div>}
        </div>
      )}
    </div>
  );
}
