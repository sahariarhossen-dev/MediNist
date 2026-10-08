// Polyfill and defensive fix for environments where window.fetch has only a getter or encounters network disconnects
(function ensureFetchSetter() {
  if (typeof window !== "undefined") {
    window.addEventListener("error", (event) => {
      const msg = event?.message || "";
      if (
        (msg.includes("fetch") && msg.includes("getter")) ||
        msg.includes("Failed to fetch") ||
        msg.includes("NetworkError") ||
        msg.includes("Load failed")
      ) {
        event.preventDefault?.();
        event.stopImmediatePropagation?.();
        return true;
      }
    }, true);

    window.addEventListener("unhandledrejection", (event) => {
      const reason = event?.reason;
      const msg =
        typeof reason === "string"
          ? reason
          : reason?.message || String(reason || "");
      if (
        msg.includes("Failed to fetch") ||
        msg.includes("NetworkError") ||
        msg.includes("Load failed") ||
        (reason?.name === "TypeError" && msg.includes("fetch"))
      ) {
        console.warn("[Network polyfill] Handled uncaught network rejection:", msg);
        event.preventDefault?.();
        event.stopImmediatePropagation?.();
      }
    }, true);
  }

  function wrapSafeFetch(fn: any, target: any) {
    if (typeof fn !== "function") return fn;
    if (fn.__safeFetchWrapped) return fn;
    const wrapped = async function (this: any, ...args: any[]) {
      try {
        return await fn.apply(target || this, args);
      } catch (err: any) {
        const msg = String(err?.message || err || "");
        if (
          msg.includes("Failed to fetch") ||
          msg.includes("NetworkError") ||
          msg.includes("Load failed") ||
          err?.name === "TypeError"
        ) {
          console.warn("[Network polyfill] Handled network failure in fetch:", args[0], msg);
          return new Response(
            JSON.stringify({
              code: "PGRST000",
              message: "Network request failed (offline or endpoint unreachable)",
              details: msg,
            }),
            {
              status: 503,
              statusText: "Service Unavailable",
              headers: { "Content-Type": "application/json" },
            }
          );
        }
        throw err;
      }
    };
    try {
      (wrapped as any).__safeFetchWrapped = true;
    } catch {}
    return wrapped;
  }

  function ensureConfigurable(target: any) {
    if (!target) return;
    try {
      const raw = target.fetch;
      const bound = typeof raw === "function" ? wrapSafeFetch(raw, target) : raw;

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
              current = wrapSafeFetch(val, target);
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

