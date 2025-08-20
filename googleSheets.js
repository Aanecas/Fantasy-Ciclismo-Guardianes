// googleSheets.js (CommonJS)
const { google } = require('googleapis');
const path = require('path');

// 1) Carga de credenciales del Service Account
const KEYFILE = path.join(__dirname, 'credentials.json'); // NO subir a GitHub
const auth = new google.auth.GoogleAuth({
  keyFile: KEYFILE,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

// 2) ID de tu Google Sheet
const SPREADSHEET_ID = '1nXBwTgG9jijsUmcBkSeVPunP8n7OVNYe_WKPneJkWmA';

// 3) Pequeña utilidad para escribir valores
async function write(range, values) {
  const client = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: client });
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range,
    valueInputOption: 'RAW',
    requestBody: { values },
  });
}

// 4) Pequeña utilidad para leer valores (opcional)
async function read(range) {
  const client = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: client });
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range,
  });
  return data.values || [];
}

// 5) Test: escribe cabecera Startlist y una fila de prueba
(async () => {
  try {
    // Cabeceras definitivas de Startlist
    await write('Startlist!A1:G1', [
      ['Rider', 'Team', 'PCS_Rider_URL', 'Role', 'Value', 'Adj', 'FinalValue'],
    ]);

    // Limpia filas anteriores (opcional)
    await write('Startlist!A2:G2', [['', '', '', '', '', '', '']]);

    // Fila de prueba
    await write('Startlist!A2:G2', [[
      'Ejemplo Rider', 'Ejemplo Team',
      'https://www.procyclingstats.com/rider/ejemplo',
      '', 0, 0, 0
    ]]);

    // Leer para verificar
    const rows = await read('Startlist!A1:G3');
    console.log('✅ Escribí y leí de la hoja. Muestra de datos:\n', rows);
  } catch (err) {
    console.error('❌ Error con Google Sheets:', err.message);
    if (err.response && err.response.data) {
      console.error('Detalles:', JSON.stringify(err.response.data));
    }
  }
})();
