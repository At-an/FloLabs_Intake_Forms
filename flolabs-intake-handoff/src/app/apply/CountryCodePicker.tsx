'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { searchCountries, type SearchableCountry } from '@/shared/forms/country-search';
import styles from '../_components/form.module.css';

// Phone country code with search (WAI-ARIA combobox + listbox): type a country name, a calling
// code (+237) or an ISO code, then pick with the mouse or the arrow keys and Enter.

const display = (c: SearchableCountry) => `${c.label} (${c.callingCode})`;

export function CountryCodePicker({
  id,
  countries,
  value,
  invalid,
  describedBy,
  onChange,
  onBlur,
}: {
  id: string;
  countries: readonly SearchableCountry[];
  value: string;
  invalid: boolean;
  describedBy?: string;
  onChange: (value: string) => void;
  onBlur: () => void;
}) {
  const listId = `${id}-list`;
  const selected = countries.find((c) => c.value === value);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => searchCountries(countries, query), [countries, query]);

  useEffect(() => {
    if (open) listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  // After a pick (list closed, focus still here), select the shown text so typing starts a new search.
  useEffect(() => {
    if (!open && document.activeElement === inputRef.current) inputRef.current?.select();
  }, [open, value]);

  function choose(country: SearchableCountry | undefined) {
    if (country) onChange(country.value);
    setOpen(false);
    setQuery('');
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault();
        if (!open) return setOpen(true);
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setActive((i) => Math.min(Math.max(i + step, 0), Math.max(matches.length - 1, 0)));
        return;
      }
      case 'Enter':
        if (open) {
          event.preventDefault(); // pick, never submit the form
          choose(matches[active]);
        }
        return;
      case 'Escape':
        if (open) {
          event.preventDefault();
          setOpen(false);
          setQuery('');
        }
        return;
    }
  }

  return (
    <div className={styles.combo}>
      <input
        ref={inputRef}
        id={id}
        name="phoneCountry"
        type="text"
        role="combobox"
        autoComplete="off"
        spellCheck={false}
        required
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && matches[active] ? `${listId}-${matches[active].value}` : undefined}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        placeholder={selected ? display(selected) : 'Search country or code'}
        value={open ? query : selected ? display(selected) : ''}
        onFocus={() => {
          setOpen(true);
          setActive(0);
        }}
        onClick={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => {
          // Typed text that matches exactly one country picks it, e.g. "+237" or "cameroon".
          if (open && query.trim() && matches.length === 1) choose(matches[0]);
          else {
            setOpen(false);
            setQuery('');
          }
          onBlur();
        }}
        className={styles.input}
      />
      {open && (
        <ul id={listId} ref={listRef} role="listbox" aria-label="Countries" className={styles.comboList}>
          {matches.length === 0 ? (
            <li className={styles.comboEmpty} role="presentation">
              No country matches “{query}”
            </li>
          ) : (
            matches.map((c, index) => (
              <li
                key={c.value}
                id={`${listId}-${c.value}`}
                data-index={index}
                role="option"
                aria-selected={c.value === value}
                className={`${styles.comboOption} ${index === active ? styles.comboActive : ''}`}
                // Keep focus in the input so the click is not lost to its blur.
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(c)}
              >
                <span>{c.label}</span>
                <span className={styles.comboCode}>{c.callingCode}</span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
