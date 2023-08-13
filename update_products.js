import axios from "axios";
import "dotenv/config";
import _ from "lodash";
import { getExistingAuth } from "./helpers/googleAuth.js";
import {
  initializeFieldConversion,
  value_toString,
  string_toValue,
  are_equivalent,
} from "./helpers/fieldConversion.js";
import {
  initializeClient,
  createSpreadsheet,
  updateSpreadsheet,
  getSpreadsheetById,
  deleteSheet,
  addSheet,
  getAllSpreadsheetNamesAndIds,
} from "./helpers/googleSheets.js";
import { parseArgs } from "@vmadden191/kargs";
import open from "open";

const PRODUCT_SPREADSHEET_NAME = "Skatelooks-WooCommerce-products";

const { WOOCOMMERCE_CONSUMER_KEY, WOOCOMMERCE_CONSUMER_SECRET } = process.env;
const BASE_API_URL = "https://skatelooks.com/wp-json/wc/v3";
const PER_PAGE = 100;

const commands = ["sl_to_sheets", "sheets_to_sl"];
const fields = [
  "_links",
  "aioseo_notices",
  "attributes",
  "average_rating",
  "backordered",
  "backorders",
  "backorders_allowed",
  "button_text",
  "catalog_visibility",
  "categories",
  "cross_sell_ids",
  "date_created",
  "date_created_gmt",
  "date_modified",
  "date_modified_gmt",
  "date_on_sale_from",
  "date_on_sale_from_gmt",
  "date_on_sale_to",
  "date_on_sale_to_gmt",
  "default_attributes",
  "description",
  "dimensions",
  "download_expiry",
  "download_limit",
  "downloadable",
  "downloads",
  "external_url",
  "featured",
  "grouped_products",
  "has_options",
  "id",
  "images",
  "low_stock_amount",
  "manage_stock",
  "menu_order",
  "meta_data",
  "name",
  "on_sale",
  "parent_id",
  "permalink",
  "price",
  "price_html",
  "purchasable",
  "purchase_note",
  "rating_count",
  "regular_price",
  "related_ids",
  "reviews_allowed",
  "sale_price",
  "shipping_class",
  "shipping_class_id",
  "shipping_required",
  "shipping_taxable",
  "short_description",
  "sku",
  "slug",
  "sold_individually",
  "status",
  "stock_quantity",
  "stock_status",
  "tags",
  "tax_class",
  "tax_status",
  "total_sales",
  "type",
  "upsell_ids",
  "variations",
  "virtual",
  "weight",
];

const integerFields = ["id", "menu_order"];

const argOptions = {
  command: {
    alias: "c",
    type: "string",
    choices: commands,
    description: `commands`,
    isRequired: true,
  },
  fields: {
    alias: "f",
    type: "array",
    description: `fields to bring to sheet (sl_to_sheets) or to save to site (sheets_to_sl).  use "*" for all`,
    isRequired: true,
  },
  testMode: {
    alias: "t",
    type: "switch",
    description: "for sheets_to_sl: will report the changes but not save them",
  },
};

const parsedArgs = parseArgs(argOptions, false);

const queryWoocommerce = async ({ method, path }) => {
  let allResults = [];
  let page = 1;
  while (true) {
    const response = await axios[method](
      `${BASE_API_URL}${path}?consumer_key=${WOOCOMMERCE_CONSUMER_KEY}&consumer_secret=${WOOCOMMERCE_CONSUMER_SECRET}&page=${page}&per_page=${PER_PAGE}`
    );
    allResults = [...allResults, ...response.data];
    if (response.data.length < PER_PAGE) {
      break;
    }
    page++;
  }
  return allResults;
};

