const brevoEndpoint = "https://api.brevo.com/v3/smtp/email";
const retryCount = 3;

type BrevoError = {
  code?: string;
  message?: string;
};

export type SendEmailInput = {
  to: string;
  subject: string;
  htmlContent: string;
};

export type SendEmailResult = {
  messageId?: string;
};

function getConfig() {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_FROM_EMAIL;
  const senderName = process.env.BREVO_FROM_NAME ?? "AR Makeup";

  if (!apiKey) throw new Error("BREVO_API_KEY is not configured.");
  if (!senderEmail) throw new Error("BREVO_FROM_EMAIL is not configured.");

  return { apiKey, senderEmail, senderName };
}

function errorMessage(error: BrevoError | unknown) {
  if (typeof error === "object" && error !== null) {
    const value = error as BrevoError;
    return value.message ?? value.code ?? "Brevo email request failed.";
  }
  return "Brevo email request failed.";
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const { apiKey, senderEmail, senderName } = getConfig();
  let lastError = "Brevo email request failed.";

  for (let attempt = 1; attempt <= retryCount; attempt += 1) {
    try {
      const response = await fetch(brevoEndpoint, {
        method: "POST",
        headers: {
          accept: "application/json",
          "api-key": apiKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sender: { email: senderEmail, name: senderName },
          to: [{ email: input.to }],
          subject: input.subject,
          htmlContent: input.htmlContent,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { messageId?: string; code?: string; message?: string }
        | null;

      if (response.ok) {
        return { messageId: payload?.messageId };
      }

      lastError = `Brevo ${response.status}: ${errorMessage(payload)}`;
    } catch (error) {
      lastError = errorMessage(error);
    }

    if (attempt < retryCount) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }

  throw new Error(lastError);
}
