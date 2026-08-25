// Google Sheets en memoria: lo justo para correr appsscript.gs tal cual está.
function makeSheet(name) {
  const sh = { name, rows: [], maxCols: 26 };
  const pad = (r, n) => { while (r.length < n) r.push(''); return r; };
  const api = {
    getMaxColumns: () => sh.maxCols,
    insertColumnsAfter: (after, n) => { sh.maxCols += n; },
    setFrozenRows: () => api,
    deleteRow: (i) => { sh.rows.splice(i - 1, 1); },
    appendRow: (vals) => { sh.rows.push(vals.slice()); },
    getDataRange: () => {
      const w = sh.rows.reduce((m, r) => Math.max(m, r.length), 0);
      return { getValues: () => sh.rows.map(r => pad(r.slice(), w)) };
    },
    getRange: (r, c, nr, nc) => {
      nr = nr || 1; nc = nc || 1;
      if (nc > sh.maxCols) throw new Error('getRange fuera de rango: ' + nc + ' > ' + sh.maxCols);
      return {
        getValues: () => {
          const out = [];
          for (let i = 0; i < nr; i++) {
            const row = sh.rows[r - 1 + i] || [];
            out.push(pad(row.slice(), c + nc - 1).slice(c - 1, c - 1 + nc));
          }
          return out;
        },
        setValues: (vals) => {
          for (let i = 0; i < vals.length; i++) {
            while (sh.rows.length < r + i) sh.rows.push([]);
            const row = pad(sh.rows[r - 1 + i], c + vals[i].length - 1);
            for (let j = 0; j < vals[i].length; j++) row[c - 1 + j] = vals[i][j];
          }
          return api;
        },
        setValue: (v) => {
          while (sh.rows.length < r) sh.rows.push([]);
          pad(sh.rows[r - 1], c)[c - 1] = v;
          return { setFontWeight: () => {} };
        },
        setFontWeight: () => api
      };
    },
    _raw: sh
  };
  return api;
}

function makeSpreadsheet() {
  const sheets = {};
  return {
    getId: () => 'mock',
    getSheetByName: (n) => sheets[n] || null,
    insertSheet: (n) => (sheets[n] = makeSheet(n)),
    _sheets: sheets
  };
}
module.exports = { makeSpreadsheet };
