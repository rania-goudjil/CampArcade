"use strict";

const { getStateForUser } = require("../lib/arcade-store.js");
const { methodNotAllowed, sendError, sendJson } = require("../lib/api-utils.js");

module.exports = async function stateHandler(req, res) {
  if (req.method !== "GET") {
    methodNotAllowed(res, ["GET"]);
    return;
  }

  try {
    const requestUrl = new URL(req.url, "http://localhost");
    const userId = requestUrl.searchParams.get("userId") || "";
    const result = await getStateForUser(userId);
    sendJson(res, 200, result);
  } catch (error) {
    sendError(res, error);
  }
};
