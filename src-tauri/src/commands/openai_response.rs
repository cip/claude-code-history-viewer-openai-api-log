use reqwest::{redirect::Policy, Client, RequestBuilder, StatusCode};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;

const OPENAI_API_BASE: &str = "https://api.openai.com/v1";
const MAX_INPUT_ITEMS: usize = 10_000;
const MAX_INPUT_ITEM_PAGES: usize = 100;
const RESPONSE_INCLUDES: [(&str, &str); 8] = [
    ("include[]", "file_search_call.results"),
    ("include[]", "web_search_call.results"),
    ("include[]", "web_search_call.action.sources"),
    ("include[]", "message.input_image.image_url"),
    ("include[]", "computer_call_output.output.image_url"),
    ("include[]", "code_interpreter_call.outputs"),
    ("include[]", "reasoning.encrypted_content"),
    ("include[]", "message.output_text.logprobs"),
];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenAIResponseBundle {
    pub response: Value,
    pub input_items: Vec<Value>,
    pub input_items_complete: bool,
}

#[derive(Debug, Deserialize)]
struct InputItemsPage {
    data: Vec<Value>,
    has_more: bool,
    last_id: Option<String>,
}

fn validate_response_id(value: &str) -> Result<String, String> {
    let response_id = value.trim();
    let suffix = response_id.strip_prefix("resp_").unwrap_or("");
    if response_id.len() > 255
        || suffix.is_empty()
        || !suffix
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
    {
        return Err("openai_response_invalid_id".to_string());
    }
    Ok(response_id.to_string())
}

fn error_for_status(status: StatusCode) -> String {
    if status == StatusCode::UNAUTHORIZED || status == StatusCode::FORBIDDEN {
        "openai_auth_failed".to_string()
    } else if status == StatusCode::NOT_FOUND {
        "openai_response_unavailable".to_string()
    } else if status == StatusCode::TOO_MANY_REQUESTS {
        "openai_rate_limited".to_string()
    } else if status.is_server_error() {
        "openai_service_unavailable".to_string()
    } else {
        "openai_request_failed".to_string()
    }
}

async fn send_openai_json(request: RequestBuilder) -> Result<Value, String> {
    let response = request
        .send()
        .await
        .map_err(|_| "openai_network_error".to_string())?;
    if !response.status().is_success() {
        return Err(error_for_status(response.status()));
    }
    response
        .json::<Value>()
        .await
        .map_err(|_| "openai_invalid_json".to_string())
}

fn with_response_includes(request: RequestBuilder) -> RequestBuilder {
    request.query(&RESPONSE_INCLUDES)
}

