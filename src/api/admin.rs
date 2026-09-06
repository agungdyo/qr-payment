use axum::{
    extract::{FromRequestParts, Path, Query, State},
    http::request::Parts,
    Json,
};
use serde::Deserialize;
use serde_json::{json, Value};
use tower_sessions::Session;
use uuid::Uuid;

use crate::{
    api::{group_workspaces, load_tiers, load_workspace_dto, payment_to_dto, WORKSPACE_SELECT},
    auth::{self, AdminAuth, AuthAdmin},
    error::AppError,
    models::{
        AdminStats, Locker, LockerInput, Payment, Settings, SettingsInput, WorkspaceCreateInput,
        WorkspaceDto, WorkspaceInput, WorkspaceRow,
    },
    state::AppState,
};

/// Extractor for admin endpoints: logged-in user required.
pub struct AdminAuth(pub auth::User);

impl FromRequestParts<AppState> for AdminAuth {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let session = Session::from_request_parts(parts, state)
            .await
            .map_err(|_| AppError::Unauthorized)?;
        let user_id: Option<Uuid> = session.get(auth::SESSION_USER_KEY).await?;
        let user_id = user_id.ok_or(AppError::Unauthorized)?;
        let user = auth::find_user(&state.pool, user_id).await?;
        Ok(AdminAuth(user))
    }
}

/// Compat alias kept for call sites that still use the old name.
pub use AdminAuth as AuthAdmin;

#[derive(Debug, Deserialize)]
pub struct ListPaymentsQuery {
    pub limit: Option<i64>,
}

/// GET /api/v1/admin/stats
pub async fn stats(
    State(state): State<AppState>,
    _auth: AdminAuth,
) -> Result<Json<AdminStats>, AppError> {
    let workspace_total: i64 =
        sqlx::query_scalar("SELECT count(*) FROM workspaces").fetch_one(&state.pool).await?;
    let workspace_active: i64 =
        sqlx::query_scalar("SELECT count(*) FROM workspaces WHERE is_active").fetch_one(&state.pool).await?;
    let locker_total: i64 =
        sqlx::query_scalar("SELECT count(*) FROM lockers").fetch_one(&state.pool).await?;
    let locker_available: i64 = sqlx::query_scalar("SELECT count(*) FROM lockers WHERE status = 'available'")
        .fetch_one(&state.pool).await?;
    let payment_paid_total: i64 = sqlx::query_scalar("SELECT count(*) FROM payments WHERE status = 'paid'")
        .fetch_one(&state.pool).await?;
    let payment_pending_total: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM payments WHERE status IN ('draft', 'issued')",
    )
    .fetch_one(&state.pool).await?;

    Ok(Json(AdminStats {
        workspace_total,
        workspace_active,
        locker_total,
        locker_available,
        payment_paid_total,
        payment_pending_total,
    }))
}

/// GET /api/v1/admin/workspaces — all workspaces (active or not) with tiers.
pub async fn list_workspaces(
    State(state): State<AppState>,
    _auth: AdminAuth,
) -> Result<Json<Vec<WorkspaceDto>>, AppError> {
    let rows = sqlx::query_as::<_, WorkspaceRow>(&format!("{WORKSPACE_SELECT} ORDER BY w.code"))
        .fetch_all(&state.pool)
        .await?;
    let tiers = load_tiers(&state.pool, None).await?;
    Ok(Json(group_workspaces(rows, tiers)))
}

/// POST /api/v1/admin/workspaces
pub async fn create_workspace(
    State(state): State<AppState>,
    _auth: AdminAuth,
    Json(input): Json<WorkspaceCreateInput>,
) -> Result<Json<WorkspaceDto>, AppError> {
    let code = input.code.trim().to_string();
    if code.is_empty() {
        return Err(AppError::bad_request("kode workspace wajib diisi"));
    }
    validate_workspace(&input.input)?;

    let mut tx = state.pool.begin().await?;
    sqlx::query(
        "INSERT INTO workspaces (code, name, type, location, capacity, description, is_active, hourly_rate) \
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
    )
    .bind(&code)
    .bind(&input.input.name)
    .bind(&input.input.workspace_type)
    .bind(&input.input.location)
    .bind(input.input.capacity)
    .bind(&input.input.description)
    .bind(input.input.is_active)
    .bind(input.input.hourly_rate)
    .execute(&mut *tx)
    .await?;
    insert_tiers(&mut tx, &code, &input.input.tiers).await?;
    tx.commit().await?;

    Ok(Json(load_workspace_dto(&state.pool, &code).await?))
}

/// PUT /api/v1/admin/workspaces/{code}
pub async fn update_workspace(
    State(state): State<AppState>,
    _auth: AdminAuth,
    Path(code): Path<String>,
    Json(input): Json<WorkspaceInput>,
) -> Result<Json<WorkspaceDto>, AppError> {
    validate_workspace(&input)?;

    let mut tx = state.pool.begin().await?;
    let updated = sqlx::query(
        "UPDATE workspaces SET name = $1, type = $2, location = $3, capacity = $4, \
         description = $5, is_active = $6, hourly_rate = $7, updated_at = now() WHERE code = $8",
    )
    .bind(&input.name)
    .bind(&input.workspace_type)
    .bind(&input.location)
    .bind(input.capacity)
    .bind(&input.description)
    .bind(input.is_active)
    .bind(input.hourly_rate)
    .bind(&code)
    .execute(&mut *tx)
    .await?;
    if updated.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    sqlx::query("DELETE FROM workspace_tiers WHERE workspace_code = $1")
        .bind(&code)
        .execute(&mut *tx)
        .await?;
    insert_tiers(&mut tx, &code, &input.tiers).await?;
    tx.commit().await?;

    Ok(Json(load_workspace_dto(&state.pool, &code).await?))
}

