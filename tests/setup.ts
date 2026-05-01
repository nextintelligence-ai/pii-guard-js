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

  Object.defineProperty(jsdomWindow, 'scrollTo', {
    configurable: true,
    value: () => undefined,
  });
}

Object.defineProperty(globalThis, 'scrollTo', {
  configurable: true,
  value: () => undefined,
});
