function createApiProxy({ origin, getToken, fetchImpl = globalThis.fetch }) {
  return async function apiProxy({ path, method = 'GET', body = null, headers = {}, timeoutMs = 35000 }) {
    if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) {
      return { ok: false, status: 400, data: { message: 'Некорректный путь API' } };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(60000, Math.max(1000, Number(timeoutMs) || 35000)));
    try {
      const token = await getToken();
      const fetchHeaders = { ...headers };
      if (token) fetchHeaders.Authorization = `Bearer ${token}`;
      if (typeof body === 'string' && !fetchHeaders['Content-Type']) fetchHeaders['Content-Type'] = 'application/json';
      const response = await fetchImpl(`${origin}/api${path}`, {
        method, headers: fetchHeaders, ...(typeof body === 'string' ? { body } : {}), signal: controller.signal
      });
      const responseText = await response.text();
      let data;
      try { data = responseText ? JSON.parse(responseText) : {}; }
      catch (_) {
        return { ok: false, status: response.ok ? 502 : response.status, data: { message: 'Сервер вернул некорректный ответ. Попробуйте позже.' } };
      }
      return { ok: response.ok, status: response.status, data };
    } catch (error) {
      // A transport failure has no HTTP status. In particular it is not an HTTP
      // 500: the renderer must be able to recover a lost authentication response.
      return {
        ok: false, status: 0, networkError: true, timedOut: controller.signal.aborted,
        data: { message: controller.signal.aborted
          ? 'Сервер долго не отвечает. Проверьте подключение и попробуйте ещё раз.'
          : 'Не удалось связаться с сервером. Проверьте интернет и попробуйте ещё раз.' }
      };
    } finally { clearTimeout(timer); }
  };
}

module.exports = { createApiProxy };
