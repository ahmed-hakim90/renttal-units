import type { LocationStatement, LocationStatementUnit } from '@/types/database';

type Row = (string | number)[];
type ExcelWorksheet = import('exceljs').Worksheet;

export interface LocationStatementExportLabels {
  reportTitle: string;
  location: string;
  summarySheet: string;
  detailSheet: string;
  totalUnits: string;
  occupiedUnits: string;
  vacantUnits: string;
  maintenanceUnits: string;
  activeContracts: string;
  totalContracts: string;
  totalContractValue: string;
  totalInvoicesAmount: string;
  totalPaid: string;
  totalRemaining: string;
  unit: string;
  status: string;
  tenant: string;
  activeContract: string;
  period: string;
  contractValue: string;
  contractCount: string;
  invoiceCount: string;
  invoiceTotal: string;
  paidTotal: string;
  remainingTotal: string;
  grandTotal: string;
}

function setColumnWidths(sheet: ExcelWorksheet, widths: number[]) {
  widths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
}

function downloadWorkbook(buffer: BlobPart, fileName: string) {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function formatPeriod(unit: LocationStatementUnit) {
  if (!unit.activeContractStartDate || !unit.activeContractEndDate) return '';
  return `${unit.activeContractStartDate} - ${unit.activeContractEndDate}`;
}

export async function exportLocationStatementExcel(input: {
  labels: LocationStatementExportLabels;
  statement: LocationStatement;
  locationName: string;
  generatedIso: string;
  getStatusLabel: (status: string) => string;
}) {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const summarySheet = workbook.addWorksheet(input.labels.summarySheet);
  const detailSheet = workbook.addWorksheet(input.labels.detailSheet);
  const totals = input.statement.totals;
  const activeContractValueTotal = input.statement.units.reduce(
    (sum, unit) => sum + unit.activeContractValue,
    0
  );

  const summaryRows: Row[] = [
    [input.labels.reportTitle],
    [input.labels.location, input.locationName],
    [''],
    [input.labels.totalUnits, totals.unitCount],
    [input.labels.occupiedUnits, totals.occupiedUnits],
    [input.labels.vacantUnits, totals.vacantUnits],
    [input.labels.maintenanceUnits, totals.maintenanceUnits],
    [input.labels.activeContracts, totals.activeContractCount],
    [input.labels.totalContracts, totals.contractCount],
    [input.labels.totalContractValue, totals.contractValueTotal],
    [input.labels.totalInvoicesAmount, totals.invoiceTotal],
    [input.labels.totalPaid, totals.paidTotal],
    [input.labels.totalRemaining, totals.remainingTotal],
  ];

  const detailRows: Row[] = [
    [input.labels.reportTitle],
    [input.labels.location, input.locationName],
    [''],
    [
      input.labels.unit,
      input.labels.status,
      input.labels.tenant,
      input.labels.activeContract,
      input.labels.period,
      input.labels.contractValue,
      input.labels.contractCount,
      input.labels.invoiceCount,
      input.labels.invoiceTotal,
      input.labels.paidTotal,
      input.labels.remainingTotal,
    ],
  ];

  for (const unit of input.statement.units) {
    detailRows.push([
      unit.unitNumber,
      input.getStatusLabel(unit.status),
      unit.tenantName ?? '',
      unit.activeContractNumber ?? '',
      formatPeriod(unit),
      unit.activeContractValue || '',
      unit.contractCount,
      unit.invoiceCount,
      unit.invoiceTotal,
      unit.paidTotal,
      unit.remainingTotal,
    ]);
  }

  detailRows.push([
    input.labels.grandTotal,
    '',
    '',
    '',
    '',
    activeContractValueTotal,
    totals.contractCount,
    '',
    totals.invoiceTotal,
    totals.paidTotal,
    totals.remainingTotal,
  ]);

  summarySheet.addRows(summaryRows);
  detailSheet.addRows(detailRows);
  setColumnWidths(summarySheet, [28, 18]);
  setColumnWidths(detailSheet, [14, 14, 22, 18, 24, 16, 14, 14, 16, 16, 16]);

  const buffer = await workbook.xlsx.writeBuffer();
  downloadWorkbook(buffer, `location-statement-${input.generatedIso}.xlsx`);
}