/// removes all sheets & adds new sheet
const clearSpreadsheet = async (spreadsheetId, newSheetName) => {
  const existingSpreadsheet = await getSpreadsheetById(spreadsheetId);

  const tempTitle = `${new Date().getTime()}`;
  const tempNewSheet = await addSheet(spreadsheetId, {
    title: tempTitle,
  });
  for (const s of existingSpreadsheet.sheets) {
    await deleteSheet(spreadsheetId, s.properties.sheetId);
  }
  const permanentNewSheet = await addSheet(spreadsheetId, {
    title: newSheetName,
  });
  await deleteSheet(spreadsheetId, tempNewSheet.properties.sheetId);
  return permanentNewSheet;
};

const formatFirstSheetHeader = async (spreadsheetId) => {
  const existingSpreadsheet = await getSpreadsheetById(spreadsheetId);
  const sheetId = existingSpreadsheet.sheets[0].properties.sheetId;
  // https://developers.google.com/sheets/api/samples/formatting
  await updateSpreadsheet(spreadsheetId, [
    {
      repeatCell: {
        range: {
          sheetId: sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: {
              red: 50,
              green: 50,
              blue: 50,
            },
            horizontalAlignment: "CENTER",
            textFormat: {
              foregroundColor: {
                red: 0,
                green: 0,
                blue: 0,
              },
              fontSize: 12,
              bold: true,
            },
          },
        },
        fields:
          "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)",
      },
    },
    {
      updateSheetProperties: {
        properties: {
          sheetId: sheetId,
          gridProperties: {
            frozenRowCount: 1,
          },
        },
        fields: "gridProperties.frozenRowCount",
      },
    },
  ]);
};

const sl_to_sheets = async () => {
  const googleAuth = await getExistingAuth();
  initializeClient(googleAuth);

  const products = await queryWoocommerce({
    method: "post",
    path: "/products",
  });
  if (products.length === 0) {
    console.log("woocommerce returned no products");
    process.exit(0);
  }

  let fields;
  if (parsedArgs.fields.length === 1 && parsedArgs.fields[0] === "*") {
    fields = Object.keys(products[0]);
  } else {
    fields = ["id", ...parsedArgs.fields.filter((f) => f !== "id")];
  }

  const header = {
    values: fields.map((v) => {
      return {
        userEnteredValue: {
          stringValue: `${v}`,
        },
      };
    }),
  };

  const sheetProducts = products.map((p) => {
    const vals = [];
    for (const f of fields) {
      if (p[f] === undefined) {
        console.error(`Unrecognized field: ${f} - exiting`);
        process.exit(1);
      }
      vals.push(value_toString(f, p[f]));
    }

    return {
      values: vals.map((v) => {
        return {
          userEnteredValue: {
            stringValue: `${v}`,
          },
        };
      }),
    };
  });

  const existingSpreadsheets = await getAllSpreadsheetNamesAndIds();
  const matchingSpreadsheet = existingSpreadsheets.find(
    (s) => s.name === PRODUCT_SPREADSHEET_NAME
  );

  let spreadsheetId;
  if (matchingSpreadsheet) {
    const newSheet = await clearSpreadsheet(matchingSpreadsheet.id, "products");

    // add columns if necessary.  New sheet has an initial limit of 26 columns
    const fieldCount = fields.length;
    if (fieldCount > 26)
      // https://developers.google.com/sheets/api/samples/rowcolumn
      await updateSpreadsheet(matchingSpreadsheet.id, [
        {
          appendDimension: {
            sheetId: newSheet.properties.sheetId,
            dimension: "COLUMNS",
            length: fieldCount - 26,
          },
        },
      ]);

    // hide the first column (id)
    await updateSpreadsheet(matchingSpreadsheet.id, [
      {
        updateDimensionProperties: {
          range: {
            sheetId: newSheet.properties.sheetId,
            dimension: "COLUMNS",
            startIndex: 0,
            endIndex: 1,
          },
          properties: {
            hiddenByUser: true,
          },
          fields: "hiddenByUser",
        },
      },
    ]);

    // populate the sheet
    await updateSpreadsheet(matchingSpreadsheet.id, [
      {
        appendCells: {
          sheetId: newSheet.properties.sheetId,
          fields: "*",
          rows: [header, ...sheetProducts],
        },
      },
    ]);

    spreadsheetId = matchingSpreadsheet.id;
  } else {
    spreadsheetId = (
      await createSpreadsheet({
        properties: {
          title: PRODUCT_SPREADSHEET_NAME,
        },
        sheets: [
          {
            data: {
              rowData: [header, ...sheetProducts],
            },
          },
        ],
      })
    ).id;
  }

  await formatFirstSheetHeader(spreadsheetId);
  await open(`https://docs.google.com/spreadsheets/d/${spreadsheetId}`);
};

