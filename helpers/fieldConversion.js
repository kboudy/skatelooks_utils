// helper functions for converting fields back and forth between WooCommerce and Google Sheets
import _ from "lodash";

let _categoriesByName = [];
let _tagsByName = [];

export const initializeFieldConversion = (products) => {
  _categoriesByName = products.reduce((acc, p) => {
    for (const category of p.categories) {
      if (!acc[category.name] && category.id !== undefined) {
        if (!category.name) {
          throw new Error(
            `category name is undefined for category id ${category.id}`
          );
        }
        acc[category.name] = category;
      }
    }
    return acc;
  }, {});

  _tagsByName = products.reduce((acc, p) => {
    for (const tag of p.tags) {
      if (!acc[tag.name] && tag.id !== undefined) {
        if (!tag.name) {
          throw new Error(`tag name is undefined for tag id ${tag.id}`);
        }
        acc[tag.name] = tag;
      }
    }
    return acc;
  }, {});
};

const _categoriesOrTagsToString = (c) => {
  if (!c) {
    return "";
  }
  const thingNames = c.map((thing) => thing.name);
  return _.orderBy(thingNames, (v) => v.toLowerCase()).join(", ");
};

const conversion_functions = {
  categories: {
    toStringForSheet: (categories) => {
      return _categoriesOrTagsToString(categories);
    },
    toValue: (categoryNameString) => {
      if (!categoryNameString.trim()) {
        return [];
      }

      return categoryNameString.split(",").map((categoryName) => {
        const c = _categoriesByName[categoryName.trim()];
        if (!c) {
          throw new Error(`Category ${categoryName} not found`);
        }
        return c;
      });
    },
    areEquivalent: (valFromWooProduct, valFromSheet) => {
      const v1 = _categoriesOrTagsToString(valFromWooProduct);
      const v2 = _categoriesOrTagsToString(valFromSheet);
      return v1 === v2;
    },
  },
  tags: {
    toStringForSheet: (tags) => {
      return _categoriesOrTagsToString(tags);
    },
    toValue: (tagNameString) => {
      if (!tagNameString.trim()) {
        return [];
      }

      return tagNameString.split(",").map((tagName) => {
        const t = _tagsByName[tagName.trim()];
        if (!t) {
          throw new Error(`Tag ${tagName.trim()} not found`);
        }
        return t;
      });
    },
    areEquivalent: (valFromWooProduct, valFromSheet) => {
      const v1 = _categoriesOrTagsToString(valFromWooProduct);
      const v2 = _categoriesOrTagsToString(valFromSheet);
      return v1 === v2;
    },
  },
};

export const value_toString = (field, value) => {
  if (conversion_functions[field]) {
    return conversion_functions[field].toStringForSheet(value);
  }

  return value;
};

export const string_toValue = (field, str) => {
  if (typeof str !== "string") {
    throw new Error(
      `string_toValue: str must be a string for field "${field}"`
    );
  }
  if (conversion_functions[field]) {
    return conversion_functions[field].toValue(str);
  }

  return str;
};

export const are_equivalent = (field, valFromWooProduct, valFromSheet) => {
  if (conversion_functions[field]) {
    return conversion_functions[field].areEquivalent(
      valFromWooProduct,
      valFromSheet
    );
  }

  return valFromWooProduct == valFromSheet;
};
