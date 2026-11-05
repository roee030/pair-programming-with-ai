import { describe, expect, it } from 'vitest';
import { baseUrlChoice, validateBaseUrlInput } from './baseUrlInput';

describe('base URL prompt', () => {
  it('keeps the current setting when the prompt is dismissed', () => { expect(baseUrlChoice(undefined)).toEqual({ action: 'keep' }); });
  it('clears the setting when Enter is pressed on an empty box', () => { expect(baseUrlChoice('   ')).toEqual({ action: 'clear' }); });
  it('saves a trimmed URL without trailing slashes', () => { expect(baseUrlChoice(' https://gw.example.com/v1/ ')).toEqual({ action: 'set', value: 'https://gw.example.com/v1' }); });
  it('accepts empty and http(s) URLs and rejects anything else', () => {
    expect(validateBaseUrlInput('')).toBeUndefined();
    expect(validateBaseUrlInput('https://api.openai.com/v1')).toBeUndefined();
    expect(validateBaseUrlInput('http://localhost:11434')).toBeUndefined();
    expect(validateBaseUrlInput('api.openai.com')).toMatch(/full URL/);
    expect(validateBaseUrlInput('ftp://example.com')).toMatch(/http/);
  });
});
