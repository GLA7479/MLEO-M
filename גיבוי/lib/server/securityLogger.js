export function logSecurityEvent(type, details) {
  const log = {
    timestamp: new Date().toISOString(),
    type,
    details,
  };
  
  // Log to console in dev, to monitoring service in prod
  if (process.env.NODE_ENV === "production") {
    // Send to monitoring service (Sentry, LogRocket, etc.)
    console.error("[SECURITY]", JSON.stringify(log));
  } else {
    console.warn("[SECURITY]", log);
  }
}

export function logSuspiciousActivity(req, reason) {
  const ip = req.headers["x-forwarded-for"] || 
             req.headers["x-real-ip"] || 
             req.socket?.remoteAddress || 
             "unknown";
  
  logSecurityEvent("suspicious_activity", {
    ip: Array.isArray(ip) ? ip[0] : ip,
    path: req.url,
    method: req.method,
    deviceId: getDeviceIdFromRequest(req),
    reason,
    userAgent: req.headers["user-agent"],
    referer: req.headers["referer"],
  });
}

export function logRateLimitExceeded(req, scope, limit) {
  logSecurityEvent("rate_limit_exceeded", {
    ip: getClientIp(req),
    path: req.url,
    method: req.method,
    deviceId: getDeviceIdFromRequest(req),
    scope,
    limit,
    userAgent: req.headers["user-agent"],
  });
}

export function logCsrfFailure(req) {
  logSecurityEvent("csrf_failure", {
    ip: getClientIp(req),
    path: req.url,
    method: req.method,
    deviceId: getDeviceIdFromRequest(req),
    userAgent: req.headers["user-agent"],
    hasCsrfHeader: !!req.headers["x-csrf-token"],
  });
}

export function logValidationFailure(req, reason, data) {
  logSecurityEvent("validation_failure", {
    ip: getClientIp(req),
    path: req.url,
    method: req.method,
    deviceId: getDeviceIdFromRequest(req),
    reason,
    data: sanitizeDataForLogging(data),
    userAgent: req.headers["user-agent"],
  });
}

export function logIpRateLimitExceeded(req, limit) {
  logSecurityEvent("ip_rate_limit_exceeded", {
    ip: getClientIp(req),
    path: req.url,
    method: req.method,
    deviceId: getDeviceIdFromRequest(req),
    limit,
    userAgent: req.headers["user-agent"],
  });
}

export function logRequestSignatureFailure(req) {
  logSecurityEvent("request_signature_failure", {
    ip: getClientIp(req),
    path: req.url,
    method: req.method,
    deviceId: getDeviceIdFromRequest(req),
    userAgent: req.headers["user-agent"],
  });
}

function getClientIp(req) {
  const ip = req.headers["x-forwarded-for"] || 
             req.headers["x-real-ip"] || 
             req.socket?.remoteAddress || 
             "unknown";
  return Array.isArray(ip) ? ip[0] : ip;
}

function getDeviceIdFromRequest(req) {
  try {
    const cookies = req.headers?.cookie || "";
    const deviceCookie = cookies.split("; ").find(row => row.startsWith("mleo_arcade_device="));
    if (deviceCookie) {
      return deviceCookie.split("=")[1]?.substring(0, 20) + "...";
    }
  } catch {}
  return "unknown";
}

function sanitizeDataForLogging(data) {
  if (!data || typeof data !== "object") return data;
  const sanitized = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "string" && value.length > 100) {
      sanitized[key] = value.substring(0, 100) + "...";
    } else if (typeof value === "object" && !Array.isArray(value)) {
      sanitized[key] = sanitizeDataForLogging(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}
