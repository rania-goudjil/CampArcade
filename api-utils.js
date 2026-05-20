"use strict";

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  if (typeof req.body === "string" && req.body.length) {
    return JSON.parse(req.body);
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(payload));
}

function sendError(res, error) {
  const statusCode = error.statusCode || 500;
  sendJson(res, statusCode, {
    ok: false,
    error: error.message || "Arcade API error.",
  });
}

function methodNotAllowed(res, allowed) {
  res.setHeader("allow", allowed.join(", "));
  sendJson(res, 405, {
    ok: false,
    error: "Method not allowed.",
  });
}

function getAdminSecret(req, body = {}) {
  return (
    body.secret ||
    body.adminSecret ||
    req.headers["x-admin-secret"] ||
    req.headers["X-Admin-Secret"] ||
    ""
  );
}

function assertAdminSecret(secret) {
  if (!process.env.ADMIN_SECRET) {
    const error = new Error("ADMIN_SECRET is not configured.");
    error.statusCode = 500;
    throw error;
  }

  if (secret !== process.env.ADMIN_SECRET) {
    const error = new Error("Invalid admin secret.");
    error.statusCode = 401;
    throw error;
  }
}

module.exports = {
  assertAdminSecret,
  getAdminSecret,
  methodNotAllowed,
  readJsonBody,
  sendError,
  sendJson,
};
