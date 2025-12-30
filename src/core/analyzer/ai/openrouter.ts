/**
 * OpenRouter API client
 * Handles communication with OpenRouter for AI model access
 */

import type { AIConfig } from '../../../types/index.js';

/** OpenRouter API endpoint */
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

/** OpenRouter chat message */
interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** OpenRouter API response */
interface OpenRouterResponse {
  id: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  error?: {
    message: string;
    code: string;
  };
}

/** Error from OpenRouter API */
export class OpenRouterError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = 'OpenRouterError';
  }
}

/**
 * Call OpenRouter API with a prompt
 */
export async function callOpenRouter(
  messages: ChatMessage[],
  config: AIConfig,
  apiKey: string
): Promise<string> {
  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/lamps-code-review',
      'X-Title': 'LampsCodeReview',
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      max_tokens: config.maxTokens,
      temperature: config.temperature,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `OpenRouter API error: ${response.status}`;

    try {
      const errorJson = JSON.parse(errorText);
      if (errorJson.error?.message) {
        errorMessage = errorJson.error.message;
      }
    } catch {
      // Use raw error text if not JSON
      if (errorText) {
        errorMessage = errorText;
      }
    }

    throw new OpenRouterError(errorMessage, undefined, response.status);
  }

  const data = (await response.json()) as OpenRouterResponse;

  if (data.error) {
    throw new OpenRouterError(data.error.message, data.error.code);
  }

  if (!data.choices || data.choices.length === 0) {
    throw new OpenRouterError('No response from AI model');
  }

  return data.choices[0].message.content;
}

/**
 * Simple helper to create a chat completion
 */
export async function chat(
  systemPrompt: string,
  userPrompt: string,
  config: AIConfig,
  apiKey: string
): Promise<string> {
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  return callOpenRouter(messages, config, apiKey);
}
