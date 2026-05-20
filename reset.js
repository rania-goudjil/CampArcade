"use strict";

const { resetState } = require("../../lib/arcade-store.js");
const {
  assertAdminSecret,
  getAdminSecret,
  methodNotAllowed,
  readJsonBody,
  sendError,
  sendJson,
} = require("../../lib/api-utils.js");

module.exports = async function resetHandler(req, res) {
  if (req.method !== "POST") {
    methodNotAllowed(res, ["POST"]);
    return;
  }

  try {
    const body = await readJsonBody(req);
    assertAdminSecret(getAdminSecret(req, body));
    const result = await resetState();
    sendJson(res, 200, result);
  } catch (error) {
    sendError(res, error);
  }
};
