require('@testing-library/jest-dom');

// Mocking fetch API
global.fetch = jest.fn(() =>
  Promise.resolve({
    json: () => Promise.resolve({}),
  })
);

// Minimal Response polyfill for API route unit tests
if (typeof global.Response === 'undefined') {
  class SimpleResponse {
    _body;
    status;
    constructor(body, init) {
      this._body = typeof body === 'string' ? body : JSON.stringify(body);
      this.status = (init && init.status) || 200;
    }
    async json() {
      try {
        return JSON.parse(this._body);
      } catch {
        return this._body;
      }
    }
  }
  // @ts-ignore
  global.Response = SimpleResponse;
}

// Minimal crypto.randomUUID polyfill for tests
if (typeof global.crypto === 'undefined' || typeof global.crypto.randomUUID !== 'function') {
  const { randomUUID } = require('crypto');
  // @ts-ignore
  global.crypto = { randomUUID };
}

// Provide minimal headers object for tests that inspect req.headers.get(...)
if (typeof global.Headers === 'undefined') {
  class SimpleHeaders {
    constructor(init) { this.map = new Map(Object.entries(init || {})); }
    get(k) { return this.map.get(k) || null; }
    set(k, v) { this.map.set(k, v); }
  }
  // @ts-ignore
  global.Headers = SimpleHeaders;
}

// TextEncoder/TextDecoder for simplewebauthn deps in Jest
if (typeof global.TextEncoder === 'undefined') {
  const { TextEncoder } = require('util');
  // @ts-ignore
  global.TextEncoder = TextEncoder;
}
if (typeof global.TextDecoder === 'undefined') {
  const { TextDecoder } = require('util');
  // @ts-ignore
  global.TextDecoder = TextDecoder;
}