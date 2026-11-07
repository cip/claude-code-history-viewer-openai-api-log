# OpenAI Responses viewer (PoC)

The Explorer's “Open conversation…” action retrieves one stored OpenAI Response. It uses the official [Retrieve Response](https://developers.openai.com/api/reference/resources/responses/methods/retrieve) endpoint and paginates [List Input Items](https://developers.openai.com/api/reference/resources/responses/subresources/input_items/methods/list) in ascending order, requesting the optional payload fields documented by the API. The UI displays API-returned input and output items as raw JSON; tool calls/results, structured JSON, roles, metadata, and usage fields are not converted into invented conversation text.

## Try it with a real response

1. In the OpenAI Platform dashboard, open the API Logs page and copy a Response ID beginning with resp_.
2. In the desktop app, choose “Open conversation…” in the Explorer. In WebUI, this action is available only on an authenticated loopback server.
3. Enter the Response ID and an API key for the project that owns the response, then select “Load response”. The key field clears after the request. It is not stored by the application.
4. Use item search and the per-item expand controls to inspect the input, tool activity, output, and response metadata.

Use a response that is stored and accessible to the API key. OpenAI says Responses are stored for 30 days by default and can be retrieved through the API or viewed in dashboard logs; setting store=false disables this retention. Organization retention controls, including Zero Data Retention, can make a response unavailable. A 404 is therefore reported as unavailable, which can also mean expired, not stored, or inaccessible to the selected project.

## What the viewer does not reconstruct

Only the input items returned for this response are shown. If previous_response_id is set, the linked earlier response is identified but not fetched, so its input is not implied to be present. Input item retrieval is capped at 10,000 items; the UI marks a capped result as partial. The retrieved Response object is shown in full under Response metadata, including fields not promoted into summary cards. OpenAI may omit or redact data, and optional payloads can remain unavailable even when requested.

The proof of concept has fixture-based mapping and error tests. No real API key or private conversation is included. A real dashboard retrieval still needs to be exercised with the steps above.