const sheets_to_sl = async () => {
  if (parsedArgs.testMode) {
    console.log("TEST MODE - no changes will be made");
  }
  const googleAuth = await getExistingAuth();
  initializeClient(googleAuth);

  const products = await queryWoocommerce({
    method: "post",
    path: "/products",
  });
  if (products.length === 0) {
    console.log("woocommerce returned no products");
    process.exit(0);
  }

  initializeFieldConversion(products);

  let fields;
  if (parsedArgs.fields.length === 1 && parsedArgs.fields[0] === "*") {
    fields = Object.keys(products[0]);
  } else {
    fields = [...parsedArgs.fields.filter((f) => f !== "id")];
  }

  const existingSpreadsheets = await getAllSpreadsheetNamesAndIds();
  const matchingSpreadsheet = existingSpreadsheets.find(
    (s) => s.name === PRODUCT_SPREADSHEET_NAME
  );
  if (!matchingSpreadsheet) {
    console.log(
      `no matching spreadsheet found with the name "${PRODUCT_SPREADSHEET_NAME}" - exiting`
    );
    process.exit(1);
  }
  const existingSpreadsheet = await getSpreadsheetById(matchingSpreadsheet.id);
  const { rowData } = existingSpreadsheet.sheets[0].data[0];
  const fieldsAndIndexes = rowData[0].values
    .filter((v) => !!v.userEnteredValue)
    .reduce((acc, v, i) => {
      acc[v.userEnteredValue.stringValue] = i;
      return acc;
    }, {});

  for (let i = 1; i < rowData.length; i++) {
    const sheetRowObj = {};
    for (const k in fieldsAndIndexes) {
      sheetRowObj[k] =
        rowData[i].values[fieldsAndIndexes[k]].userEnteredValue.stringValue;
      if (!sheetRowObj[k]) {
        sheetRowObj[k] =
          rowData[i].values[fieldsAndIndexes[k]].userEnteredValue.numberValue;
      }
      if (!sheetRowObj[k]) {
        throw new Error(`couldn't parse ${k} from sheet`);
      }
      if (integerFields.includes(k)) {
        sheetRowObj[k] = parseInt(sheetRowObj[k]);
      }
    }
    for (const p of products) {
      let productHasUpdates = false;
      if (p.id === sheetRowObj.id) {
        for (const f of fields) {
          const valFromSheet = string_toValue(f, sheetRowObj[f]);
          const valFromWooProduct = p[f];
          if (!are_equivalent(f, valFromWooProduct, valFromSheet)) {
            productHasUpdates = true;
            console.log(
              `updating product id ${
                p.id
              } - field "${f}" from "${value_toString(f, p[f])}" to "${
                sheetRowObj[f]
              }"`
            );
            p[f] = valFromSheet;
          }
        }
        if (!parsedArgs.testMode && productHasUpdates) {
          try {
            const response = await axios.put(
              `${BASE_API_URL}/products/${p.id}?consumer_key=${WOOCOMMERCE_CONSUMER_KEY}&consumer_secret=${WOOCOMMERCE_CONSUMER_SECRET}`,
              p
            );
          } catch (ex) {
            console.error(
              `Axios error while trying to update produce ${p.id}`,
              ex
            );
            process.exit(1);
          }
        }
      }
    }
  }
};

(async () => {
  switch (parsedArgs.command) {
    case "sl_to_sheets":
      await sl_to_sheets();
      break;
    case "sheets_to_sl":
      await sheets_to_sl();
      break;
  }
})();
