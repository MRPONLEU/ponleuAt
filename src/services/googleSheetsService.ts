
import { Student, Class, Staff, AppSettings, AppUser } from '../types';

const BASE_URL = 'https://sheets.googleapis.com/v4/spreadsheets';

async function fetchWithTimeout(url: string, options: any = {}, timeout = 15000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}

export const googleSheetsService = {
  async createSpreadsheet(token: string, title: string) {
    const response = await fetchWithTimeout(BASE_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        properties: { title },
        sheets: [
          { properties: { title: 'students' } },
          { properties: { title: 'classes' } },
          { properties: { title: 'staff' } },
          { properties: { title: 'users' } },
          { properties: { title: 'settings' } },
          { properties: { title: 'attendance' } },
          { properties: { title: 'staffAttendance' } }
        ]
      })
    });
    if (!response.ok) {
      const error = new Error('Failed to create spreadsheet');
      (error as any).status = response.status;
      throw error;
    }
    return await response.json();
  },

  async getValues(token: string, spreadsheetId: string, range: string) {
    const response = await fetchWithTimeout(`${BASE_URL}/${spreadsheetId}/values/${range}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) {
      if (response.status === 401) {
        const error = new Error('UNAUTHORIZED');
        (error as any).status = 401;
        throw error;
      }
      return [];
    }
    const data = await response.json();
    return data.values || [];
  },

  async updateValues(token: string, spreadsheetId: string, range: string, values: any[][]) {
    const response = await fetchWithTimeout(`${BASE_URL}/${spreadsheetId}/values/${range}?valueInputOption=RAW`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ values })
    });
    if (!response.ok) {
      const error = new Error('Failed to update values');
      (error as any).status = response.status;
      throw error;
    }
    return await response.json();
  },

  async appendValues(token: string, spreadsheetId: string, range: string, values: any[][]) {
    const response = await fetchWithTimeout(`${BASE_URL}/${spreadsheetId}/values/${range}:append?valueInputOption=RAW`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ values })
    });
    if (!response.ok) {
      const error = new Error('Failed to append values');
      (error as any).status = response.status;
      throw error;
    }
    return await response.json();
  },

  async clearValues(token: string, spreadsheetId: string, range: string) {
    const response = await fetchWithTimeout(`${BASE_URL}/${spreadsheetId}/values/${range}:clear`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    // If sheet doesn't exist, we'll handle it in saveAll
    if (!response.ok && response.status !== 404) {
      throw new Error('Failed to clear values');
    }
    return response.ok ? await response.json() : null;
  },

  async ensureSheetsExist(token: string, spreadsheetId: string, sheetNames: string[]) {
    const response = await fetchWithTimeout(`${BASE_URL}/${spreadsheetId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.status === 404) {
      throw new Error('SPREADSHEET_NOT_FOUND');
    }
    
    if (!response.ok) {
      const error = new Error('Failed to fetch spreadsheet info');
      (error as any).status = response.status;
      throw error;
    }
    const data = await response.json();
    const existingSheets = data.sheets.map((s: any) => s.properties.title);
    const missingSheets = sheetNames.filter(name => !existingSheets.includes(name));

    if (missingSheets.length > 0) {
      const requests = missingSheets.map(name => ({
        addSheet: { properties: { title: name } }
      }));
      await fetchWithTimeout(`${BASE_URL}/${spreadsheetId}:batchUpdate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ requests })
      });
    }
  },

  // Helpers for specific data types
  async saveAll<T>(token: string, spreadsheetId: string, sheetName: string, items: T[]) {
    try {
      await this.ensureSheetsExist(token, spreadsheetId, [sheetName]);
    } catch (e) {
      console.warn("Could not ensure sheet exists, might be intentional if no permission to modify structure", e);
    }

    if (items.length === 0) {
        await this.clearValues(token, spreadsheetId, `${sheetName}!A1:Z`);
        return;
    }
    const headers = Object.keys(items[0] as any);
    const values = [headers, ...items.map(item => headers.map(h => {
      const val = (item as any)[h];
      if (val === null || val === undefined) return '';
      if (typeof val === 'object') return JSON.stringify(val);
      return val;
    }))];
    
    await this.clearValues(token, spreadsheetId, `${sheetName}!A1:Z`);
    await this.updateValues(token, spreadsheetId, `${sheetName}!A1`, values);
  },

  async getAll<T>(token: string, spreadsheetId: string, sheetName: string): Promise<T[]> {
    const values = await this.getValues(token, spreadsheetId, `${sheetName}!A1:Z`);
    if (values.length < 2) return [];
    const headers = values[0];
    return values.slice(1).map((row: any[]) => {
      const item: any = {};
      headers.forEach((header: string, index: number) => {
        item[header] = row[index];
      });
      return item as T;
    });
  },

  // Generic helper to update a single item in a sheet
  async updateItem<T extends { id: string }>(token: string, spreadsheetId: string, sheetName: string, item: T) {
    const items = await googleSheetsService.getAll<T>(token, spreadsheetId, sheetName);
    const index = items.findIndex(i => i.id === item.id);
    const newItems = index >= 0 
      ? items.map(i => i.id === item.id ? item : i)
      : [...items, item];
    await this.saveAll(token, spreadsheetId, sheetName, newItems);
  },

  async deleteItem(token: string, spreadsheetId: string, sheetName: string, itemId: string) {
    const items = await googleSheetsService.getAll<any>(token, spreadsheetId, sheetName);
    const newItems = items.filter(i => i.id !== itemId);
    await this.saveAll(token, spreadsheetId, sheetName, newItems);
  },

  async saveAttendance(token: string, spreadsheetId: string, date: string, attendance: Record<string, string>) {
    try {
      await this.ensureSheetsExist(token, spreadsheetId, ['attendance']);
    } catch (e) {
      console.warn("Could not ensure attendance sheet exists", e);
    }
    const newRows = Object.entries(attendance).map(([id, status]) => [date, id, status]);
    
    // For "realtime" direct updates, we might want to just append if we don't care about duplicates
    const allRecords = await this.getValues(token, spreadsheetId, 'attendance!A1:C');
    if (allRecords.length === 0) {
      await this.updateValues(token, spreadsheetId, 'attendance!A1', [['date', 'studentId', 'status'], ...newRows]);
    } else {
      const otherDates = allRecords.filter((row: any[]) => row[0] !== date);
      const headers = (allRecords[0] && allRecords[0][0] === 'date') ? [] : [['date', 'studentId', 'status']];
      await this.clearValues(token, spreadsheetId, 'attendance!A1:C');
      await this.updateValues(token, spreadsheetId, 'attendance!A1', [...headers, ...otherDates, ...newRows]);
    }
  },

  async getAttendance(token: string, spreadsheetId: string, date: string): Promise<Record<string, string>> {
     const values = await this.getValues(token, spreadsheetId, 'attendance!A1:C');
     const records: Record<string, string> = {};
     if (values.length < 2) return records;
     values.slice(1).forEach((row: any[]) => {
       if (row[0] === date) {
         records[row[1]] = row[2];
       }
     });
     return records;
  },

  async saveStaffAttendance(token: string, spreadsheetId: string, date: string, staffAttendance: Record<string, any>) {
    try {
      await this.ensureSheetsExist(token, spreadsheetId, ['staffAttendance']);
    } catch (e) {
      console.warn("Could not ensure staffAttendance sheet exists", e);
    }
    const headers = ['date', 'staffId', 'mIn', 'mOut', 'aIn', 'aOut', 'deviceInfo', 'location'];
    const newRows = Object.entries(staffAttendance).map(([id, data]) => [
      date, 
      id, 
      data.mIn || '', 
      data.mOut || '', 
      data.aIn || '', 
      data.aOut || '', 
      data.deviceInfo || '', 
      data.location ? JSON.stringify(data.location) : ''
    ]);

    const allRecords = await this.getValues(token, spreadsheetId, 'staffAttendance!A1:H');
    if (allRecords.length === 0) {
      await this.updateValues(token, spreadsheetId, 'staffAttendance!A1', [headers, ...newRows]);
    } else {
      const otherDates = allRecords.filter((row: any[]) => row[0] !== date);
      const currentHeaders = (allRecords[0] && allRecords[0][0] === 'date') ? [] : [headers];
      await this.clearValues(token, spreadsheetId, 'staffAttendance!A1:H');
      await this.updateValues(token, spreadsheetId, 'staffAttendance!A1', [...currentHeaders, ...otherDates, ...newRows]);
    }
  },

  async getStaffAttendance(token: string, spreadsheetId: string, date: string): Promise<Record<string, any>> {
    const values = await this.getValues(token, spreadsheetId, 'staffAttendance!A1:H');
    const records: Record<string, any> = {};
    if (values.length < 2) return records;
    const headers = values[0];
    values.slice(1).forEach((row: any[]) => {
      if (row[0] === date) {
        const data: any = {};
        headers.forEach((h: string, i: number) => {
          if (i > 1) { // Skip date and staffId as keys
            try {
               data[h] = h === 'location' ? JSON.parse(row[i]) : row[i];
            } catch {
               data[h] = row[i];
            }
          }
        });
        records[row[1]] = data;
      }
    });
    return records;
  }
};
