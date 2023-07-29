import axios from "axios";
import "dotenv/config";
import { getExistingAuth } from "./helpers/googleAuth.js";
import { initializeClient, createSpreadsheet } from "./helpers/googleSheets.js";

const { WOOCOMMERCE_CONSUMER_KEY, WOOCOMMERCE_CONSUMER_SECRET } = process.env;
const BASE_API_URL = "https://skatelooks.com/wp-json/wc/v3";
const PER_PAGE = 100;

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

(async () => {
  const googleAuth = await getExistingAuth();
  initializeClient(googleAuth);

  const products = await queryWoocommerce({
    method: "post",
    path: "/products",
  });

  const keys = Object.keys(products[0]);
  const header = {
    values: keys.map((v) => {
      return {
        userEnteredValue: {
          stringValue: `${v}`,
        },
      };
    }),
  };

  const sheetProducts = products.map((p) => {
    const vals = Object.values(p);
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

  const ss = await createSpreadsheet({
    properties: {
      title: "Skatelooks-WooCommerce-products",
    },
    sheets: [
      {
        data: {
          rowData: [header, ...sheetProducts],
        },
      },
    ],
  });
  debugger;
})();
