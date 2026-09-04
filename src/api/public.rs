use axum::{
    extract::{Path, State},
    Json,
};
use chrono::{Duration, Utc};
use serde_json::{json, Value};
use uuid::Uuid;

use crate::{
    api::{group_workspaces, insert_event, load_tiers, load_workspace_dto, payment_to_dto, WORKSPACE_SELECT},
    error::AppError,
    maja::{InvoiceItem, RegisterRequest},
    models::{bank_display_name, InitiatePaymentRequest, Payment, PaymentDto, Settings, WorkspaceDto, WorkspaceRow},
    pricing::compute_price,
    state::AppState,
};

/// GET /api/v1/workspaces — active workspaces for the customer home page.
pub async fn list_workspaces(
    State(state): State<AppState>,
) -> Result<Json<Vec<WorkspaceDto>>, AppError> {
    let rows = sqlx::query_as::<_, WorkspaceRow>(&format!(
        "{WORKSPACE_SELECT} WHERE w.is_active = true ORDER BY w.code"
    ))
    .fetch_all(&state.pool)
    .await?;
    let tiers = load_tiers(&state.pool, None).await?;
    Ok(Json(group_workspaces(rows, tiers)))
}

/// GET /api/v1/workspaces/{code}
pub async fn get_workspace(
    State(state): State<AppState>,
    Path(code): Path<String>,
) -> Result<Json<WorkspaceDto>, AppError> {
    Ok(Json(load_workspace_dto(&state.pool, &code).await?))
}

/// GET /api/v1/workspaces/{code}/open-payment — resume support: the open
/// (issued, unexpired) VA for a workspace, if any.
pub async fn open_payment(
    State(state): State<AppState>,
    Path(workspace_code): Path<String>,
) -> Result<Json<Option<PaymentDto>>, AppError> {
    let payment = sqlx::query_as::<_, Payment>(
        "SELECT p.* FROM payments p JOIN bookings b ON b.code = p.booking_code \
         WHERE b.workspace_code = $1 AND p.status = 'issued' AND p.inactive_date > now() \
         ORDER BY p.created_at DESC LIMIT 1",
    )
    .bind(&workspace_code)
    .fetch_optional(&state.pool)
    .await?;
    match payment {
        Some(p) => Ok(Json(Some(payment_to_dto(&state.pool, &p).await?))),
        None => Ok(Json(None)),
    }
}

/// POST /api/v1/payments/initiate — create booking + payment, register a MAJA
/// VA. Reuses an existing open VA instead of creating a double invoice.
pub async fn initiate_payment(
    State(state): State<AppState>,
    Json(body): Json<InitiatePaymentRequest>,
) -> Result<Json<PaymentDto>, AppError> {
    if body.hours <= 0 {
        return Err(AppError::bad_request("durasi tidak valid"));
    }
    if bank_display_name(&body.bank_code).is_none() {
        return Err(AppError::bad_request(format!(
            "bank tidak didukung: {}",
            body.bank_code
        )));
    }
    let workspace = load_workspace_dto(&state.pool, &body.workspace_code).await?;
    if !workspace.row.is_active {
        return Err(AppError::bad_request("workspace tidak aktif"));
    }

    // Resume: reuse an existing issued (unexpired) VA for this workspace.
    let existing = sqlx::query_as::<_, Payment>(
        "SELECT p.* FROM payments p JOIN bookings b ON b.code = p.booking_code \
         WHERE b.workspace_code = $1 AND p.status = 'issued' AND p.inactive_date > now() \
         ORDER BY p.created_at DESC LIMIT 1",
    )
    .bind(&body.workspace_code)
    .fetch_optional(&state.pool)
    .await?;
    if let Some(p) = existing {
        return Ok(Json(payment_to_dto(&state.pool, &p).await?));
    }

    // Server-side pricing: tier or hourly fallback + PPN 11% + VA admin fee.
    let price = compute_price(&workspace.tiers, workspace.row.hourly_rate, body.hours)
        .ok_or_else(|| AppError::bad_request("durasi tidak valid"))?;

    let now = Utc::now();
    let code = booking_code();
    let end_at = now + Duration::hours(i64::from(body.hours));
    let inactive = now + Duration::hours(24);

    let mut tx = state.pool.begin().await?;
    sqlx::query(
        "INSERT INTO bookings (code, workspace_code, start_at, end_at, status, hold_until, total) \
         VALUES ($1, $2, $3, $4, 'pending', $5, $6)",
    )
    .bind(&code)
    .bind(&body.workspace_code)
    .bind(now)
    .bind(end_at)
    .bind(inactive)
    .bind(price.total)
    .execute(&mut *tx)
    .await?;

    let payment_id: Uuid = sqlx::query_scalar(
        "INSERT INTO payments (booking_code, status, hours, subtotal, tax_amount, admin_fee, amount, bank_code) \
         VALUES ($1, 'draft', $2, $3, $4, $5, $6, $7) RETURNING id",
    )
    .bind(&code)
    .bind(body.hours)
    .bind(price.subtotal)
    .bind(price.tax)
    .bind(price.admin_fee)
    .bind(price.total)
    .bind(&body.bank_code)
    .fetch_one(&mut *tx)
    .await?;

    // MAJA register → VA. On failure the transaction rolls back (booking stays
    // clean) and the error surfaces to the customer for a retry.
    let register = RegisterRequest {
        name: "Walk-in Customer".to_string(),
        email: state.maja.customer_email.clone(),
        phone: None,
        number: code.clone(),
        amount: price.total as f64,
        inactive_date: Some(inactive.format("%Y-%m-%d %H:%M:%S").to_string()),
        items: vec![InvoiceItem {
            description: format!("{} — {} jam", workspace.row.name, body.hours),
            qty: 1,
            unit_price: price.total as f64,
            amount: price.total as f64,
        }],
        payment_method: body.bank_code.clone(),
    };
    let data = state.maja.register(&register).await?;

    let invoice_number = value_to_string(Some(&data.number));
    sqlx::query(
        "UPDATE payments SET status = 'issued', maja_invoice_id = $1, invoice_number = $2, va = $3, \
         payment_method = $4, inactive_date = $5, updated_at = now() WHERE id = $6",
    )
    .bind(data.id.map(|i| i.to_string()))
    .bind(&invoice_number)
    .bind(&data.va)
    .bind(&body.bank_code)
    .bind(inactive)
    .bind(payment_id)
    .execute(&mut *tx)
    .await?;

    insert_event(
        &mut *tx,
        Some(payment_id),
        &code,
        "issued",
        Some("system"),
        Some("MAJA register sukses"),
        None,
    )
    .await?;
    tx.commit().await?;

    let payment = sqlx::query_as::<_, Payment>("SELECT * FROM payments WHERE id = $1")
        .bind(payment_id)
        .fetch_one(&state.pool)
        .await?;
    Ok(Json(payment_to_dto(&state.pool, &payment).await?))
}

