# Payments Context

High-level view of payments and credit purchases. This describes product intent and user-facing behavior, not internal implementation.

## Summary

- Payments use Lightning invoices, payable via any Lightning wallet or CashApp.
- Fixed bundle: $3 for 300 credits.
- Credits unlock image generation until they run out (cost varies by model).
- Invoices are tied to the current anonymous session.

**CashApp Support:** CashApp users can scan the Lightning QR code to pay using their CashApp balance (USD or BTC). This allows anyone to pay even if they don't have a dedicated Lightning wallet.

## Flow

1. User clicks “Get Credits” or “Buy Credits.”
2. The app creates a Lightning invoice and shows a QR + BOLT11 string.
3. The invoice expires after 15 minutes if unpaid.
4. The app polls for settlement and credits the session when paid.

## Alpha Constraints

- No refunds.
- No direct fiat or on-chain payments (though CashApp bridges both to Lightning).
- No full accounts yet.
- This is called out explicitly in onboarding and buy-credits UI.

## Transparency & Security

- Invoice status can only be accessed by the session that created it.
- Credits are granted only after the Lightning invoice is settled.
