/*
  Project 9 Cloudflare Worker
  L'Oréal Product-Aware Routine Builder

  Required Cloudflare secret:
  OPENAI_API_KEY

  Optional Cloudflare variable:
  ALLOWED_ORIGIN

  Example:
  ALLOWED_ORIGIN=https://chaconerick23.github.io

  Do not put your actual API key in this file.
*/

export default {
  async fetch(request, env) {
    /*
      Get the website origin that sent the request.
    */

    const requestOrigin =
      request.headers.get("Origin") || "";

    /*
      During testing, ALLOWED_ORIGIN defaults to "*".

      After your GitHub Pages site is working,
      you may create an ALLOWED_ORIGIN variable
      in Cloudflare with this value:

      https://chaconerick23.github.io
    */

    const allowedOrigin =
      env.ALLOWED_ORIGIN || "*";

    const originIsAllowed =
      allowedOrigin === "*" ||
      requestOrigin === allowedOrigin;

    const responseOrigin =
      allowedOrigin === "*"
        ? "*"
        : originIsAllowed
          ? requestOrigin
          : "null";

    /*
      Headers used for every response.
    */

    const corsHeaders = {
      "Access-Control-Allow-Origin":
        responseOrigin,

      "Access-Control-Allow-Methods":
        "POST, OPTIONS",

      "Access-Control-Allow-Headers":
        "Content-Type",

      "Content-Type":
        "application/json; charset=UTF-8",

      "Cache-Control":
        "no-store",

      Vary:
        "Origin"
    };

    /*
      Handle the browser's CORS preflight request.
    */

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    /*
      Only allow POST requests.
    */

    if (request.method !== "POST") {
      return jsonResponse(
        {
          error: {
            message:
              "Only POST requests are allowed."
          }
        },
        405,
        corsHeaders
      );
    }

    /*
      Stop requests from websites that are
      not listed in ALLOWED_ORIGIN.
    */

    if (!originIsAllowed) {
      return jsonResponse(
        {
          error: {
            message:
              "This website origin is not allowed."
          }
        },
        403,
        corsHeaders
      );
    }

    /*
      Make sure the OpenAI API key exists.
    */

    if (!env.OPENAI_API_KEY) {
      return jsonResponse(
        {
          error: {
            message:
              "The Worker is missing the OPENAI_API_KEY secret. Add it under Variables and Secrets."
          }
        },
        500,
        corsHeaders
      );
    }

    /*
      Read the request sent from script.js.
    */

    let requestData;

    try {
      requestData =
        await request.json();
    } catch (error) {
      return jsonResponse(
        {
          error: {
            message:
              "The request body must be valid JSON."
          }
        },
        400,
        corsHeaders
      );
    }

    /*
      Validate that the request includes
      a messages array.
    */

    if (
      !Array.isArray(
        requestData.messages
      )
    ) {
      return jsonResponse(
        {
          error: {
            message:
              "A messages array is required."
          }
        },
        400,
        corsHeaders
      );
    }

    /*
      Only accept valid chat roles.
    */

    const allowedRoles =
      new Set([
        "system",
        "user",
        "assistant"
      ]);

    /*
      Remove invalid or empty messages.
    */

    const messages =
      requestData.messages
        .filter(
          (message) =>
            allowedRoles.has(
              message?.role
            ) &&
            typeof message?.content ===
              "string" &&
            message.content
              .trim()
              .length > 0
        )
        .map(
          (message) => ({
            role:
              message.role,

            content:
              message.content.trim()
          })
        );

    if (messages.length === 0) {
      return jsonResponse(
        {
          error: {
            message:
              "No valid chat messages were provided."
          }
        },
        400,
        corsHeaders
      );
    }

    /*
      Prevent extremely large requests.
    */

    const totalCharacters =
      messages.reduce(
        (
          total,
          message
        ) =>
          total +
          message.content.length,
        0
      );

    if (
      totalCharacters > 100000
    ) {
      return jsonResponse(
        {
          error: {
            message:
              "The conversation is too long. Reload the page and generate a new routine."
          }
        },
        413,
        corsHeaders
      );
    }

    /*
      Take system messages and combine them
      into the Responses API instructions.
    */

    const systemInstructions =
      messages
        .filter(
          (message) =>
            message.role ===
            "system"
        )
        .map(
          (message) =>
            message.content
        )
        .join("\n\n");

    /*
      Keep all user and assistant messages.

      This allows the chatbot to remember
      the complete conversation history.
    */

    const inputMessages =
      messages
        .filter(
          (message) =>
            message.role ===
              "user" ||
            message.role ===
              "assistant"
        )
        .map(
          (message) => ({
            role:
              message.role,

            content:
              message.content
          })
        );

    if (
      inputMessages.length === 0
    ) {
      return jsonResponse(
        {
          error: {
            message:
              "At least one user message is required."
          }
        },
        400,
        corsHeaders
      );
    }

    /*
      Check whether the user turned on
      Live Product Search.
    */

    const useWebSearch =
      requestData.useWebSearch ===
      true;

    /*
      Build the request for the
      OpenAI Responses API.

      gpt-4.1-mini works for regular responses
      and with the web_search tool.
    */

    const openAIRequestBody = {
      model:
        "gpt-4.1-mini",

      input:
        inputMessages,

      max_output_tokens:
        1100,

      store:
        false
    };

    /*
      Add the Project 9 system prompt.
    */

    if (systemInstructions) {
      openAIRequestBody.instructions =
        systemInstructions;
    }

    /*
      Add web search only when the checkbox
      is enabled on the webpage.
    */

    if (useWebSearch) {
      openAIRequestBody.tools = [
        {
          type:
            "web_search",

          search_context_size:
            "low"
        }
      ];

      /*
        The model may decide whether a web
        search is useful for the question.
      */

      openAIRequestBody.tool_choice =
        "auto";
    }

    /*
      Send the request to OpenAI.
    */

    let openAIResponse;

    try {
      openAIResponse =
        await fetch(
          "https://api.openai.com/v1/responses",
          {
            method:
              "POST",

            headers: {
              Authorization:
                `Bearer ${env.OPENAI_API_KEY}`,

              "Content-Type":
                "application/json"
            },

            body:
              JSON.stringify(
                openAIRequestBody
              )
          }
        );
    } catch (error) {
      return jsonResponse(
        {
          error: {
            message:
              "The Worker could not connect to OpenAI. Please try again."
          }
        },
        502,
        corsHeaders
      );
    }

    /*
      Convert the OpenAI response to JSON.
    */

    const data =
      await openAIResponse
        .json()
        .catch(() => ({
          error: {
            message:
              "OpenAI returned an unreadable response."
          }
        }));

    /*
      Return any OpenAI API errors to script.js.
    */

    if (!openAIResponse.ok) {
      return jsonResponse(
        data,
        openAIResponse.status,
        corsHeaders
      );
    }

    /*
      Find the assistant message inside
      the Responses API output array.
    */

    const assistantMessage =
      data.output?.find(
        (item) =>
          item.type ===
            "message" &&
          item.role ===
            "assistant"
      );

    /*
      A response can contain one or more
      output_text items.
    */

    const outputTextItems =
      assistantMessage
        ?.content
        ?.filter(
          (item) =>
            item.type ===
            "output_text"
        ) || [];

    /*
      Combine all returned text.
    */

    const assistantText =
      outputTextItems
        .map(
          (item) =>
            item.text || ""
        )
        .join("\n")
        .trim();

    if (!assistantText) {
      return jsonResponse(
        {
          error: {
            message:
              "The AI response did not contain any text."
          }
        },
        502,
        corsHeaders
      );
    }

    /*
      Collect website citations returned
      by OpenAI web search.

      script.js expects citations in this format:

      {
        type: "url_citation",
        url_citation: {
          url: "...",
          title: "..."
        }
      }
    */

    const annotations =
      outputTextItems.flatMap(
        (item) => {
          if (
            !Array.isArray(
              item.annotations
            )
          ) {
            return [];
          }

          return item.annotations
            .filter(
              (annotation) =>
                annotation.type ===
                  "url_citation" &&
                annotation.url
            )
            .map(
              (annotation) => ({
                type:
                  "url_citation",

                url_citation: {
                  url:
                    annotation.url,

                  title:
                    annotation.title ||
                    "Source",

                  start_index:
                    annotation.start_index,

                  end_index:
                    annotation.end_index
                }
              })
            );
        }
      );

    /*
      Convert the Responses API result into
      the same structure that your Project 9
      script.js already expects.

      Because of this conversion, you do not
      need to change script.js.
    */

    return jsonResponse(
      {
        choices: [
          {
            message: {
              role:
                "assistant",

              content:
                assistantText,

              annotations:
                annotations
            }
          }
        ],

        response_id:
          data.id,

        model:
          data.model
      },
      200,
      corsHeaders
    );
  }
};

/*
  Helper function used to create
  JSON responses.
*/

function jsonResponse(
  data,
  status,
  headers
) {
  return new Response(
    JSON.stringify(data),
    {
      status:
        status,

      headers:
        headers
    }
  );
}