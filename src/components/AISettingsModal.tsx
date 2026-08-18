import { useState, useEffect } from 'react';
import { getEffectiveBaseUrl, getEffectiveModel } from '../ai/config';

type Props = {
  open: boolean;
  onClose: () => void;
};

const PRESET_PROVIDERS = [
  {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  },
  {
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: [
      'openai/gpt-4o',
      'openai/gpt-4o-mini',
      'anthropic/claude-3.5-sonnet',
      'google/gemini-2.0-flash-001',
      'meta-llama/llama-3.1-70b-instruct',
    ],
  },
  {
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    models: [
      'openai/gpt-oss-120b',
      'qwen/qwen3.6-27b',
      'openai/gpt-oss-20b',
      'llama-3.1-8b-instant',
      'groq/compound',
      'groq/compound-mini',
    ],
  },
  {
    label: 'Local (Ollama)',
    baseUrl: 'http://localhost:11434/v1',
    models: ['llama3', 'mistral', 'phi3'],
  },
];

export function AISettingsModal({ open, onClose }: Props) {
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (open) {
      setApiKey(localStorage.getItem('ai_api_key') ?? '');
      setBaseUrl(getEffectiveBaseUrl());
      setModel(getEffectiveModel());
      setSaved(false);
    }
  }, [open]);

  if (!open) return null;

  const selectedProvider = PRESET_PROVIDERS.find((p) =>
    baseUrl.startsWith(p.baseUrl.split('/v1')[0]),
  );

  const handleSave = () => {
    if (apiKey.trim()) {
      localStorage.setItem('ai_api_key', apiKey.trim());
    } else {
      localStorage.removeItem('ai_api_key');
    }
    localStorage.setItem('ai_base_url', baseUrl.trim());
    localStorage.setItem('ai_model', model.trim());
    setSaved(true);
    setTimeout(() => {
      onClose();
    }, 800);
  };

  const handlePreset = (provider: typeof PRESET_PROVIDERS[number]) => {
    setBaseUrl(provider.baseUrl);
    setModel(provider.models[0]);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="AI Settings"
      >
        <div className="modal-header">
          <h2>AI Settings</h2>
          <button type="button" className="btn-icon" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {/* Provider presets */}
          <div className="settings-section">
            <label className="form-label">Provider</label>
            <div className="provider-presets">
              {PRESET_PROVIDERS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  className={`provider-btn${selectedProvider?.label === p.label ? ' active' : ''}`}
                  onClick={() => handlePreset(p)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* API Key */}
          <div className="settings-section">
            <label className="form-label">
              API Key
              <input
                type="password"
                className="form-input"
                placeholder="sk-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                autoComplete="off"
              />
            </label>
            <p className="settings-hint">
              Stored in localStorage only — never sent anywhere except the AI provider.
            </p>
          </div>

          {/* Base URL */}
          <div className="settings-section">
            <label className="form-label">
              Base URL
              <input
                className="form-input"
                placeholder="https://api.openai.com/v1"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
              />
            </label>
          </div>

          {/* Model */}
          <div className="settings-section">
            <label className="form-label">
              Model
              {selectedProvider ? (
                <select
                  className="form-select"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                >
                  {selectedProvider.models.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                  <option value={model}>{model}</option>
                </select>
              ) : (
                <input
                  className="form-input"
                  placeholder="gpt-4o-mini"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                />
              )}
            </label>
          </div>

          {/* Status */}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={handleSave}>
            {saved ? '✓ Saved!' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
