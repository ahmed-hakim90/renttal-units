-- Remove bogus due invoices caused by invalid contract start dates (e.g. 0026-01-21).
DELETE FROM invoices i
USING contracts c
WHERE i.contract_id = c.id
  AND i.status = 'due'
  AND i.paid_amount = 0
  AND (
    i.due_date < DATE '2000-01-01'
    OR i.period_start < c.start_date
    OR i.period_end > c.end_date
  );

ALTER TABLE contracts
  ADD CONSTRAINT reasonable_contract_dates
  CHECK (start_date >= DATE '1990-01-01' AND end_date <= DATE '2100-12-31');
