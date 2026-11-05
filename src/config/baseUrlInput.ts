/** Result of the optional base URL prompt shown after the API key. */
export type BaseUrlChoice = { action: 'keep' } | { action: 'clear' } | { action: 'set'; value: string };

/** undefined = the prompt was dismissed (Escape); empty = Enter to use the provider default. */
export function baseUrlChoice(input: string | undefined): BaseUrlChoice {
  if (input === undefined) return { action: 'keep' };
  const value = input.trim();
  return value ? { action: 'set', value: value.replace(/\/+$/, '') } : { action: 'clear' };
}

/** Returns an error message for the input box, or undefined when the value is acceptable. */
export function validateBaseUrlInput(input: string): string | undefined {
  const value = input.trim();
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return 'Use an http:// or https:// address.';
    return undefined;
  } catch { return 'Enter a full URL such as https://api.openai.com/v1, or leave it empty.'; }
}
