export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public current: { content: string; hash: string | null } | null = null,
  ) {
    super(message);
  }
}

export const UNREACHABLE = "Can't reach Control Center. Is it still running?";

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body === undefined || body instanceof FormData ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
      credentials: "same-origin",
    });
  } catch {
    throw new ApiError(0, UNREACHABLE);
  }
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null; // not our server's JSON: a proxy page or a dropped connection
  }
  if (!res.ok) {
    if (res.status === 401) window.dispatchEvent(new Event("cc:login-required"));
    if (typeof data?.error !== "string") throw new ApiError(res.status >= 500 || res.status === 0 ? 0 : res.status, res.status >= 500 ? UNREACHABLE : "Something went wrong. Try again.");
    throw new ApiError(res.status, data.error, data?.current ?? null);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body: unknown = {}) => request<T>("POST", path, body),
  put: <T>(path: string, body: unknown) => request<T>("PUT", path, body),
  del: <T>(path: string) => request<T>("DELETE", path),
  upload: <T>(path: string, form: FormData) => request<T>("POST", path, form),
};

export const enc = encodeURIComponent;
