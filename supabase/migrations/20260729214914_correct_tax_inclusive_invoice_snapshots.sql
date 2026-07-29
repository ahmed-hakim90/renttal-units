-- Contract line amounts are signed VAT-inclusive totals. Correct snapshots
-- created while those amounts were incorrectly treated as untaxed.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM settings WHERE key = 'tax_inclusive_snapshot_v1'
  ) THEN
    RETURN;
  END IF;

  UPDATE invoice_lines il
  SET
    amount_total = il.amount_untaxed,
    amount_untaxed = ROUND(il.amount_untaxed / (1 + il.tax_rate / 100), 2),
    amount_tax = il.amount_untaxed
      - ROUND(il.amount_untaxed / (1 + il.tax_rate / 100), 2)
  FROM invoices i
  JOIN contracts c ON c.id = i.contract_id
  WHERE il.invoice_id = i.id
    AND c.tax_mode = 'taxable'
    AND il.tax_rate > 0
    AND (i.odoo_invoice_state IS NULL OR i.odoo_invoice_state = 'draft')
    AND NOT EXISTS (
      SELECT 1 FROM payments p WHERE p.invoice_id = i.id
    );

  UPDATE invoices i
  SET
    amount_untaxed = totals.amount_untaxed,
    amount_tax = totals.amount_tax,
    amount_total = totals.amount_total,
    amount = totals.amount_total,
    paid_amount = LEAST(i.paid_amount, totals.amount_total)
  FROM (
    SELECT
      il.invoice_id,
      SUM(il.amount_untaxed) AS amount_untaxed,
      SUM(il.amount_tax) AS amount_tax,
      SUM(il.amount_total) AS amount_total
    FROM invoice_lines il
    GROUP BY il.invoice_id
  ) totals,
  contracts c
  WHERE totals.invoice_id = i.id
    AND c.id = i.contract_id
    AND c.tax_mode = 'taxable'
    AND (i.odoo_invoice_state IS NULL OR i.odoo_invoice_state = 'draft')
    AND NOT EXISTS (
      SELECT 1 FROM payments p WHERE p.invoice_id = i.id
    );

  INSERT INTO settings(key, value)
  VALUES ('tax_inclusive_snapshot_v1', 'true'::JSONB);
END;
$$;
