/**
 * App-wide dialogs built on React Native Reusables' AlertDialog (shadcn).
 * - `await confirm({...})` → true / false        (questions, destructive actions)
 * - `notify(title, message)`                     (a notice with one OK button)
 * - `await prompt({...})` → the typed text / null (one input, e.g. a new credit limit)
 * <DialogHost /> (mounted once in app/_layout.tsx) renders them through the PortalHost.
 * Replaces React Native's Alert.alert.
 */
import { useEffect, useRef, useState } from 'react';
import { KeyboardTypeOptions, View } from 'react-native';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button as RnrButton } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { ButtonLabel, ErrorText, Field } from './components';

export type DialogOptions = {
  title: string;
  message?: string;
  /** Label of the main button, e.g. "Delete". Default "OK". */
  confirmLabel?: string;
  /** Label of the cancel button; null hides it (a notice with just OK). Default "Cancel". */
  cancelLabel?: string | null;
  /** Red main button, for deleting or removing things. */
  destructive?: boolean;
};

export type PromptOptions = DialogOptions & {
  /** Label above the input, e.g. "Credit limit (₱)". */
  label: string;
  initial?: string;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  /** Hide what's typed (passwords). */
  secure?: boolean;
  /** Return an error message to keep the dialog open, or null when the value is fine. */
  validate?: (value: string) => string | null;
};

type Request =
  | { kind: 'confirm'; options: DialogOptions; settle: (confirmed: boolean) => void }
  | { kind: 'prompt'; options: PromptOptions; settle: (value: string | null) => void };

let present: ((r: Request) => void) | null = null;

/** Shows a dialog; resolves true if the main button was pressed, false for Cancel or back. */
export function confirm(options: DialogOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (!present) return resolve(false); // no host mounted (shouldn't happen)
    present({ kind: 'confirm', options, settle: resolve });
  });
}

/** A notice with a single OK button. */
export async function notify(title: string, message?: string): Promise<void> {
  await confirm({ title, message, cancelLabel: null });
}

/** Asks for one value; resolves the text the user saved, or null if they cancelled. */
export function prompt(options: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    if (!present) return resolve(null);
    present({ kind: 'prompt', options, settle: resolve });
  });
}

export function DialogHost() {
  const [request, setRequest] = useState<Request | null>(null);
  const [value, setValue] = useState('');
  const [inputError, setInputError] = useState<string>();
  const current = useRef<Request | null>(null);
  const confirmed = useRef(false);

  /** Closes the dialog and answers the caller (once). */
  function finish(answer: boolean | string | null) {
    const r = current.current;
    current.current = null;
    setRequest(null);
    if (!r) return;
    if (r.kind === 'confirm') r.settle(answer === true);
    else r.settle(typeof answer === 'string' ? answer : null);
  }

  useEffect(() => {
    present = (r) => {
      finish(r.kind === 'confirm' ? false : null); // a newer dialog replaces an open one
      current.current = r;
      confirmed.current = false;
      setValue(r.kind === 'prompt' ? (r.options.initial ?? '') : '');
      setInputError(undefined);
      setRequest(r);
    };
    return () => {
      present = null;
    };
    // finish only touches refs and state setters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cancel / back / the confirm button all close through here. The primitive closes the
  // dialog *before* calling a button's onPress, so settle a moment later, once the confirm
  // button has had the chance to mark it confirmed.
  function onOpenChange(open: boolean) {
    if (open) return;
    queueMicrotask(() => finish(current.current?.kind === 'confirm' ? confirmed.current : null));
  }

  function submitPrompt() {
    const r = current.current;
    if (r?.kind !== 'prompt') return;
    const problem = r.options.validate?.(value) ?? null;
    if (problem) return setInputError(problem); // stay open and say what to fix
    finish(value);
  }

  const o = request?.options;
  const cancelLabel = o?.cancelLabel === undefined ? 'Cancel' : o.cancelLabel;
  const mainButton = cn('h-12 rounded-lg py-0', o?.destructive && 'bg-destructive');
  return (
    <AlertDialog open={!!request} onOpenChange={onOpenChange}>
      {request && o && (
        <AlertDialogContent className="gap-5 rounded-3xl bg-card p-6">
          <AlertDialogHeader className="items-start gap-2">
            <AlertDialogTitle className="text-left text-xl font-bold tracking-tight">{o.title}</AlertDialogTitle>
            {o.message ? (
              <AlertDialogDescription className="text-left text-base leading-6">{o.message}</AlertDialogDescription>
            ) : null}
          </AlertDialogHeader>

          {request.kind === 'prompt' && (
            <View className="gap-3">
              <Field
                label={request.options.label}
                value={value}
                onChangeText={(v) => {
                  setValue(v);
                  setInputError(undefined);
                }}
                placeholder={request.options.placeholder}
                keyboardType={request.options.keyboardType}
                secureTextEntry={request.options.secure}
                autoCapitalize={request.options.secure ? 'none' : undefined}
                autoFocus
                selectTextOnFocus
                returnKeyType="done"
                onSubmitEditing={submitPrompt}
              />
              <ErrorText>{inputError}</ErrorText>
            </View>
          )}

          <AlertDialogFooter className="flex-row gap-3">
            {cancelLabel !== null && (
              <View className="flex-1">
                <AlertDialogCancel className="h-12 rounded-lg py-0">
                  <ButtonLabel>{cancelLabel}</ButtonLabel>
                </AlertDialogCancel>
              </View>
            )}
            <View className="flex-1">
              {request.kind === 'prompt' ? (
                // Not an AlertDialogAction: that would close the dialog even when the value is invalid.
                <RnrButton onPress={submitPrompt} className={mainButton}>
                  <ButtonLabel className="text-primary-foreground">{o.confirmLabel ?? 'Save'}</ButtonLabel>
                </RnrButton>
              ) : (
                <AlertDialogAction
                  onPress={() => {
                    confirmed.current = true;
                  }}
                  className={mainButton}
                >
                  <ButtonLabel className="text-primary-foreground">{o.confirmLabel ?? 'OK'}</ButtonLabel>
                </AlertDialogAction>
              )}
            </View>
          </AlertDialogFooter>
        </AlertDialogContent>
      )}
    </AlertDialog>
  );
}
