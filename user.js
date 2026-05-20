"use strict";

const { saveUserEmail } = require("../lib/arcade-store.js");
const { methodNotAllowed, readJsonBody, sendError, sendJson } = require("../lib/api-utils.js");

module.exports = async function userHandler(req, res) {
  if (req.method !== "POST") {
    methodNotAllowed(res, ["POST"]);
    return;
  }

  try {
    const body = await readJsonBody(req);
    const result = await saveUserEmail(body.userId, body.email);
    sendJson(res, 200, result);
  } catch (error) {
    sendError(res, error);
  }
};
