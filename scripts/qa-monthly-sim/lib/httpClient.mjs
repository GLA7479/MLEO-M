import {
  buildDeviceCookieHeader,
  cookieHeaderFromJar,
  parseSetCookieHeaders,
  qaDeviceId,
} from "./deviceCookie.mjs";

const CSRF_HEADER = "x-csrf-token";

export class QaHttpClient {
  constructor({ baseUrl, personaId, mock = false }) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.personaId = personaId;
    this.deviceId = qaDeviceId(personaId);
    this.mock = mock;
    this.jar = {};
    this.csrfToken = null;
    this._initDeviceCookies();
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
    const started = Date.now();
    if (this.mock) {
      return {
        ok: true,
        status: 200,
        data: { success: true, mock: true, balance: 10_000_000 },
        ms: 0,
      };
    }
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
    return { ok: res.ok, status: res.status, data, ms };
  }

  get(path, opts) {
    return this.request("GET", path, opts);
  }

  post(path, body, opts) {
    return this.request("POST", path, { body, ...opts });
  }
}
