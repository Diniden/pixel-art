import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { classNames } from "../../classNames";
import "./Dropdown.css";

/**
 * Dropdown — the shared select-like menu (task 19).
 *
 * BEM block: `dropdown` (local stylesheet; the design is the measured
 * `ViewModeDropdown` inlined at `FrameTimeline.tsx:11-76`, including its
 * click-outside effect — generalised over `{ value, label }` options).
 *
 * Accessibility the legacy inline version lacked: the trigger is a real
 * button with `aria-haspopup`/`aria-expanded`, the menu is a `listbox` of
 * `option`s with `aria-selected`, Escape closes and refocuses the trigger,
 * and ArrowUp/ArrowDown/Home/End move the active option with Enter/Space
 * committing.
 */

export interface DropdownOption<T extends string> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
}

export interface DropdownProps<T extends string> {
  options: ReadonlyArray<DropdownOption<T>>;
  value: T;
  onChange: (value: T) => void;
  /** Accessible name for the trigger/listbox. */
  label?: string;
  disabled?: boolean;
  /** Extra class on the trigger (e.g. a state modifier). */
  triggerClassName?: string;
  className?: string;
}

export function Dropdown<T extends string>({
  options,
  value,
  onChange,
  label,
  disabled = false,
  triggerClassName,
  className,
}: DropdownProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxId = useId();

  const selected = options.find((o) => o.value === value);

  // The measured click-outside effect, verbatim in behaviour.
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const open = useCallback(() => {
    setIsOpen(true);
    const idx = options.findIndex((o) => o.value === value);
    setActiveIndex(idx >= 0 ? idx : 0);
  }, [options, value]);

  const close = useCallback((refocus: boolean) => {
    setIsOpen(false);
    setActiveIndex(-1);
    if (refocus) triggerRef.current?.focus();
  }, []);

  const commit = useCallback(
    (option: DropdownOption<T>) => {
      if (option.disabled) return;
      onChange(option.value);
      close(true);
    },
    [onChange, close],
  );

  const moveActive = useCallback(
    (delta: number) => {
      setActiveIndex((prev) => {
        const n = options.length;
        if (n === 0) return -1;
        let next = prev;
        for (let i = 0; i < n; i++) {
          next = (next + delta + n) % n;
          if (!options[next]?.disabled) return next;
        }
        return prev;
      });
    },
    [options],
  );

  const handleTriggerKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
      case "ArrowUp":
        e.preventDefault();
        if (!isOpen) open();
        else moveActive(e.key === "ArrowDown" ? 1 : -1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (!isOpen) {
          open();
        } else if (activeIndex >= 0 && options[activeIndex]) {
          commit(options[activeIndex]);
        }
        break;
      case "Home":
        if (isOpen) {
          e.preventDefault();
          setActiveIndex(0);
        }
        break;
      case "End":
        if (isOpen) {
          e.preventDefault();
          setActiveIndex(options.length - 1);
        }
        break;
      case "Escape":
        if (isOpen) {
          e.preventDefault();
          e.stopPropagation();
          close(true);
        }
        break;
      case "Tab":
        if (isOpen) close(false);
        break;
    }
  };

  return (
    <div className={classNames("dropdown", className)} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={classNames("dropdown__trigger", triggerClassName)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        {...(label ? { "aria-label": label } : {})}
        onClick={() => (isOpen ? close(false) : open())}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="dropdown__value">{selected?.label ?? value}</span>
        <span className="dropdown__arrow" aria-hidden="true">
          {isOpen ? "▴" : "▾"}
        </span>
      </button>
      {isOpen && (
        <div
          id={listboxId}
          role="listbox"
          className="dropdown__menu"
          {...(label ? { "aria-label": label } : {})}
        >
          {options.map((option, index) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              disabled={option.disabled}
              className={classNames(
                "dropdown__item",
                option.value === value && "dropdown__item--selected",
                index === activeIndex && "dropdown__item--active",
              )}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => commit(option)}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default Dropdown;
