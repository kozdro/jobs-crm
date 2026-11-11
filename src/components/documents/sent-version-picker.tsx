"use client";

export type SentVersionOption = {
  id: string;
  documentName: string;
  number: number;
  label: string | null;
};

/** A selection is not a record of sending until the enclosing application command succeeds. */
export function SentVersionPicker({
  options,
  selected,
  onChange,
  disabled = false,
}: {
  options: SentVersionOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="space-y-2">
      <legend className="text-sm font-medium">
        Wersje CV rzeczywiście wysłane z tą aplikacją (opcjonalnie)
      </legend>
      <p className="text-sm text-muted-foreground">
        Wybierz wszystkie faktycznie wysłane wersje. Samo powiązanie dokumentu
        ze sprawą nie oznacza wysłania.
      </p>
      {options.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Brak dostępnych wersji CV. Możesz uzupełnić je później.
        </p>
      ) : (
        options.map((option) => (
          <label
            key={option.id}
            className="flex min-h-11 items-start gap-3 text-sm"
          >
            <input
              type="checkbox"
              className="mt-1 size-4 shrink-0 accent-primary"
              checked={selected.includes(option.id)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...new Set([...selected, option.id])]
                    : selected.filter((id) => id !== option.id),
                )
              }
            />
            <span className="[overflow-wrap:anywhere]">
              {option.documentName} — wersja {option.number}
              {option.label ? ` · ${option.label}` : ""}
            </span>
          </label>
        ))
      )}
    </fieldset>
  );
}
