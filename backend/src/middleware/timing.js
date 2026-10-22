/** Log slow requests (helps spot Supabase latency). */
function requestTiming(req, res, next) {
  const started = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - started;
    if (ms >= 800) {
      console.warn(`[slow] ${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`);
    }
  });
  next();
}

module.exports = { requestTiming };
