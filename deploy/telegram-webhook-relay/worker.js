const relayPath = "/telegram";
const telegramSecretHeader = "x-telegram-bot-api-secret-token";

function emptyResponse(status) {
  return new Response(null, { status });
}

export async function relayTelegramWebhook(
  request,
  environment,
  fetchImplementation = fetch,
) {
  const requestUrl = new URL(request.url);
  if (request.method !== "POST" || requestUrl.pathname !== relayPath) {
    return emptyResponse(404);
  }

  const receivedSecret = request.headers.get(telegramSecretHeader);
  if (
    typeof environment.TELEGRAM_WEBHOOK_SECRET !== "string"
    || environment.TELEGRAM_WEBHOOK_SECRET === ""
    || receivedSecret !== environment.TELEGRAM_WEBHOOK_SECRET
  ) {
    return emptyResponse(401);
  }

  let originWebhookUrl;
  try {
    originWebhookUrl = new URL(environment.ORIGIN_WEBHOOK_URL);
  } catch {
    return emptyResponse(500);
  }
  if (originWebhookUrl.protocol !== "https:") {
    return emptyResponse(500);
  }

  let originResponse;
  try {
    originResponse = await fetchImplementation(originWebhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [telegramSecretHeader]: receivedSecret,
      },
      body: request.body,
      redirect: "manual",
    });
  } catch {
    return emptyResponse(502);
  }

  const responseHeaders = new Headers();
  const contentType = originResponse.headers.get("content-type");
  if (contentType !== null) responseHeaders.set("content-type", contentType);

  return new Response(originResponse.body, {
    status: originResponse.status,
    headers: responseHeaders,
  });
}

export default {
  fetch(request, environment) {
    return relayTelegramWebhook(request, environment);
  },
};
