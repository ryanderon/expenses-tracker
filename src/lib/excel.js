import * as XLSX from 'xlsx';
import { CATEGORIES } from './constants';
import { formatCurrency, formatDate } from './utils';

/** Receivable repayments count against what's owed, so a sheet total is what's still out. */
function signedAmount(t) {
  return CATEGORIES[t.category]?.type === 'receivable' && t.flow === 'in' ? -t.amount : t.amount;
}

function exportType(t) {
  const type = CATEGORIES[t.category]?.type;
  if (type === 'income') return 'Income';
  if (type === 'transfer') return 'Transfer';
  if (type === 'receivable') return t.flow === 'in' ? 'Receivable (paid back)' : 'Receivable (out)';
  return 'Expense';
}

export function exportToExcel(transactions, accounts, filename = 'financial-report') {
  const wb = XLSX.utils.book_new();

  const allData = transactions.map((t) => {
    const row = {
      Date: formatDate(t.date),
      Category: CATEGORIES[t.category]?.label || t.category,
      Subcategory: t.subcategory,
      Account: accounts.find((a) => a.id === t.account)?.name || t.account,
      Description: t.note || t.description,
      Amount: t.amount,
      Type: exportType(t),
    };
    if (t.toAccount) {
      row['To Account'] = accounts.find((a) => a.id === t.toAccount)?.name || t.toAccount;
    }
    return row;
  });

  const wsAll = XLSX.utils.json_to_sheet(allData);
  wsAll['!cols'] = [
    { wch: 14 }, { wch: 14 }, { wch: 20 }, { wch: 12 },
    { wch: 30 }, { wch: 16 }, { wch: 10 },
  ];
  XLSX.utils.book_append_sheet(wb, wsAll, 'All Transactions');

  const categories = ['income', 'bills', 'expenses', 'savings', 'investments', 'receivables', 'transfer'];
  for (const cat of categories) {
    const catTx = transactions.filter((t) => t.category === cat);
    if (catTx.length === 0) continue;

    const catData = catTx.map((t) => ({
      Date: formatDate(t.date),
      Subcategory: t.subcategory,
      Account: accounts.find((a) => a.id === t.account)?.name || t.account,
      Description: t.note || t.description,
      Amount: signedAmount(t),
    }));

    const total = catTx.reduce((s, t) => s + signedAmount(t), 0);
    catData.push({ Date: '', Subcategory: '', Account: '', Description: 'TOTAL', Amount: total });

    const ws = XLSX.utils.json_to_sheet(catData);
    ws['!cols'] = [{ wch: 14 }, { wch: 20 }, { wch: 12 }, { wch: 30 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, ws, CATEGORIES[cat].label);
  }

  const summaryData = categories.map((cat) => {
    const total = transactions
      .filter((t) => t.category === cat)
      .reduce((s, t) => s + signedAmount(t), 0);
    return { Category: CATEGORIES[cat].label, Total: total, Formatted: formatCurrency(total) };
  });

  const income = summaryData.find((s) => s.Category === 'Income')?.Total || 0;
  const totalExpenses = summaryData
    .filter((s) => !['Income', 'Transfer', 'Receivables'].includes(s.Category))
    .reduce((s, item) => s + item.Total, 0);

  summaryData.push(
    { Category: '', Total: '', Formatted: '' },
    { Category: 'Total Income', Total: income, Formatted: formatCurrency(income) },
    { Category: 'Total Outflow', Total: totalExpenses, Formatted: formatCurrency(totalExpenses) },
    { Category: 'Net', Total: income - totalExpenses, Formatted: formatCurrency(income - totalExpenses) },
  );

  const wsSummary = XLSX.utils.json_to_sheet(summaryData);
  wsSummary['!cols'] = [{ wch: 16 }, { wch: 16 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

  XLSX.writeFile(wb, `${filename}.xlsx`);
}
