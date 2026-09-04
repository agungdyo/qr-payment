use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

// ---------------------------------------------------------------------------
// Database rows / DTOs
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct User {
    pub id: Uuid,
    pub keycloak_sub: String,
    pub username: String,
    pub name: Option<String>,
    pub email: Option<String>,
    pub created_at: DateTime<Utc>,
}

/// Workspace row joined with the single-row venue settings for `venue_name`.
#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceRow {
    pub code: String,
    pub name: String,
    pub venue_name: String,
    #[serde(rename = "type")]
    #[sqlx(rename = "type")]
    pub workspace_type: String,
    pub location: Option<String>,
    pub capacity: i32,
    pub description: Option<String>,
    pub is_active: bool,
    pub hourly_rate: i64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Tier row as stored (includes the workspace key for grouping).
#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct RateTierRow {
    pub workspace_code: String,
    pub duration_hours: i32,
    pub label: Option<String>,
    pub price: i64,
}

/// Tier DTO exposed over the API (frontend `RateTier` shape).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RateTier {
    pub duration_hours: i32,
    pub label: Option<String>,
    pub price: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceDto {
    #[serde(flatten)]
    pub row: WorkspaceRow,
    pub tiers: Vec<RateTier>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Locker {
    pub id: Uuid,
    pub code: String,
    pub location: Option<String>,
    pub status: String,
    pub note: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub id: i32,
    pub venue_name: String,
    pub wifi_ssid: String,
    pub wifi_password: String,
    pub show_wifi_to_customer: bool,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsInput {
    pub venue_name: String,
    pub wifi_ssid: String,
    pub wifi_password: String,
    pub show_wifi_to_customer: bool,
}

#[derive(Debug, Clone, FromRow)]
pub struct Booking {
    pub id: Uuid,
    pub code: String,
    pub workspace_code: String,
    pub start_at: DateTime<Utc>,
    pub end_at: DateTime<Utc>,
    pub status: String,
    pub hold_until: Option<DateTime<Utc>>,
    pub total: i64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, FromRow)]
pub struct Payment {
    pub id: Uuid,
    pub booking_code: String,
    pub status: String,
    pub maja_invoice_id: Option<String>,
    pub invoice_number: Option<String>,
    pub va: Option<String>,
    pub payment_method: Option<String>,
    pub hours: i32,
    pub subtotal: i64,
    pub tax_amount: i64,
    pub admin_fee: i64,
    pub amount: i64,
    pub paid_amount: Option<i64>,
    pub remaining_amount: Option<i64>,
    pub bank_code: Option<String>,
    pub channel: Option<String>,
    pub r#ref: Option<String>,
    pub inactive_date: Option<DateTime<Utc>>,
    pub paid_at: Option<DateTime<Utc>>,
    pub raw_callback: Option<serde_json::Value>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Payment DTO exposed over the API (frontend `Payment` shape).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaymentDto {
    pub id: Uuid,
    pub booking_code: String,
    pub workspace_code: String,
    pub workspace_name: String,
    pub hours: i32,
    pub subtotal: i64,
    pub tax: i64,
    pub admin_fee: i64,
    pub total: i64,
    pub bank_code: Option<String>,
    pub bank_name: Option<String>,
    pub va: Option<String>,
    pub status: String,
    pub created_at: DateTime<Utc>,
    pub inactive_date: Option<DateTime<Utc>>,
    pub paid_at: Option<DateTime<Utc>>,
    pub r#ref: Option<String>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct PaymentEvent {
    pub id: Uuid,
    pub payment_id: Option<Uuid>,
    pub booking_code: String,
    pub status: String,
    pub actor: Option<String>,
    pub note: Option<String>,
    pub raw_payload: Option<serde_json::Value>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminStats {
    pub workspace_total: i64,
    pub workspace_active: i64,
    pub locker_total: i64,
    pub locker_available: i64,
    pub payment_paid_total: i64,
    pub payment_pending_total: i64,
}

// ---------------------------------------------------------------------------
// Request payloads
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceInput {
    pub name: String,
    #[serde(rename = "type")]
    pub workspace_type: String,
    pub location: Option<String>,
    pub capacity: i32,
    pub description: Option<String>,
    pub is_active: bool,
    pub hourly_rate: i64,
    pub tiers: Vec<RateTier>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceCreateInput {
    #[serde(flatten)]
    pub input: WorkspaceInput,
    pub code: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LockerInput {
    pub code: String,
    pub location: Option<String>,
    pub status: String,
    pub note: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InitiatePaymentRequest {
    pub workspace_code: String,
    pub hours: i32,
    pub bank_code: String,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// MAJA payment method code → display name (mirrors frontend `lib/banks.ts`).
pub fn bank_display_name(code: &str) -> Option<&'static str> {
    let name = match code {
        "mandiri" => "Bank Mandiri",
        "bni" => "BNI 46",
        "bri" => "BRI",
        "hana" => "Keb Hana Bank",
        "cimb" => "CIMB Niaga",
        "bii" => "BII / Maybank",
        "danamon" => "Bank Danamon",
        "permata" => "Bank Permata",
        "permatasyariah" => "Bank Permata Syariah",
        "bca" => "BCA",
        "bsi" => "BSI",
        _ => return None,
    };
    Some(name)
}