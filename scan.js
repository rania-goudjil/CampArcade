"use strict";

const { applyScan } = require("../lib/arcade-store.js");
const { methodNotAllowed, readJsonBody, sendError, sendJson } = require("../lib/api-utils.js");

module.exports = async function scanHandler(req, res) {
  if (req.method !== "POST") {
    methodNotAllowed(res, ["POST"]);
    return;
  }

  try {
    const body = await readJsonBody(req);
    const result = await applyScan({
      userId: body.userId,
      email: body.email,
      gameId: body.gameId || body.qrToken,
    });
    sendJson(res, 200, result);
  } catch (error) {
    sendError(res, error);
  }
};
