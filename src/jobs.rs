use std::time::Duration;

use crate::{api::insert_event, error::AppError, models::Payment, state::AppState};

/// Spawn the three scheduled jobs (state-machine docs §4).
pub fn spawn(state: AppState) {
    tokio::spawn(expire_pending(state.clone()));
    tokio::spawn(reconcile_open_vas(state.clone()));
    tokio::spawn(complete_sessions(state.clone()));
}

/// Every minute: cancel issued payments past `inactiveDate` + 5 min grace.
async fn expire_pending(state: AppState) {
    let mut interval = tokio::time::interval(Duration::from_secs(60));
    loop {
        interval.tick().await;
        if let Err(err) = expire_pending_once(&state).await {
            tracing::warn!(error = ?err, "job expire_pending gagal");
        }
    }
}

async fn expire_pending_once(state: &AppState) -> Result<(), AppError> {
    let rows = sqlx::query_as::<_, Payment>(
        "SELECT p.* FROM payments p JOIN bookings b ON b.code = p.booking_code \
         WHERE p.status = 'issued' AND p.inactive_date < now() - interval '5 minutes' LIMIT 50",
    )
    .fetch_all(&state.pool)
    .await?;

    for payment in rows {
        // Best-effort MAJA cancel (idempotent responses count as success).
        if state.maja.configured() {
            if let (Some(va), Some(inv)) = (&payment.va, &payment.invoice_number) {
                if let Err(err) = state.maja.cancel(va, inv).await {
                    tracing::warn!(payment = %payment.id, error = ?err, "MAJA cancel gagal saat expire");
                }
            }
        }
        sqlx::query("UPDATE payments SET status = 'cancelled', updated_at = now() WHERE id = $1 AND status = 'issued'")
            .bind(payment.id)
            .execute(&state.pool)
            .await?;
        sqlx::query("UPDATE bookings SET status = 'cancelled', updated_at = now() WHERE code = $1")
            .bind(&payment.booking_code)
            .execute(&state.pool)
            .await?;
        insert_event(
            &state.pool,
            Some(payment.id),
            &payment.booking_code,
            "cancelled",
            Some("cron"),
            Some("VA kedaluwarsa (grace 5 menit)"),
            None,
        )
        .await?;
    }
    Ok(())
}

/// Hourly: inquiry on issued payments older than 30 min with no notification —
/// heal if paid (webhook was lost), otherwise leave for expiry.
async fn reconcile_open_vas(state: AppState) {
    let mut interval = tokio::time::interval(Duration::from_secs(3600));
    loop {
        interval.tick().await;
        if let Err(err) = reconcile_once(&state).await {
            tracing::warn!(error = ?err, "job reconcile_open_vas gagal");
        }
    }
}

async fn reconcile_once(state: &AppState) -> Result<(), AppError> {
    if !state.maja.configured() {
        return Ok(());
    }
    let rows = sqlx::query_as::<_, Payment>(
        "SELECT * FROM payments WHERE status = 'issued' \
         AND created_at < now() - interval '30 minutes' LIMIT 50",
    )
    .fetch_all(&state.pool)
    .await?;

    for payment in rows {
        let (Some(va), Some(inv)) = (&payment.va, &payment.invoice_number) else {
            continue;
        };
        let Ok(data) = state.maja.inquiry(va, inv).await else {
            continue;
        };
        if data.paid != Some(true) {
            continue;
        }
        sqlx::query(
            "UPDATE payments SET status = 'paid', paid_at = now(), paid_amount = $2, \
             remaining_amount = $3, updated_at = now() WHERE id = $1 AND status = 'issued'",
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
            Some("cron"),
            Some("Reconcile: webhook hilang, inquiry menemukan pembayaran"),
            None,
        )
        .await?;
        tracing::info!(booking = %payment.booking_code, "reconcile: payment lunas (webhook hilang)");
    }
    Ok(())
}

/// Every 5 minutes: mark confirmed bookings past their end time as completed.
async fn complete_sessions(state: AppState) {
    let mut interval = tokio::time::interval(Duration::from_secs(300));
    loop {
        interval.tick().await;
        if let Err(err) = complete_once(&state).await {
            tracing::warn!(error = ?err, "job complete_sessions gagal");
        }
    }
}

async fn complete_once(state: &AppState) -> Result<(), AppError> {
    let rows: Vec<(String,)> = sqlx::query_as(
        "UPDATE bookings SET status = 'completed', updated_at = now() \
         WHERE status = 'confirmed' AND end_at < now() RETURNING code",
    )
    .fetch_all(&state.pool)
    .await?;
    for (code,) in rows {
        insert_event(
            &state.pool,
            None,
            &code,
            "completed",
            Some("cron"),
            Some("Sesi selesai (end_at terlewati)"),
            None,
        )
        .await?;
    }
    Ok(())
}