/// GET /api/v1/payments/{id} — polling endpoint used while the VA screen is open.
pub async fn get_payment(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<PaymentDto>, AppError> {
    let payment = sqlx::query_as::<_, Payment>("SELECT * FROM payments WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or(AppError::NotFound)?;
    Ok(Json(payment_to_dto(&state.pool, &payment).await?))
}

/// POST /api/v1/payments/{id}/inquiry — "Saya sudah bayar" → MAJA inquiry.
pub async fn inquiry_payment(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<PaymentDto>, AppError> {
    let payment = sqlx::query_as::<_, Payment>("SELECT * FROM payments WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or(AppError::NotFound)?;
    if payment.status != "issued" && payment.status != "draft" {
        return Err(AppError::bad_request(format!(
            "payment berstatus {}",
            payment.status
        )));
    }
    let (va, invoice_number) = match (&payment.va, &payment.invoice_number) {
        (Some(va), Some(inv)) => (va.clone(), inv.clone()),
        _ => return Err(AppError::bad_request("payment belum memiliki VA")),
    };

    let data = state.maja.inquiry(&va, &invoice_number).await?;
    if data.paid == Some(true) {
        sqlx::query(
            "UPDATE payments SET status = 'paid', paid_at = now(), paid_amount = $2, \
             remaining_amount = $3, updated_at = now() WHERE id = $1",
        )
        .bind(payment.id)
        .bind(data.amount.map(|a| a.round() as i64))
        .bind(data.remaining_amount.map(|r| r.round() as i64))
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
            Some("inquiry"),
            Some("MAJA inquiry: lunas"),
            None,
        )
        .await?;
    }

    let payment = sqlx::query_as::<_, Payment>("SELECT * FROM payments WHERE id = $1")
        .bind(payment.id)
        .fetch_one(&state.pool)
        .await?;
    Ok(Json(payment_to_dto(&state.pool, &payment).await?))
}

/// POST /api/v1/payments/{id}/cancel — cancel an unpaid invoice (MAJA cancel).
pub async fn cancel_payment(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    let payment = sqlx::query_as::<_, Payment>("SELECT * FROM payments WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or(AppError::NotFound)?;

    match payment.status.as_str() {
        "paid" => return Err(AppError::bad_request("payment sudah dibayar")),
        "cancelled" => return Ok(Json(json!({ "cancelledAt": payment.updated_at }))),
        _ => {}
    }

    // MAJA cancel (best-effort; already-cancelled responses count as success).
    if let (Some(va), Some(inv)) = (&payment.va, &payment.invoice_number) {
        state.maja.cancel(va, inv).await?;
    }

    sqlx::query("UPDATE payments SET status = 'cancelled', updated_at = now() WHERE id = $1")
        .bind(payment.id)
        .execute(&state.pool)
        .await?;
    sqlx::query(
        "UPDATE bookings SET status = 'cancelled', updated_at = now() \
         WHERE code = $1 AND status IN ('pending', 'confirmed')",
    )
    .bind(&payment.booking_code)
    .execute(&state.pool)
    .await?;
    insert_event(
        &state.pool,
        Some(payment.id),
        &payment.booking_code,
        "cancelled",
        Some("customer"),
        Some("Dibatalkan oleh customer"),
        None,
    )
    .await?;

    Ok(Json(json!({ "cancelledAt": Utc::now() })))
}

/// GET /api/v1/public/settings — venue name + Wi-Fi (hidden when disabled).
pub async fn public_settings(
    State(state): State<AppState>,
) -> Result<Json<Value>, AppError> {
    let s = sqlx::query_as::<_, Settings>("SELECT * FROM settings WHERE id = 1")
        .fetch_one(&state.pool)
        .await?;
    let (wifi_ssid, wifi_password) = if s.show_wifi_to_customer {
        (s.wifi_ssid, s.wifi_password)
    } else {
        (String::new(), String::new())
    };
    Ok(Json(json!({
        "venueName": s.venue_name,
        "wifiSsid": wifi_ssid,
        "wifiPassword": wifi_password,
        "showWifiToCustomer": s.show_wifi_to_customer,
    })))
}

/// Booking code = MAJA invoice number (reconciliation anchor).
fn booking_code() -> String {
    let now = Utc::now();
    let rand = Uuid::new_v4().simple();
    let rand = rand.to_string();
    format!("QR{}{}", now.format("%y%m%d%H%M%S"), &rand[..6])
}

fn value_to_string(v: Option<&Value>) -> Option<String> {
    v.and_then(|v| match v {
        Value::String(s) => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        _ => None,
    })
}