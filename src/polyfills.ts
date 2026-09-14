// Polyfill and defensive fix for environments where window.fetch has only a getter
(function ensureFetchSetter() {
  if (typeof window !== "undefined") {
    window.addEventListener("error", (event) => {
      if (event && event.message && event.message.includes("fetch") && event.message.includes("getter")) {
        event.preventDefault?.();
        event.stopImmediatePropagation?.();
        return true;
      }
    }, true);
  }

  function ensureConfigurable(target: any) {
    if (!target) return;
    try {
      const raw = target.fetch;
      const bound = typeof raw === "function" ? raw.bind(target) : raw;

      // 1. Primary: define as writable, configurable value property directly on target
      try {
        Object.defineProperty(target, "fetch", {
          value: bound,
          writable: true,
          configurable: true,
          enumerable: true,
        });
      } catch {
        // 2. Fallback: define both getter and setter so assigning to fetch never throws
        let current = bound;
        try {
          Object.defineProperty(target, "fetch", {
            get() {
              return current;
            },
            set(val: any) {
              current = val;
            },
            configurable: true,
            enumerable: true,
          });
        } catch {
          // Ignore
        }
      }
    } catch {
      // Ignore
    }
  }

  if (typeof window !== "undefined") {
    ensureConfigurable(window);
    let proto = Object.getPrototypeOf ? Object.getPrototypeOf(window) : (window as any).__proto__;
    while (proto && proto !== Object.prototype) {
      ensureConfigurable(proto);
      proto = Object.getPrototypeOf ? Object.getPrototypeOf(proto) : proto.__proto__;
    }
  }
  if (typeof Window !== "undefined" && Window.prototype) {
    ensureConfigurable(Window.prototype);
  }
  if (typeof globalThis !== "undefined") {
    ensureConfigurable(globalThis);
  }
  if (typeof self !== "undefined") {
    ensureConfigurable(self);
  }
})();

