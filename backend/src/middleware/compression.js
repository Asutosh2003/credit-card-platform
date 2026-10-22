const zlib = require("zlib");

/** Gzip JSON/text responses when client accepts it (no extra dependency). */
function compression(req, res, next) {
  const accept = req.headers["accept-encoding"] || "";
  if (!/\bgzip\b/i.test(accept)) return next();

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    try {
      const payload = Buffer.from(JSON.stringify(body));
      if (payload.length < 1024) {
        return originalJson(body);
      }
      zlib.gzip(payload, (err, compressed) => {
        if (err) return originalJson(body);
        res.setHeader("Content-Encoding", "gzip");
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Content-Length", compressed.length);
        res.status(res.statusCode || 200).end(compressed);
      });
    } catch {
      return originalJson(body);
    }
  };
  next();
}

module.exports = { compression };
