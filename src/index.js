// =====================================================
// DUX SCAN - CLOUDFLARE WORKER
// =====================================================
//
// The scanning itself happens entirely in the browser.
// The Worker is only used to:
//
// 1. Serve the static website.
// 2. Receive the XLSX report.
// 3. Send the XLSX through Resend.
//
// =====================================================


async function getResendApiKey(env) {

  const binding =
    env.RESEND_API_KEY;


  if (!binding) {
    return null;
  }


  // Cloudflare Secrets Store
  if (
    typeof binding.get === 'function'
  ) {

    return await binding.get();

  }


  // Compatibility fallback
  // if configured as a normal Worker Secret.
  if (
    typeof binding === 'string'
  ) {

    return binding;

  }


  return null;
}


// =====================================================
// SEND EMAIL
// =====================================================

async function sendReport(
  request,
  env
) {

  let body;


  try {

    body =
      await request.json();

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


  if (!content) {

    return json(
      {
        ok: false,
        error: 'No XLSX file was received'
      },
      400
    );

  }


  // Basic protection against
  // accidentally sending a huge payload.
  //
  // Base64 is larger than the original file,
  // but DUX Scan reports should normally
  // remain very small.
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
              'DUX Scan — Barcode Report',


            text:
              'Attached is the current DUX Scan barcode report.',


            attachments: [

              {

                filename:
                  filename,


                content:
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

        ok:
          false,


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

    ok:
      true,


    sent:
      true

  });

}


// =====================================================
// JSON RESPONSE
// =====================================================

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


// =====================================================
// MAIN WORKER
// =====================================================

export default {

  async fetch(
    request,
    env
  ) {

    const url =
      new URL(
        request.url
      );


    // =============================================
    // EMAIL API
    // =============================================

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


    // =============================================
    // STATIC WEBSITE
    // =============================================

    return env.ASSETS.fetch(
      request
    );

  }

};
