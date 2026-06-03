import { getConfig } from '../config/env.js';
import { DEFAULT_USER_AGENT } from '../config/constants.js';

export interface FetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
  followRedirects?: boolean;
}

export interface FetchResponse<T = unknown> {
  ok: boolean;
  status: number;
  data: T;
  text: string;
  headers: Record<string, string>;
}

function getCookieHeader(isDds = false): string {
  const config = getConfig();
  return isDds ? config.ddsCookie : config.cookie;
}

export function createHttpClient(isDds = false) {
  const config = getConfig();
  const defaultHeaders: Record<string, string> = {
    'User-Agent': DEFAULT_USER_AGENT,
    'Referer': isDds ? 'https://dds.lanhuapp.com/' : 'https://lanhuapp.com/web/',
    'Accept': 'application/json, text/plain, */*',
    'Cookie': getCookieHeader(isDds),
    'sec-ch-ua': '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"',
    ...(isDds ? {} : { 'request-from': 'web', 'real-path': '/item/project/product' }),
  };

  async function request<T = unknown>(
    url: string,
    options: FetchOptions = {}
  ): Promise<FetchResponse<T>> {
    const {
      method = 'GET',
      headers: extraHeaders,
      body,
      timeout = config.httpTimeout,
      followRedirects = true,
    } = options;

    const headers = { ...defaultHeaders, ...extraHeaders };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const fetchOptions: RequestInit = {
        method,
        headers,
        signal: controller.signal,
        redirect: followRedirects ? 'follow' : 'manual',
      };

      if (body !== undefined && method !== 'GET') {
        fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
        if (!headers['Content-Type']) {
          headers['Content-Type'] = 'application/json';
        }
      }

      const response = await fetch(url, fetchOptions);
      const text = await response.text();
      let data: T;
      try {
        data = JSON.parse(text) as T;
      } catch {
        data = text as unknown as T;
      }

      const respHeaders: Record<string, string> = {};
      response.headers.forEach((v, k) => {
        respHeaders[k] = v;
      });

      return {
        ok: response.ok,
        status: response.status,
        data,
        text,
        headers: respHeaders,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async function get<T = unknown>(url: string, params?: Record<string, string | number | undefined>, options?: FetchOptions): Promise<FetchResponse<T>> {
    let fullUrl = url;
    if (params) {
      const searchParams = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) {
          searchParams.set(k, String(v));
        }
      }
      const qs = searchParams.toString();
      if (qs) fullUrl += `?${qs}`;
    }
    return request<T>(fullUrl, { ...options, method: 'GET' });
  }

  async function getBytes(url: string, options?: FetchOptions): Promise<Buffer> {
    const config = getConfig();
    const headers = { ...defaultHeaders };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options?.timeout ?? config.httpTimeout);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
        redirect: 'follow',
      });
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } finally {
      clearTimeout(timer);
    }
  }

  return { request, get, getBytes };
}

export type HttpClient = ReturnType<typeof createHttpClient>;
