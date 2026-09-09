## Penjelasan Warning dan Cara Fix

### 1. `AdminAuth` field tidak digunakan

**File:** `src/api/admin.rs:23`

```rust
pub struct AdminAuth(pub crate::models::User);
```

**Masalah:** Field `User` tidak pernah dibaca/digunakan setelah di-extract.

**Fix:** Tambahkan `#[allow(dead_code)]` atau gunakan field tersebut:

```rust
// Opsi 1: Prefixed with underscore
pub struct AdminAuth(pub crate::models::User);

impl AdminAuth {
    pub fn user_id(&self) -> Uuid {
        self.0.id
    }
}
```

---

### 2. `Forbidden` variant tidak pernah dipakai

**File:** `src/error.rs:12`

```rust
pub enum AppError {
    Unauthorized,
    Forbidden,  // ← Tidak pernah dipakai
    NotFound,
    ...
}
```

**Fix:** Hapus variant yang tidak digunakan atau tambahkan prefix underscore:

```rust
pub enum AppError {
    Unauthorized,
    #[allow(dead_code)]
    Forbidden,
    NotFound,
    ...
}
```

---

### 3. Field tidak digunakan di `RegisterResponse`

**File:** `src/maja.rs:216`

```rust
pub struct RegisterResponse {
    pub success: Option<bool>,  // ← Tidak digunakan
}
```

**Fix:** Hapus field atau tambahkan `#[allow(dead_code)]`

---

### 4. Field tidak digunakan di `RegisterData`

**File:** `src/maja.rs:232`

```rust
pub struct RegisterData {
    pub inactive_date: Option<String>,  // ← Tidak digunakan
    pub amount: Option<f64>,           // ← Tidak digunakan
    pub paid: Option<bool>,             // ← Tidak digunakan
}
```

**Fix:** Hapus field atau tambahkan `#[allow(dead_code)]`

---

### 5. `Booking` struct tidak pernah dipakai

**File:** `src/models.rs:100`

```rust
pub struct Booking {  // ← Tidak pernah dipakai
    pub id: Uuid,
    ...
}
```

**Fix:** Hapus struct atau tambahkan `#[allow(dead_code)]`

---

### 6. Field tidak digunakan di `Payment`

**File:** `src/models.rs:118`

```rust
pub struct Payment {
    pub maja_invoice_id: Option<String>,  // ← Tidak digunakan
    pub payment_method: Option<String>,    // ← Tidak digunakan
    pub paid_amount: Option<i64>,          // ← Tidak digunakan
    pub remaining_amount: Option<i64>,     // ← Tidak digunakan
    pub bank_code: Option<String>,         // ← Tidak digunakan
    pub channel: Option<String>,           // ← Tidak digunakan
    pub raw_callback: Option<serde_json::Value>,  // ← Tidak digunakan
}
```

**Fix:** Hapus field atau tambahkan `#[allow(dead_code)]`

---

### 7. `PaymentEvent` struct tidak pernah dipakai

**File:** `src/models.rs:164`

```rust
pub struct PaymentEvent {  // ← Tidak pernah dipakai
    ...
}
```

**Fix:** Hapus struct atau tambahkan `#[allow(dead_code)]`

---

## Quick Fix (Menggunakan Underscore Prefix)

Tambahkan `#[allow(dead_code)]` di atas struct yang tidak digunakan:

```rust
#[allow(dead_code)]
pub struct Booking {
    ...
}

#[allow(dead_code)]
pub struct PaymentEvent {
    ...
}
```

---

**Toggle ke Act mode** untuk implementasikan fix ini?