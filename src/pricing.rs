use crate::models::RateTier;

/// VA admin fee (Rp), per qr-payment design docs.
pub const ADMIN_FEE: i64 = 3_500;
/// PPN (VAT) rate applied to the subtotal.
pub const TAX_RATE: f64 = 0.11;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PriceBreakdown {
    pub subtotal: i64,
    pub tax: i64,
    pub admin_fee: i64,
    pub total: i64,
}

/// Compute the invoice amount server-side.
///
/// Subtotal = exact tier price when `hours` matches a package, otherwise
/// `hourly_rate × hours`. Total = subtotal + PPN 11% + VA admin fee.
/// Returns `None` for invalid input (non-positive hours or non-positive price).
pub fn compute_price(tiers: &[RateTier], hourly_rate: i64, hours: i32) -> Option<PriceBreakdown> {
    if hours <= 0 {
        return None;
    }
    let subtotal = tiers
        .iter()
        .find(|t| t.duration_hours == hours)
        .map(|t| t.price)
        .unwrap_or_else(|| hourly_rate * i64::from(hours));
    if subtotal <= 0 {
        return None;
    }
    let tax = (subtotal as f64 * TAX_RATE).round() as i64;
    let admin_fee = ADMIN_FEE;
    Some(PriceBreakdown {
        subtotal,
        tax,
        admin_fee,
        total: subtotal + tax + admin_fee,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tier(hours: i32, price: i64) -> RateTier {
        RateTier {
            duration_hours: hours,
            label: None,
            price,
        }
    }

    #[test]
    fn tier_price_is_used_when_hours_match() {
        let tiers = vec![tier(3, 55_000)];
        let p = compute_price(&tiers, 15_000, 3).unwrap();
        assert_eq!(p.subtotal, 55_000);
        assert_eq!(p.tax, 6_050); // 55_000 × 0.11
        assert_eq!(p.admin_fee, ADMIN_FEE);
        assert_eq!(p.total, 64_550);
    }

    #[test]
    fn hourly_fallback_when_no_tier_matches() {
        let tiers = vec![tier(3, 55_000)];
        let p = compute_price(&tiers, 15_000, 5).unwrap();
        assert_eq!(p.subtotal, 75_000);
        assert_eq!(p.tax, 8_250);
        assert_eq!(p.total, 86_750);
    }

    #[test]
    fn invalid_hours_or_zero_price_returns_none() {
        let tiers = vec![tier(3, 55_000)];
        assert!(compute_price(&tiers, 15_000, 0).is_none());
        assert!(compute_price(&tiers, 0, 5).is_none());
    }
}