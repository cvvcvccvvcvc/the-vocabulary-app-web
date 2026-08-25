const relayPath = "/telegram";
const telegramSecretHeader = "x-telegram-bot-api-secret-token";
const reminderBatchLimit = 20;

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

function reminderApiUrl(environment, path) {
  let baseUrl;
  try {
    baseUrl = new URL(environment.ORIGIN_REMINDER_API_URL);
  } catch {
    return null;
  }
  if (baseUrl.protocol !== "https:") return null;
  if (!baseUrl.pathname.endsWith("/")) baseUrl.pathname += "/";
  return new URL(path, baseUrl);
}

export async function dispatchTelegramReminders(
  environment,
  fetchImplementation = fetch,
) {
  const claimUrl = reminderApiUrl(environment, "claim");
  const completeUrl = reminderApiUrl(environment, "complete");
  if (
    claimUrl === null
    || completeUrl === null
    || typeof environment.TELEGRAM_REMINDER_DISPATCH_SECRET !== "string"
    || environment.TELEGRAM_REMINDER_DISPATCH_SECRET === ""
    || typeof environment.TELEGRAM_BOT_TOKEN !== "string"
    || environment.TELEGRAM_BOT_TOKEN === ""
  ) {
    return { claimed: 0, sent: 0 };
  }

  const authorization = `Bearer ${environment.TELEGRAM_REMINDER_DISPATCH_SECRET}`;
  let claimResponse;
  try {
    claimResponse = await fetchImplementation(claimUrl, {
      method: "POST",
      headers: { authorization },
      redirect: "manual",
    });
  } catch {
    return { claimed: 0, sent: 0 };
  }
  if (!claimResponse.ok) return { claimed: 0, sent: 0 };

  let claimPayload;
  try {
    claimPayload = await claimResponse.json();
  } catch {
    return { claimed: 0, sent: 0 };
  }
  const reminders = Array.isArray(claimPayload?.reminders)
    ? claimPayload.reminders.slice(0, reminderBatchLimit)
    : [];
  const results = [];

  for (const reminder of reminders) {
    if (
      typeof reminder?.eventId !== "string"
      || reminder.eventId === ""
      || reminder?.request?.method !== "sendMessage"
    ) {
      continue;
    }

    let ok = false;
    let errorCode = null;
    try {
      const { method: _method, ...parameters } = reminder.request;
      const telegramResponse = await fetchImplementation(
        `https://api.telegram.org/bot${environment.TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(parameters),
          redirect: "manual",
        },
      );
      const telegramPayload = await telegramResponse.json().catch(() => null);
      ok = telegramResponse.ok && telegramPayload?.ok === true;
      errorCode = ok
        ? null
        : Number.isInteger(telegramPayload?.error_code)
          ? telegramPayload.error_code
          : telegramResponse.status;
    } catch {
      // A network failure is ambiguous, so this non-critical reminder is not retried.
    }
    results.push({ eventId: reminder.eventId, ok, errorCode });
  }

  if (results.length > 0) {
    try {
      await fetchImplementation(completeUrl, {
        method: "POST",
        headers: {
          authorization,
          "content-type": "application/json",
        },
        body: JSON.stringify({ results }),
        redirect: "manual",
      });
    } catch {
      // Claims are at-most-once; a failed completion report must not duplicate messages.
    }
  }

  return {
    claimed: results.length,
    sent: results.filter((result) => result.ok).length,
  };
}

export default {
  fetch(request, environment) {
    return relayTelegramWebhook(request, environment);
  },
  scheduled(_controller, environment, context) {
    context.waitUntil(dispatchTelegramReminders(environment));
  },
};
