import { describe, expect, it } from 'vitest';
import { CHOOSE_MODEL_HINT, describeProviderError, extractErrorMessage, isModelError, suggestsModelChange } from './providerErrors';

describe('provider errors', () => {
  it('reads the message from each provider error shape', () => {
    expect(extractErrorMessage('{"error":{"message":"The model `x` does not exist","code":"model_not_found"}}')).toBe('The model `x` does not exist');
    expect(extractErrorMessage('{"type":"error","error":{"type":"not_found_error","message":"model: x"}}')).toBe('model: x');
    expect(extractErrorMessage('{"error":"model \'x\' not found, try pulling it first"}')).toBe("model 'x' not found, try pulling it first");
    expect(extractErrorMessage('<!doctype html><html>')).toMatch(/HTML page/);
    expect(extractErrorMessage('plain text')).toBe('plain text');
  });

  it('turns the reported "gtp 5 mini" failure into a clear message with a fix', () => {
    const body = '{"error":{"message":"invalid model ID: gtp 5 mini is not recognized","type":"invalid_request_error"}}';
    const message = describeProviderError('openai', 'gtp 5 mini', 400, body);
    expect(message).toContain('OpenAI request failed (400): invalid model ID: gtp 5 mini is not recognized');
    expect(message).toContain('Did you mean "gpt-5-mini"?');
    expect(message).toContain(CHOOSE_MODEL_HINT);
    expect(message).not.toContain('{"error"');
    expect(suggestsModelChange(message)).toBe(true);
  });

  it('does not suggest a model change for key or server errors', () => {
    const message = describeProviderError('anthropic', 'claude-sonnet-4-5', 401, '{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}');
    expect(message).toBe('Anthropic request failed (401): invalid x-api-key');
    expect(suggestsModelChange(message)).toBe(false);
    expect(isModelError(500, 'model overloaded')).toBe(false);
  });

  it('recognizes model errors from every provider', () => {
    expect(isModelError(404, 'The model `gpt-9` does not exist or you do not have access to it.')).toBe(true);
    expect(isModelError(404, 'model: claude-nope', '{"type":"error","error":{"type":"not_found_error","message":"model: claude-nope"}}')).toBe(true);
    expect(isModelError(404, 'models/gemini-x is not found for API version v1beta')).toBe(true);
    expect(isModelError(404, "model 'llama9' not found, try pulling it first")).toBe(true);
    expect(isModelError(400, 'gtp 5 mini is not a valid model ID')).toBe(true);
  });
});
