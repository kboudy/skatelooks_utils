import path from "path";
import fs from "fs";
import * as url from "url";
const __dirname = url.fileURLToPath(new URL(".", import.meta.url));

const CREDENTIALS_DIR = path.resolve(path.join(__dirname, "..", "credentials"));
const TOKEN_PATH = path.join(CREDENTIALS_DIR, "token.json");
const CREDENTIALS_PATH = path.join(CREDENTIALS_DIR, "credentials.json");

import { google } from "googleapis";

const getOAuth2Client = () => {
  let credentials;
  try {
    credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf8"));
  } catch (ex) {
    throw new Error(
      `Download & save this file (see README.md): ${CREDENTIALS_PATH}`
    );
  }
  const clientSecret = credentials.installed.client_secret;
  const clientId = credentials.installed.client_id;
  const redirectUrl = credentials.installed.redirect_uris[0];
  const OAuth2 = google.auth.OAuth2;
  const oAuth2Client = new OAuth2(clientId, clientSecret, redirectUrl);
  return oAuth2Client;
};

const refresh_access_token = () => {
  try {
    const ACCESS_TOKEN_REFRESHER_PATH = `/home/keith/keith_apps/google_oauth_token_creator/access_token_refresher.js`;
    execSync(
      `"${ACCESS_TOKEN_REFRESHER_PATH}" -a woo_commerce_api_play -c "${CREDENTIALS_PATH}"`
    );
  } catch (ex) {}
};

export const getExistingAuth = () => {
  const oAuth2Client = getOAuth2Client();
  let tokenString;
  try {
    tokenString = fs.readFileSync(TOKEN_PATH, "utf8");
  } catch (ex) {
    throw new Error(
      `You need to run initialAuth.js to generate "${TOKEN_PATH}"`
    );
  }
  oAuth2Client.credentials = JSON.parse(tokenString);
  refresh_access_token();
  return oAuth2Client;
};
