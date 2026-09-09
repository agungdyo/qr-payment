## Penjelasan Masing-Masing Function di `src/auth.rs`

---

### 1. `pub async fn start_login(oidc: &OidcClient) -> Result<AuthStart>`
**Fungsi:** Membuat URL authorization untuk memulai login OIDC

```rust
pub async fn start_login(oidc: &OidcClient) -> Result<AuthStart>
```

**Apa yang dilakukan:**
- Mengambil OIDC client dari Keycloak
- Membuat **PKCE challenge & verifier** (untuk keamanan)
- Membuat **CSRF token** (untuk mencegah CSRF attack)
- Membuat **nonce** (untuk mencegah replay attack)
- Mengembalikan URL authorization + semua secrets

**Return:** `AuthStart { url, csrf, nonce, verifier }`

---

### 2. `pub async fn callback(...) -> Result<Redirect, AppError>`
**Fungsi:** Handler setelah user login di Keycloak (OIDC callback)

```rust
pub async fn callback(
    axum::extract::State(state): axum::extract::State<AppState>,
    session: Session,
    Query(params): Query<CallbackParams>,
) -> Result<Redirect, AppError>
```

**Apa yang dilakukan:**
1. **Cek CSRF state** - pastikan request valid
2. **Tukar authorization code** dengan access token + ID token
3. **Verify ID token** - pastikan token dari Keycloak yang valid
4. **Decode JWT payload** - extract claims termasuk roles
5. **Validasi role** - cek apakah user punya role "admin"
6. **Jika role valid** → insert user ke DB, save session, redirect `/admin`
7. **Jika role tidak valid** → clear session, redirect `/login?error=unauthorized`

---

### 3. `pub async fn logout(...) -> Redirect`
**Fungsi:** Logout user (hapus session aplikasi)

```rust
pub async fn logout(
    axum::extract::State(state): axum::extract::State<AppState>,
    session: Session,
) -> Redirect
```

**Apa yang dilakukan:**
- Flush/delete semua data session dari database
- Redirect ke halaman home (`/`)

**Catatan:** Hanya logout dari aplikasi, TIDAK logout dari Keycloak

---

### 4. `pub async fn me(...) -> Result<Json<Value>, AppError>`
**Fungsi:** Cek status user yang sedang login

```rust
pub async fn me(
    axum::extract::State(state): axum::extract::State<AppState>,
    session: Session,
) -> Result<Json<Value>, AppError>
```

**Apa yang dilakukan:**
- Cek apakah ada `user_id` di session
- Jika ada → return `{ authenticated: true, user: {...} }`
- Jika tidak ada → return `{ authenticated: false }`

**Dipakai oleh:** Frontend AuthGuard untuk cek status login

---

## Helper Functions (Private)

| Function | Fungsi |
|----------|--------|
| `find_user(...)` | Cari user di DB berdasarkan UUID |
| `upsert_user(...)` | Insert atau update user di DB |
| `clear_oidc_flow(...)` | Hapus CSRF, nonce, PKCE verifier dari session |
| `login_failed_redirect(...)` | Helper untuk redirect saat login gagal |
| `ct_eq(...)` | Constant-time string comparison (untuk keamanan) |

---

## Alur Login Lengkap:

```
1. User klik login        → start_login() → redirect Keycloak
2. User login di Keycloak → callback() → validasi role + insert user
3. Jika role valid       → redirect /admin
4. Jika role tidak valid → redirect /login?error
5. Frontend cek status   → me() → AuthGuard proteksi
```