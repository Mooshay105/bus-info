"use client";

import { useActionState, type ReactNode } from "react";
import type { FormState } from "./actions";

/** Props for a form that sends bus changes to a server action. */
interface BusFormProps {
  /** Server action bound to the target bus, if any. */
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  /** Label for the submit button. */
  submit: string;
  /** Message shown after a successful send. */
  sent: string;
  /** Message shown when the plate or fleet number is missing. */
  required?: string;
  /** The form inputs. */
  children: ReactNode;
}

export function BusForm({ action, submit, sent, required, children }: BusFormProps) {
  const [state, formAction, pending] = useActionState(action, { ok: false });
  if (state.ok) return <p className="rounded-md bg-surface p-4 text-lg">{sent}</p>;
  return (
    <form action={formAction} className="space-y-6">
      {children}
      {state.error === "required" && required && <p className="text-danger">{required}</p>}
      <button disabled={pending} className="rounded-md bg-ink px-4 py-2 text-street disabled:opacity-60">
        {submit}
      </button>
    </form>
  );
}
