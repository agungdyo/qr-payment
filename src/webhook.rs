use axum::{extract::State, http::StatusCode, Json};
use serde_json::{json, Value};

use crate::{
    api::insert_event,
    error::AppError,
    models::Payment,
    state::AppState,
};

/// POST /api/v1/payments/callback — MAJA payment notification.
///
/// Matches by invoice number (or MAJA invoice id), is idempotent (a second
/// delivery of the same paid notification is a no-op that still returns 200),
/// and follows the state machine: full payment → payment `paid` + booking
/// `confirmed`; partial (`remainingAmount > 0`) stays `issued`.
pub async fn payment_callback(
    State(state): State<AppState>,
    Json(raw): Json<Value>,
) -> Result<(StatusCode, Json<Value>), AppError> {
    let number = value_to_string(raw.get("number"));
    let maja_id = value_to_string(raw.get("id"));
    let code = raw.get("code").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let remaining = value_to_f64(raw.get("remainingAmount"));
    let amount_paid = value_to_f64(raw.get("amount"));
    let bank_code = raw.get("bankCode").and_then(|v| v.as_str()).map(String::from);
    let channel = raw.get("channel").and_then(|v| v.as_str()).map(String::from);
    let ref_code = raw.get("ref").and_then(|v| v.as_str()).map(String::from);

    let payment = sqlx::query_as::<_, Payment>(
        "SELECT * FROM payments WHERE invoice_number = $1 OR maja_invoice_id = $2 \
         ORDER BY created_at DESC LIMIT 1",
    )
    .bind(&number)
    .bind(&maja_id)
    .fetch_optional(&state.pool)
    .await?;

    let Some(payment) = payment else {
        // Unknown invoice — acknowledge to stop retries, but alert via log.
        tracing::warn!(number = ?number, maja_id = ?maja_id, "webhook: invoice tidak dikenal");
        return Ok((
            StatusCode::OK,
            Json(json!({ "ok": true, "matched": false })),
        ));
    };

    // Idempotency: already paid → no-op.
    if payment.status == "paid" {
        return Ok((
            StatusCode::OK,
            Json(json!({ "ok": true, "matched": true, "idempotent": true })),
        ));
    }

    let fully_paid = code == "00" && remaining.unwrap_or(0.0) <= 0.0;

    if fully_paid {
        let paid_amount = amount_paid.map(|a| a.round() as i64);
        sqlx::query(
            "UPDATE payments SET status = 'paid', paid_at = now(), paid_amount = $2, \
             remaining_amount = $3, bank_code = $4, channel = $5, ref = $6, raw_callback = $7, \
             updated_at = now() WHERE id = $1",
        )
        .bind(payment.id)
        .bind(paid_amount)
        .bind(remaining.map(|r| r.round() as i64))
        .bind(&bank_code)
        .bind(&channel)
        .bind(&ref_code)
        .bind(&raw)
        .execute(&state.pool)
        .await?;

        sqlx::query("UPDATE bookings SET status = 'confirmed', updated_at = now() WHERE code = $1")
            .bind(&payment.booking_code)
            .execute(&state.pool)
            .await?;

        insert_event(
            &state.pool,
            Some(payment.id),
            &payment.booking_code,
            "paid",
            Some("maja-webhook"),
            Some("Notifikasi MAJA: pembayaran lunas"),
            Some(&raw),
        )
        .await?;

        tracing::info!(
            booking = %payment.booking_code,
            number = ?number,
            "webhook: pembayaran lunas → booking confirmed"
        );
    } else {
        // Partial payment or non-00 code — log and stay `issued`.
        sqlx::query(
            "UPDATE payments SET remaining_amount = $2, bank_code = $3, channel = $4, \
             ref = $5, raw_callback = $6, updated_at = now() WHERE id = $1",
        )
        .bind(payment.id)
        .bind(remaining.map(|r| r.round() as i64))
        .bind(&bank_code)
        .bind(&channel)
        .bind(&ref_code)
        .bind(&raw)
        .execute(&state.pool)
        .await?;

        let note = format!("Notifikasi MAJA diterima (code={code}, remaining={remaining:?})");
        insert_event(
            &state.pool,
            Some(payment.id),
            &payment.booking_code,
            "issued",
            Some("maja-webhook"),
            Some(note.as_str()),
            Some(&raw),
        )
        .await?;

        tracing::info!(
            booking = %payment.booking_code,
            code = %code,
            remaining = ?remaining,
            "webhook: pembayaran belum lunas"
        );
    }

    Ok((
        StatusCode::OK,
        Json(json!({ "ok": true, "matched": true })),
    ))
}

fn value_to_string(v: Option<&Value>) -> Option<String> {
    v.and_then(|v| match v {
        Value::String(s) => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        _ => None,
    })
}

fn value_to_f64(v: Option<&Value>) -> Option<f64> {
    v.and_then(|v| v.as_f64())
}