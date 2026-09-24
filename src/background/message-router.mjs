// chrome.runtime.onMessage routing: one listener, an action → handler table.
//
// A handler receives (request, sender, sendResponse) and returns what the
// onMessage listener must return: true while a response is pending,
// false/undefined otherwise. `respondAsync` covers the common case of an
// async result answered as { success: true, ...result } or
// { success: false, error, code? } (code: a machine-readable reason such as
// FORUM_ACCESS_NOT_GRANTED).

export function createMessageRouter(routes) {
  return (request, sender, sendResponse) => {
    const handler = Object.hasOwn(routes, request?.action) ? routes[request.action] : null;
    return handler ? handler(request, sender, sendResponse) : undefined;
  };
}

export function respondAsync(run) {
  return (request, sender, sendResponse) => {
    Promise.resolve()
      .then(() => run(request, sender))
      .then(
        result => sendResponse({ success: true, ...result }),
        error => sendResponse({
          success: false,
          error: error?.message,
          ...(error?.code ? { code: error.code } : {})
        })
      );
    return true;
  };
}
