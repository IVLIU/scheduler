export const createAbortController = () =>
  'AbortController' in globalThis
    ? new AbortController()
    : (({
        signal: { aborted: false },
        abort: function() {
          this.signal.aborted = true;
        },
      } as any) as AbortController);
