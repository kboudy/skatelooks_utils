import { google } from "googleapis";

let sheets = null;
let drive = null;

// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.

export const initializeClient = (auth) => {
  sheets = google.sheets({ version: "v4", auth });
  drive = google.drive({ version: "v3", auth });
};

export const getSpreadsheetById = async (spreadsheetId) => {
  const response = await sheets.spreadsheets.get({
    includeGridData: true,
    spreadsheetId,
  });
  return response.data;
};

export const getAllSpreadsheetNamesAndIds = async () => {
  let ssFiles = [];
  let nextPageToken = null;
  do {
    const response = await drive.files.list({
      pageToken: nextPageToken,
      q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
      fields: "nextPageToken, files(id, name)",
    });
    ssFiles = [...ssFiles, ...response.data.files];
    nextPageToken = response.data.nextPageToken;
  } while (nextPageToken);
  return ssFiles;
};

// https://developers.google.com/sheets/api/reference/rest/v4/spreadsheets/create
export const createSpreadsheet = async (spreadsheet) => {
  const request = {
    // Spreadsheet json representation: https://developers.google.com/sheets/api/reference/rest/v4/spreadsheets#Spreadsheet
    resource: spreadsheet,
  };
  const response = (await sheets.spreadsheets.create(request)).data;
  return response;
};

export const deleteRows = async (
  spreadsheetId,
  sheetId,
  startIndex,
  endIndex
) => {
  const response = (
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: sheetId,
                dimension: "ROWS",
                startIndex,
                endIndex,
              },
            },
          },
        ],
      },
    })
  ).data;
  return response;
};

export const deleteColumns = async (
  spreadsheetId,
  sheetId,
  startIndex,
  endIndex
) => {
  const response = (
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: sheetId,
                dimension: "COLUMNS",
                startIndex,
                endIndex,
              },
            },
          },
        ],
      },
    })
  ).data;
  return response;
};

// https://developers.google.com/sheets/api/reference/rest/v4/spreadsheets.values/batchUpdate
export const updateSpreadsheet = async (spreadsheetId, requests) => {
  const response = (
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests,
      },
    })
  ).data;
  return response;
};

// https://developers.google.com/sheets/api/samples/sheet#delete_a_sheet
export const deleteSheet = async (spreadsheetId, sheetId) => {
  const request = {
    deleteSheet: {
      sheetId,
    },
  };

  const response = (
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [request],
      },
    })
  ).data;
  return response;
};

// https://developers.google.com/sheets/api/reference/rest/v4/spreadsheets/request#addsheetrequest
export const addSheet = async (spreadsheetId, sheetProperties) => {
  const request = {
    addSheet: {
      properties: sheetProperties,
    },
  };

  const response = (
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [request],
      },
    })
  ).data;
  return response.replies[0].addSheet;
};
