use crate::models::{BillingMode, RateTier};

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

/// Subtotal + PPN 11% + VA admin fee. `None` when the subtotal is not billable.
fn with_fees(subtotal: i64) -> Option<PriceBreakdown> {
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

/// Compute a duration invoice server-side.
///
/// Subtotal = exact tier price when `hours` matches a package. When there is no
/// package, the hourly fallback is only used if the workspace enables it;
/// otherwise the duration is not billable. Total = subtotal + PPN 11% + VA fee.
pub fn compute_price(
    tiers: &[RateTier],
    hourly_rate: i64,
    hourly_enabled: bool,
    hours: i32,
) -> Option<PriceBreakdown> {
    if hours <= 0 {
        return None;
    }
    let subtotal = match tiers.iter().find(|t| t.duration_hours == hours) {
        Some(tier) => tier.price,
        None if hourly_enabled => hourly_rate * i64::from(hours),
        None => return None,
    };
    with_fees(subtotal)
}

/// Compute a monthly/annual invoice. The price is charged once per period.
pub fn compute_period_price(
    monthly_price: i64,
    annual_price: i64,
    mode: BillingMode,
) -> Option<PriceBreakdown> {
    let subtotal = match mode {
        BillingMode::Monthly => monthly_price,
        BillingMode::Annual => annual_price,
        BillingMode::Duration => return None,
    };
    with_fees(subtotal)
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
        let p = compute_price(&tiers, 15_000, false, 3).unwrap();
        assert_eq!(p.subtotal, 55_000);
        assert_eq!(p.tax, 6_050); // 55_000 × 0.11
        assert_eq!(p.admin_fee, ADMIN_FEE);
        assert_eq!(p.total, 64_550);
    }

    #[test]
    fn hourly_fallback_when_enabled_and_no_tier_matches() {
        let tiers = vec![tier(3, 55_000)];
        let p = compute_price(&tiers, 15_000, true, 5).unwrap();
        assert_eq!(p.subtotal, 75_000);
        assert_eq!(p.tax, 8_250);
        assert_eq!(p.total, 86_750);
    }

    #[test]
    fn hourly_fallback_is_rejected_when_disabled() {
        let tiers = vec![tier(3, 55_000)];
        assert!(compute_price(&tiers, 15_000, false, 5).is_none());
    }

    #[test]
    fn invalid_hours_or_zero_price_returns_none() {
        let tiers = vec![tier(3, 55_000)];
        assert!(compute_price(&tiers, 15_000, false, 0).is_none());
        assert!(compute_price(&tiers, 0, true, 5).is_none());
    }

    #[test]
    fn period_prices_use_calendar_pass_price() {
        let monthly = compute_period_price(500_000, 5_000_000, BillingMode::Monthly).unwrap();
        assert_eq!(monthly.subtotal, 500_000);
        let annual = compute_period_price(500_000, 5_000_000, BillingMode::Annual).unwrap();
        assert_eq!(annual.subtotal, 5_000_000);
        assert!(compute_period_price(500_000, 5_000_000, BillingMode::Duration).is_none());
        assert!(compute_period_price(0, 5_000_000, BillingMode::Monthly).is_none());
    }
}
