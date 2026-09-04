pub mod admin;
pub mod public;

use std::collections::HashMap;

use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    error::AppError,
    models::{Payment, PaymentDto, RateTier, RateTierRow, WorkspaceDto, WorkspaceRow},
};

/// SELECT fragment for workspace rows (venue name comes from the single-row
/// settings table).
pub const WORKSPACE_SELECT: &str = r#"
    SELECT w.code, w.name,
           (SELECT venue_name FROM settings LIMIT 1) AS venue_name,
           w.type AS "type", w.location, w.capacity, w.description, w.is_active,
           w.hourly_rate, w.created_at, w.updated_at
    FROM workspaces w
"#;

pub async fn load_workspace_dto(pool: &PgPool, code: &str) -> Result<WorkspaceDto, AppError> {
    let row = sqlx::query_as::<_, WorkspaceRow>(&format!("{WORKSPACE_SELECT} WHERE w.code = $1"))
        .bind(code)
        .fetch_optional(pool)
        .await?
        .ok_or(AppError::NotFound)?;
    let tiers = load_tiers(pool, Some(code)).await?;
    Ok(WorkspaceDto {
        row,
        tiers: tiers.into_iter().map(rate_tier_from_row).collect(),
    })
}

pub async fn load_tiers(pool: &PgPool, code: Option<&str>) -> Result<Vec<RateTierRow>, AppError> {
    let rows = if let Some(code) = code {
        sqlx::query_as::<_, RateTierRow>(
            "SELECT workspace_code, duration_hours, label, price FROM workspace_tiers \
             WHERE workspace_code = $1 ORDER BY duration_hours",
        )
        .bind(code)
        .fetch_all(pool)
        .await?
    } else {
        sqlx::query_as::<_, RateTierRow>(
            "SELECT workspace_code, duration_hours, label, price FROM workspace_tiers \
             ORDER BY workspace_code, duration_hours",
        )
        .fetch_all(pool)
        .await?
    };
    Ok(rows)
}

pub fn rate_tier_from_row(row: RateTierRow) -> RateTier {
    RateTier {
        duration_hours: row.duration_hours,
        label: row.label,
        price: row.price,
    }
}

/// Attach tiers to workspace rows, grouped by workspace code.
pub fn group_workspaces(rows: Vec<WorkspaceRow>, tier_rows: Vec<RateTierRow>) -> Vec<WorkspaceDto> {
    let mut by_code: HashMap<String, Vec<RateTierRow>> = HashMap::new();
    for t in tier_rows {
        by_code.entry(t.workspace_code.clone()).or_default().push(t);
    }
    rows.into_iter()
        .map(|row| {
            let mut tiers: Vec<RateTier> = by_code
                .remove(&row.code)
                .unwrap_or_default()
                .into_iter()
                .map(rate_tier_from_row)
                .collect();
            tiers.sort_by_key(|t| t.duration_hours);
            WorkspaceDto { row, tiers }
        })
        .collect()
}

/// Build the frontend `Payment` DTO from a stored payment row.
pub async fn payment_to_dto(pool: &PgPool, payment: &Payment) -> Result<PaymentDto, AppError> {
    let (workspace_code, workspace_name) = sqlx::query_as::<_, (String, String)>(
        "SELECT w.code, w.name FROM bookings b JOIN workspaces w ON w.code = b.workspace_code \
         WHERE b.code = $1",
    )
    .bind(&payment.booking_code)
    .fetch_one(pool)
    .await?;

    Ok(PaymentDto {
        id: payment.id,
        booking_code: payment.booking_code.clone(),
        workspace_code,
        workspace_name,
        hours: payment.hours,
        subtotal: payment.subtotal,
        tax: payment.tax_amount,
        admin_fee: payment.admin_fee,
        total: payment.amount,
        bank_code: payment.bank_code.clone(),
        bank_name: payment
            .bank_code
            .as_deref()
            .and_then(crate::models::bank_display_name)
            .map(String::from),
        va: payment.va.clone(),
        status: payment.status.clone(),
        created_at: payment.created_at,
        inactive_date: payment.inactive_date,
        paid_at: payment.paid_at,
        r#ref: payment.r#ref.clone(),
    })
}

/// Append-only audit log row. Works with both a pool and a transaction.
pub async fn insert_event<'e, E>(
    executor: E,
    payment_id: Option<Uuid>,
    booking_code: &str,
    status: &str,
    actor: Option<&str>,
    note: Option<&str>,
    raw: Option<&serde_json::Value>,
) -> Result<(), AppError>
where
    E: sqlx::Executor<'e, Database = sqlx::Postgres>,
{
    sqlx::query(
        "INSERT INTO payment_events (payment_id, booking_code, status, actor, note, raw_payload) \
         VALUES ($1, $2, $3, $4, $5, $6)",
    )
    .bind(payment_id)
    .bind(booking_code)
    .bind(status)
    .bind(actor)
    .bind(note)
    .bind(raw)
    .execute(executor)
    .await?;
    Ok(())
}