const DEFAULT_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycby1NsEE3QoqacmE4ep-It1loImsf_Zbgru3yZ7ITZVbdNNJFYTDKY-zJRhzaWYPtMR8/exec";
const ALLOWED_ACTIONS = new Set(["getUniqueDrugNames", "getDrugDataByHoatChat"]);

const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store"
};

const toJson = (statusCode, body) => ({
  statusCode,
  headers: jsonHeaders,
  body: JSON.stringify(body)
});

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: jsonHeaders, body: "" };
  }

  if (event.httpMethod !== "GET") {
    return toJson(405, { ok: false, error: "Method not allowed" });
  }

  const params = event.queryStringParameters || {};
  const action = String(params.action || "").trim();

  if (!ALLOWED_ACTIONS.has(action)) {
    return toJson(400, { ok: false, error: "Action không hợp lệ." });
  }

  const appsScriptUrl = process.env.MLCT_APPS_SCRIPT_URL || DEFAULT_APPS_SCRIPT_URL;
  const upstreamUrl = new URL(appsScriptUrl);
  upstreamUrl.searchParams.set("action", action);

  if (action === "getDrugDataByHoatChat") {
    upstreamUrl.searchParams.set("drugName", params.drugName || "");
  }

  try {
    const upstream = await fetch(upstreamUrl, {
      method: "GET",
      redirect: "follow",
      headers: {
        Accept: "application/json"
      }
    });
    const text = await upstream.text();

    let payload;
    try {
      payload = JSON.parse(text);
    } catch (error) {
      return toJson(502, {
        ok: false,
        error: "Apps Script trả dữ liệu không hợp lệ.",
        status: upstream.status
      });
    }

    if (!upstream.ok) {
      return toJson(upstream.status, payload);
    }

    return toJson(200, payload);
  } catch (error) {
    return toJson(502, {
      ok: false,
      error: error && error.message ? error.message : String(error)
    });
  }
};