/// Retrieve one stored Response and its input items. The key is sent only to the
/// fixed `OpenAI` API origin, through an Authorization header, and is never logged
/// or included in a returned error.
pub async fn retrieve_openai_response(
    response_id: String,
    api_key: String,
) -> Result<OpenAIResponseBundle, String> {
    let response_id = validate_response_id(&response_id)?;
    let api_key = api_key.trim();
    if api_key.is_empty() {
        return Err("openai_api_key_required".to_string());
    }

    let client = Client::builder()
        .timeout(Duration::from_secs(60))
        .redirect(Policy::none())
        .build()
        .map_err(|_| "openai_network_error".to_string())?;

    let response_url = format!("{OPENAI_API_BASE}/responses/{response_id}");
    let response = send_openai_json(with_response_includes(
        client.get(response_url).bearer_auth(api_key),
    ))
    .await?;
    if !response.is_object() {
        return Err("openai_invalid_json".to_string());
    }

    let items_url = format!("{OPENAI_API_BASE}/responses/{response_id}/input_items");
    let mut input_items = Vec::new();
    let mut after: Option<String> = None;
    let mut input_items_complete = true;

    for page_number in 0..MAX_INPUT_ITEM_PAGES {
        let request = client
            .get(&items_url)
            .bearer_auth(api_key)
            .query(&[("limit", "100"), ("order", "asc")]);
        let mut request = with_response_includes(request);
        if let Some(cursor) = after.as_deref() {
            request = request.query(&[("after", cursor)]);
        }

        let page_value = send_openai_json(request).await?;
        let page: InputItemsPage = serde_json::from_value(page_value)
            .map_err(|_| "openai_input_items_error".to_string())?;
        let remaining = MAX_INPUT_ITEMS.saturating_sub(input_items.len());
        let page_was_truncated = page.data.len() > remaining;
        input_items.extend(page.data.into_iter().take(remaining));

        if page_was_truncated {
            input_items_complete = false;
            break;
        }
        if !page.has_more {
            break;
        }
        if input_items.len() >= MAX_INPUT_ITEMS || page_number + 1 >= MAX_INPUT_ITEM_PAGES {
            input_items_complete = false;
            break;
        }

        let next_cursor = page
            .last_id
            .ok_or_else(|| "openai_pagination_error".to_string())?;
        if after.as_deref() == Some(next_cursor.as_str()) {
            return Err("openai_pagination_error".to_string());
        }
        after = Some(next_cursor);
    }

    Ok(OpenAIResponseBundle {
        response,
        input_items,
        input_items_complete,
    })
}

#[tauri::command(rename_all = "camelCase")]
pub async fn load_openai_response(
    response_id: String,
    api_key: String,
) -> Result<OpenAIResponseBundle, String> {
    retrieve_openai_response(response_id, api_key).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_only_response_ids_without_path_characters() {
        assert_eq!(
            validate_response_id("resp_test_123-abc").unwrap(),
            "resp_test_123-abc"
        );
        for invalid in ["", "resp_", "resp_test/other", "resp_test?x=1", "other_123"] {
            assert!(validate_response_id(invalid).is_err(), "{invalid}");
        }
    }

    #[test]
    fn maps_api_statuses_without_echoing_response_bodies() {
        assert_eq!(
            error_for_status(StatusCode::UNAUTHORIZED),
            "openai_auth_failed"
        );
        assert_eq!(
            error_for_status(StatusCode::FORBIDDEN),
            "openai_auth_failed"
        );
        assert_eq!(
            error_for_status(StatusCode::NOT_FOUND),
            "openai_response_unavailable"
        );
        assert_eq!(
            error_for_status(StatusCode::TOO_MANY_REQUESTS),
            "openai_rate_limited"
        );
        assert_eq!(
            error_for_status(StatusCode::INTERNAL_SERVER_ERROR),
            "openai_service_unavailable"
        );
    }

    #[test]
    fn input_item_fixture_keeps_roles_tool_results_and_structured_content() {
        let fixture = serde_json::json!({
            "data": [
                {
                    "type": "message",
                    "role": "developer",
                    "content": [{"type": "input_text", "text": "Use the tool when needed."}]
                },
                {
                    "type": "function_call_output",
                    "call_id": "call_fixture",
                    "output": {"ok": true, "count": 2}
                }
            ],
            "has_more": false,
            "first_id": "item_1",
            "last_id": "item_2"
        });
        let page: InputItemsPage = serde_json::from_value(fixture.clone()).unwrap();
        assert_eq!(page.data, fixture["data"].as_array().unwrap().clone());
        assert!(!page.has_more);
        assert_eq!(page.last_id.as_deref(), Some("item_2"));
    }

    #[test]
    fn bundle_serializes_frontend_field_names() {
        let bundle = OpenAIResponseBundle {
            response: serde_json::json!({"id": "resp_fixture"}),
            input_items: vec![serde_json::json!({"type": "message", "role": "user"})],
            input_items_complete: false,
        };
        let json = serde_json::to_value(bundle).unwrap();
        assert!(json.get("inputItems").is_some());
        assert_eq!(json["inputItemsComplete"], false);
    }
}
