import axios from "axios";
import "dotenv/config";
import { getExistingAuth } from "./helpers/googleAuth.js";
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
      vals.push(p[f]);
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
};

(async () => {
  if (parsedArgs.command === "sl_to_sheets") {
    await sl_to_sheets();
  }
})();
