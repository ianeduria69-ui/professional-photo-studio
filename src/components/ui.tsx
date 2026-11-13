import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

export function Modal(props: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  const { title, onClose, children, footer, width = 520 } = props;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} style={{ width: `min(${width}px, 96vw)` }}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close" title="Close">
            <Icon name="close" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Button(props: {
  children?: ReactNode;
  onClick?: () => void;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
  title?: string;
  icon?: IconName;
  small?: boolean;
  active?: boolean;
}) {
  const cls = ['btn', props.primary ? 'primary' : '', props.danger ? 'danger' : '', props.small ? 'small' : '', props.active ? 'active' : '']
    .filter(Boolean)
    .join(' ');
  return (
    <button className={cls} onClick={props.onClick} disabled={props.disabled} title={props.title}>
      {props.icon && <Icon name={props.icon} size={15} />}
      {props.children}
    </button>
  );
}

export function Section(props: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="section">
      <header>
        <h3>{props.title}</h3>
        {props.right}
      </header>
      <div className="section-body">{props.children}</div>
    </section>
  );
}

export function Row(props: { label?: string; children: ReactNode; hint?: string }) {
  return (
    <div className="row" role="group" aria-label={props.label}>
      {props.label && <span className="row-label" aria-hidden="true">{props.label}</span>}
      <span className="row-control">{props.children}</span>
      {props.hint && <span className="row-hint">{props.hint}</span>}
    </div>
  );
}

/** Number box that applies its value when Enter is pressed or focus leaves (so typing "12" is not applied as "1"). */
export function NumberField(props: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  decimals?: number;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const { value, onChange, min, max, step = 1, decimals = 0, disabled, ariaLabel } = props;
  const fmt = (v: number) => (Number.isFinite(v) ? String(Number(v.toFixed(decimals))) : '');
  const [text, setText] = useState(fmt(value));
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setText(fmt(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, decimals]);
  const commit = () => {
    editing.current = false;
    let v = parseFloat(text);
    if (!Number.isFinite(v)) {
      setText(fmt(value));
      return;
    }
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    setText(fmt(v));
    if (v !== value) onChange(v);
  };
  return (
    <input
      className="num"
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      disabled={disabled}
      value={text}
      step={step}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => {
        editing.current = true;
        setText(e.currentTarget.value);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          commit();
          e.currentTarget.blur();
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          const d = (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1);
          let v = (parseFloat(text) || 0) + d;
          if (min !== undefined) v = Math.max(min, v);
          if (max !== undefined) v = Math.min(max, v);
          setText(fmt(v));
          editing.current = false;
          onChange(v);
        }
      }}
    />
  );
}

export function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onInput: (v: number) => void;
  onCommit?: () => void;
  format?: (v: number) => string;
  disabled?: boolean;
}) {
  const { label, value, min, max, step = 1, onInput, onCommit, format, disabled } = props;
  return (
    <label className="slider">
      <span className="slider-head">
        <span>{label}</span>
        <output>{format ? format(value) : value}</output>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => onInput(parseFloat(e.currentTarget.value))}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
        onBlur={onCommit}
        onDoubleClick={() => {
          onInput(Math.min(max, Math.max(min, 0)));
          onCommit?.();
        }}
      />
    </label>
  );
}

export function ColorField(props: {
  value: string;
  onChange: (hex: string) => void;
  onCommit?: () => void;
  ariaLabel?: string;
  allowNone?: boolean;
  isNone?: boolean;
  onNone?: () => void;
}) {
  const { value, onChange, onCommit, ariaLabel, allowNone, isNone, onNone } = props;
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const valid = (v: string) => /^#[0-9a-fA-F]{6}$/.test(v);
  return (
    <span className="colorfield">
      <input
        type="color"
        aria-label={ariaLabel ?? 'Colour'}
        value={valid(value) ? value : '#000000'}
        onChange={(e) => onChange(e.currentTarget.value)}
        onBlur={onCommit}
      />
      <input
        className="hex"
        type="text"
        aria-label={`${ariaLabel ?? 'Colour'} hex`}
        value={isNone ? 'none' : text}
        maxLength={7}
        onChange={(e) => {
          const v = e.currentTarget.value;
          setText(v);
          if (valid(v)) onChange(v.toLowerCase());
        }}
        onBlur={() => {
          if (!valid(text)) setText(value);
          onCommit?.();
        }}
      />
      {allowNone && (
        <button className={`mini ${isNone ? 'active' : ''}`} onClick={onNone} title="No colour">
          ∅
        </button>
      )}
    </span>
  );
}

export function Select<T extends string>(props: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  ariaLabel?: string;
  disabled?: boolean;
}) {
  return (
    <select
      value={props.value}
      aria-label={props.ariaLabel}
      disabled={props.disabled}
      onChange={(e) => props.onChange(e.currentTarget.value as T)}
    >
      {props.options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Check(props: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  const id = useId();
  return (
    <label className="check" htmlFor={id}>
      <input id={id} type="checkbox" checked={props.checked} disabled={props.disabled} onChange={(e) => props.onChange(e.currentTarget.checked)} />
      <span>{props.label}</span>
    </label>
  );
}

export function Segmented<T extends string>(props: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; title?: string }[];
}) {
  return (
    <span className="segmented" role="group">
      {props.options.map((o) => (
        <button key={o.value} className={o.value === props.value ? 'active' : ''} title={o.title} onClick={() => props.onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </span>
  );
}
