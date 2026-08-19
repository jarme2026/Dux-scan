// =====================================================
// DUX SCAN - CLOUDFLARE WORKER
// =====================================================

function normalizeCheckerName(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 50);
}

async function getResendApiKey(env) {
  const binding = env.RESEND_API_KEY;

  if (!binding) {
    return null;
  }

  if (typeof binding.get === 'function') {
    return await binding.get();
  }

  if (typeof binding === 'string') {
    return binding;
  }

  return null;
}

async function sendReport(request, env) {
  let body;

  try {
    body = await request.json();
  }
  catch (err) {
    return json(
      {
        ok: false,
        error: 'Invalid request body'
      },
      400
    );
  }

  const filename =
    String(
      body.filename
      ||
      'DUX-Scan.xlsx'
    );

  const content =
    String(
      body.content
      ||
      ''
    );

  const checkedBy = normalizeCheckerName(body.checkedBy);

  if (checkedBy.length < 2) {
    return json(
      {
        ok: false,
        error: 'Please enter the name of the person who checked the list.'
      },
      400
    );
  }

  if (!content) {
    return json(
      {
        ok: false,
        error: 'No XLSX file was received'
      },
      400
    );
  }

  if (
    content.length >
    8 * 1024 * 1024
  ) {
    return json(
      {
        ok: false,
        error: 'The XLSX file is too large'
      },
      413
    );
  }

  const recipients =
    (
      env.REPORT_RECIPIENTS
      ||
      ''
    )
      .split(',')
      .map(
        email =>
          email.trim()
      )
      .filter(Boolean);

  if (
    !recipients.length
  ) {
    return json(
      {
        ok: false,
        error:
          'No REPORT_RECIPIENTS configured'
      },
      500
    );
  }

  const apiKey =
    await getResendApiKey(
      env
    );

  if (!apiKey) {
    return json(
      {
        ok: false,
        error:
          'No RESEND_API_KEY configured'
      },
      500
    );
  }

  const response =
    await fetch(
      'https://api.resend.com/emails',
      {
        method:
          'POST',

        headers: {
          'Authorization':
            'Bearer '
            +
            apiKey,

          'Content-Type':
            'application/json'
        },

        body:
          JSON.stringify({
            from:
              'DUX Scan <onboarding@resend.dev>',

            to:
              recipients,

            subject:
              'DUX Scan — Barcode Report — checked by '
              +
              checkedBy,

            text:
              'Attached is the current DUX Scan barcode report.\n\nChecked by: '
              +
              checkedBy,

            attachments: [
              {
                filename,
                content
              }
            ]
          })
      }
    );

  const responseText =
    await response
      .text()
      .catch(
        () => ''
      );

  if (
    !response.ok
  ) {
    return json(
      {
        ok: false,

        error:
          'Resend API error ('
          +
          response.status
          +
          '): '
          +
          responseText
      },
      502
    );
  }

  return json({
    ok: true,
    sent: true,
    checkedBy
  });
}

function json(
  data,
  status = 200
) {
  return new Response(
    JSON.stringify(
      data
    ),
    {
      status,

      headers: {
        'content-type':
          'application/json'
      }
    }
  );
}

export default {
  async fetch(
    request,
    env
  ) {
    const url =
      new URL(
        request.url
      );

    if (
      url.pathname ===
        '/api/send-report'
      &&
      request.method ===
        'POST'
    ) {
      return sendReport(
        request,
        env
      );
    }

    return env.ASSETS.fetch(
      request
    );
  }
};
