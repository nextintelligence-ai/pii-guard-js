type GlobalWithJsdom = typeof globalThis & {
  jsdom?: {
    window: Window;
  };
};

const jsdomWindow = (globalThis as GlobalWithJsdom).jsdom?.window;

if (jsdomWindow) {
  Object.defineProperties(globalThis, {
    localStorage: {
      configurable: true,
      enumerable: true,
      get: () => jsdomWindow.localStorage,
    },
    sessionStorage: {
      configurable: true,
      enumerable: true,
      get: () => jsdomWindow.sessionStorage,
    },
  });
}
