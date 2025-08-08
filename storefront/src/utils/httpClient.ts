const MEDUSA_API_BASE_URL = process.env.NEXT_PUBLIC_MEDUSA_API_BASE_URL || 'http://localhost:9000';
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || '';

interface FetchOptions extends RequestInit {
  timeout?: number;
}

async function fetchWithTimeout(resource: string, options: FetchOptions = {}): Promise<Response> {
  const { timeout = 8000 } = options;

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  const response = await fetch(resource, {
    ...options,
    signal: controller.signal
  });

  clearTimeout(id);

  return response;
}

async function httpClient<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
  const url = `${MEDUSA_API_BASE_URL}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    // Ensure Medusa Store APIs receive the required publishable key header
    'x-publishable-api-key': PUBLISHABLE_KEY,
    ...options.headers,
  };

  try {
    const response = await fetchWithTimeout(url, { ...options, headers });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(error.message || 'An unknown error occurred.');
    }
    throw new Error('An unknown error occurred.');
  }
}

export default httpClient;
