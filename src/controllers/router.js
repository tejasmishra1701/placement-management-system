'use strict';
// Minimal REST router: method + path pattern (with :params) -> handler(ctx).

class Router {
  constructor() { this.routes = []; }

  add(method, pattern, handler) {
    const keys = [];
    const source = pattern.replace(/\/:([A-Za-z_]+)/g, (_, key) => { keys.push(key); return '/([^/]+)'; });
    this.routes.push({ method, re: new RegExp(`^${source}/?$`), keys, handler });
    return this;
  }
  get(p, h) { return this.add('GET', p, h); }
  post(p, h) { return this.add('POST', p, h); }
  put(p, h) { return this.add('PUT', p, h); }
  delete(p, h) { return this.add('DELETE', p, h); }

  match(method, pathname) {
    for (const r of this.routes) {
      if (r.method !== method) continue;
      const m = r.re.exec(pathname);
      if (!m) continue;
      const params = {};
      r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      return { handler: r.handler, params };
    }
    return null;
  }
}

module.exports = { Router };
