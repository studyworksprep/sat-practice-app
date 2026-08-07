// Shared on/off switch.
//
// A plain <button role="switch">: keyboard- and screen-reader-native
// without any of the hidden-checkbox trickery, and it renders the
// same on the tutor's student-detail page and the student's Account
// page so one setting doesn't look like two different controls.
//
// The caller owns the state — pass `checked` and handle `onChange`.
// `label` is the accessible name; render your own visible copy next
// to the switch.

'use client';

import s from './Toggle.module.css';

export interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
  id?: string;
}

export function Toggle({ checked, onChange, label, disabled = false, id }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`${s.track} ${checked ? s.trackOn : ''}`}
    >
      <span className={s.knob} aria-hidden="true" />
    </button>
  );
}
