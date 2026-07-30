-- Allow draft contracts with partial dates and opening-balance fields.
-- Previous CHECKs treated NULL dates poorly when opening balance fields were set.

ALTER TABLE contracts
  DROP CONSTRAINT IF EXISTS reasonable_contract_dates;

ALTER TABLE contracts
  ADD CONSTRAINT reasonable_contract_dates CHECK (
    (start_date IS NULL OR start_date >= DATE '1990-01-01')
    AND (end_date IS NULL OR end_date <= DATE '2100-12-31')
  );

ALTER TABLE contracts
  DROP CONSTRAINT IF EXISTS contracts_paid_through_in_period;

ALTER TABLE contracts
  ADD CONSTRAINT contracts_paid_through_in_period CHECK (
    paid_through_date IS NULL
    OR start_date IS NULL
    OR end_date IS NULL
    OR (
      paid_through_date >= start_date
      AND paid_through_date <= end_date
    )
  );

ALTER TABLE contracts
  DROP CONSTRAINT IF EXISTS contracts_opening_payment_in_period;

ALTER TABLE contracts
  ADD CONSTRAINT contracts_opening_payment_in_period CHECK (
    opening_payment_date IS NULL
    OR start_date IS NULL
    OR end_date IS NULL
    OR (
      opening_payment_date >= start_date
      AND opening_payment_date <= end_date
    )
  );
