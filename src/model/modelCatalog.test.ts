import { describe, expect, it } from 'vitest';
import { closestModel, defaultModel, effectiveModel, mergeModelOptions, suggestedModels, validateModelInput } from './modelCatalog';
import { providerDefaults, type Provider } from './providerClients';

const providers: Provider[] = ['openai', 'anthropic', 'gemini', 'openrouter', 'ollama'];

describe('model catalog', () => {
  it('offers several models per provider with the default first', () => {
    for (const provider of providers) {
      const models = suggestedModels(provider);
      expect(models.length).toBeGreaterThanOrEqual(3);
      expect(models[0].id).toBe(defaultModel(provider));
      expect(providerDefaults(provider).model).toBe(defaultModel(provider));
      expect(new Set(models.map(model => model.id)).size).toBe(models.length);
      for (const model of models) expect(model.id).not.toMatch(/\s/);
    }
  });

  it('keeps the existing defaults so current users see no change', () => {
    expect(defaultModel('openai')).toBe('gpt-5-mini');
    expect(defaultModel('anthropic')).toBe('claude-sonnet-4-5');
    expect(defaultModel('openrouter')).toBe('openai/gpt-5-mini');
    expect(defaultModel('ollama')).toBe('qwen3-coder');
  });

  it('uses the configured model, or the default when the setting is empty', () => {
    expect(effectiveModel('openai', '')).toBe('gpt-5-mini');
    expect(effectiveModel('openai', '  ')).toBe('gpt-5-mini');
    expect(effectiveModel('openai', ' gpt-5 ')).toBe('gpt-5');
  });

  it('adds the models the provider reports after the suggestions, without duplicates', () => {
    const ids = mergeModelOptions('openai', ['gpt-5-mini', 'gpt-5.1', '', 'gpt-5.1']).map(option => option.id);
    expect(ids.slice(0, suggestedModels('openai').length)).toEqual(suggestedModels('openai').map(model => model.id));
    expect(ids.filter(id => id === 'gpt-5-mini')).toHaveLength(1);
    expect(ids.at(-1)).toBe('gpt-5.1');
  });

  it('rejects empty ids and ids with spaces in the free-text box', () => {
    expect(validateModelInput('')).toBeTruthy();
    expect(validateModelInput('gtp 5 mini')).toMatch(/no spaces/);
    expect(validateModelInput('my-custom-model')).toBeUndefined();
  });

  it('suggests the intended model for typos like "gtp 5 mini"', () => {
    expect(closestModel('openai', 'gtp 5 mini')).toBe('gpt-5-mini');
    expect(closestModel('openai', 'GPT5 Mini')).toBe('gpt-5-mini');
    expect(closestModel('anthropic', 'claude sonet 4.5')).toBe('claude-sonnet-4-5');
    expect(closestModel('openai', 'gpt-5-mini')).toBeUndefined();
    expect(closestModel('openai', 'totally-different-thing')).toBeUndefined();
  });
});
