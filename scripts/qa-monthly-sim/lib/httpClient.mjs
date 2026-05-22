import {
  buildDeviceCookieHeader,
  cookieHeaderFromJar,
  parseSetCookieHeaders,
  qaDeviceId,
} from "./deviceCookie.mjs";
import { sleep, rateLimitBackoffMs } from "./requestPacing.mjs";

const CSRF_HEADER = "x-csrf-token";

export class QaHttpClient {
  constructor({ baseUrl, personaId, mock = false, pacingMs = 0, maxRetries = 3 }) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.personaId = personaId;
    this.deviceId = qaDeviceId(personaId);
    this.mock = mock;
    this.pacingMs = Math.max(0, pacingMs);
    this.maxRetries = maxRetries;
    this.jar = {};
    this.csrfToken = null;
    this._lastRequestAt = 0;
    this._initDeviceCookies();
  }

  async _waitPacing() {
    if (!this.pacingMs) return;
    const elapsed = Date.now() - this._lastRequestAt;
    const wait = this.pacingMs - elapsed;
    if (wait > 0) await sleep(wait);
  }

  _initDeviceCookies() {
    const hdr = buildDeviceCookieHeader(this.deviceId);
    for (const part of hdr.split(";")) {
      const eq = part.indexOf("=");
      if (eq <= 0) continue;
      const k = part.slice(0, eq).trim();
      let v = part.slice(eq + 1).trim();
      try {
        v = decodeURIComponent(v);
      } catch {
        /* keep */
      }
      this.jar[k] = v;
    }
  }

  async _mergeCookies(res) {
    const extra = parseSetCookieHeaders(res.headers);
    Object.assign(this.jar, extra);
    if (extra.mleo_csrf_token) this.csrfToken = extra.mleo_csrf_token;
  }

  async ensureCsrf() {
    if (this.mock) {
      this.csrfToken = "mock.csrf";
      return;
    }
    const res = await fetch(`${this.baseUrl}/api/csrf-token`, {
      headers: { cookie: cookieHeaderFromJar(this.jar) },
    });
    await this._mergeCookies(res);
    const data = await res.json().catch(() => ({}));
    if (data?.token) {
      this.csrfToken = data.token;
      this.jar.mleo_csrf_token = data.token;
    }
    await fetch(`${this.baseUrl}/api/arcade/device`, {
      headers: { cookie: cookieHeaderFromJar(this.jar) },
    }).then(r => this._mergeCookies(r));
  }

  async request(method, path, { body, headers = {}, json = true } = {}) {
    if (this.mock) {
      return {
        ok: true,
        status: 200,
        data: { success: true, mock: true, balance: 10_000_000 },
        ms: 0,
      };
    }

    let lastResult = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      await this._waitPacing();
      const started = Date.now();
      if (!this.csrfToken && method !== "GET") await this.ensureCsrf();
      const url = path.startsWith("http") ? path : `${this.baseUrl}${path}`;
      const h = {
        cookie: cookieHeaderFromJar(this.jar),
        ...headers,
      };
      if (method !== "GET" && this.csrfToken) h[CSRF_HEADER] = this.csrfToken;
      if (body != null) h["content-type"] = "application/json";

      const res = await fetch(url, {
        method,
        headers: h,
        body: body != null ? JSON.stringify(body) : undefined,
      });
      this._lastRequestAt = Date.now();
      await this._mergeCookies(res);
      const ms = Date.now() - started;
      let data = null;
      if (json) {
        try {
          data = await res.json();
        } catch {
          data = null;
        }
      }
      lastResult = { ok: res.ok, status: res.status, data, ms };
      const rateLimited =
        res.status === 429 ||
        /too many requests/i.test(String(data?.message || data?.code || ""));
      if (!rateLimited || attempt >= this.maxRetries) break;
      await sleep(rateLimitBackoffMs(attempt));
    }
    return lastResult;
  }

  get(path, opts) {
    return this.request("GET", path, opts);
  }

  post(path, body, opts) {
    return this.request("POST", path, { body, ...opts });
  }
}