/// GET /api/v1/admin/lockers
pub async fn list_lockers(
    State(state): State<AppState>,
    _auth: AdminAuth,
) -> Result<Json<Vec<Locker>>, AppError> {
    let rows = sqlx::query_as::<_, Locker>("SELECT * FROM lockers ORDER BY code")
        .fetch_all(&state.pool)
        .await?;
    Ok(Json(rows))
}

/// POST /api/v1/admin/lockers
pub async fn create_locker(
    State(state): State<AppState>,
    _auth: AdminAuth,
    Json(input): Json<LockerInput>,
) -> Result<Json<Locker>, AppError> {
    if input.code.trim().is_empty() {
        return Err(AppError::bad_request("kode loker wajib diisi"));
    }
    let locker = sqlx::query_as::<_, Locker>(
        "INSERT INTO lockers (code, location, status, note) VALUES ($1, $2, $3, $4) \
         RETURNING id, code, location, status, note, created_at, updated_at",
    )
    .bind(input.code.trim())
    .bind(&input.location)
    .bind(&input.status)
    .bind(&input.note)
    .fetch_one(&state.pool)
    .await?;
    Ok(Json(locker))
}

/// PUT /api/v1/admin/lockers/{id}
pub async fn update_locker(
    State(state): State<AppState>,
    _auth: AdminAuth,
    Path(id): Path<Uuid>,
    Json(input): Json<LockerInput>,
) -> Result<Json<Locker>, AppError> {
    let locker = sqlx::query_as::<_, Locker>(
        "UPDATE lockers SET code = $1, location = $2, status = $3, note = $4, updated_at = now() \
         WHERE id = $5 RETURNING id, code, location, status, note, created_at, updated_at",
    )
    .bind(input.code.trim())
    .bind(&input.location)
    .bind(&input.status)
    .bind(&input.note)
    .bind(id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or(AppError::NotFound)?;
    Ok(Json(locker))
}

/// DELETE /api/v1/admin/lockers/{id}
pub async fn delete_locker(
    State(state): State<AppState>,
    _auth: AdminAuth,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    let deleted = sqlx::query("DELETE FROM lockers WHERE id = $1")
        .bind(id)
        .execute(&state.pool)
        .await?;
    if deleted.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(Json(json!({ "ok": true })))
}

/// GET /api/v1/admin/settings
pub async fn get_settings(
    State(state): State<AppState>,
    _auth: AdminAuth,
) -> Result<Json<Settings>, AppError> {
    let settings = sqlx::query_as::<_, Settings>("SELECT * FROM settings WHERE id = 1")
        .fetch_one(&state.pool)
        .await?;
    Ok(Json(settings))
}

/// PUT /api/v1/admin/settings
pub async fn update_settings(
    State(state): State<AppState>,
    _auth: AdminAuth,
    Json(input): Json<SettingsInput>,
) -> Result<Json<Settings>, AppError> {
    let settings = sqlx::query_as::<_, Settings>(
        "UPDATE settings SET venue_name = $1, wifi_ssid = $2, wifi_password = $3, \
         show_wifi_to_customer = $4, updated_at = now() WHERE id = 1 \
         RETURNING id, venue_name, wifi_ssid, wifi_password, show_wifi_to_customer, updated_at",
    )
    .bind(&input.venue_name)
    .bind(&input.wifi_ssid)
    .bind(&input.wifi_password)
    .bind(input.show_wifi_to_customer)
    .fetch_one(&state.pool)
    .await?;
    Ok(Json(settings))
}

/// GET /api/v1/admin/payments?limit=N — recent payments (frontend dashboard).
pub async fn list_payments(
    State(state): State<AppState>,
    _auth: AdminAuth,
    Query(query): Query<ListPaymentsQuery>,
) -> Result<Json<Vec<crate::models::PaymentDto>>, AppError> {
    let limit = query.limit.unwrap_or(8).clamp(1, 100);
    let rows = sqlx::query_as::<_, Payment>("SELECT * FROM payments ORDER BY created_at DESC LIMIT $1")
        .bind(limit)
        .fetch_all(&state.pool)
        .await?;
    let mut out = Vec::with_capacity(rows.len());
    for payment in rows {
        out.push(payment_to_dto(&state.pool, &payment).await?);
    }
    Ok(Json(out))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn validate_workspace(input: &WorkspaceInput) -> Result<(), AppError> {
    if input.name.trim().is_empty() {
        return Err(AppError::bad_request("nama workspace wajib diisi"));
    }
    if input.workspace_type != "desk" && input.workspace_type != "room" {
        return Err(AppError::bad_request("type harus desk atau room"));
    }
    if input.capacity < 1 {
        return Err(AppError::bad_request("kapasitas minimal 1"));
    }
    if input.hourly_rate < 0 {
        return Err(AppError::bad_request("harga per jam tidak boleh negatif"));
    }
    for tier in &input.tiers {
        if tier.duration_hours < 1 {
            return Err(AppError::bad_request("durasi tier minimal 1 jam"));
        }
        if tier.price < 0 {
            return Err(AppError::bad_request("harga tier tidak boleh negatif"));
        }
    }
    Ok(())
}

async fn insert_tiers(
    conn: &mut sqlx::PgConnection,
    code: &str,
    tiers: &[crate::models::RateTier],
) -> Result<(), AppError> {
    for tier in tiers {
        sqlx::query(
            "INSERT INTO workspace_tiers (workspace_code, duration_hours, label, price) \
             VALUES ($1, $2, $3, $4)",
        )
        .bind(code)
        .bind(tier.duration_hours)
        .bind(&tier.label)
        .bind(tier.price)
        .execute(&mut *conn)
        .await?;
    }
    Ok(())
}