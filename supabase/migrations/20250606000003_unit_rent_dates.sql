-- Lease dates for unit rental periods.

ALTER TABLE units
  ADD COLUMN rent_start_date DATE,
  ADD COLUMN rent_end_date DATE;

ALTER TABLE units
  ADD CONSTRAINT valid_rent_period
  CHECK (
    rent_start_date IS NULL
    OR rent_end_date IS NULL
    OR rent_end_date >= rent_start_date
  );

ALTER TABLE units
  ADD CONSTRAINT occupied_units_require_rent_dates
  CHECK (
    status <> 'occupied'
    OR (rent_start_date IS NOT NULL AND rent_end_date IS NOT NULL)
  ) NOT VALID;
