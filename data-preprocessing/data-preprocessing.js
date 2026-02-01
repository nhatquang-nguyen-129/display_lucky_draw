/**
 * ======================================
 * PREPROCESSING CONFIGURATION
 * ======================================
 * Only edit values below
 */

/** OUTPUT */
const OUTPUT_CSV_FILE = "./data-source/final.csv";

/**
 * FIELD DEFINITIONS
 * key = logical field name
 * source = column name in input file
 * type = processing rule
 */
const FIELDS = {
  timestamp: {
    source: "timestamp",
    type: "string"
  },
  full_name: {
    source: "full_name",
    type: "full_name"
  },
  phone_number: {
    source: "phone_number",
    type: "phone_vn"
  },
  facebook_post: {
    source: "facebook_post",
    type: "string"
  }
};

/**
 * DEDUPLICATION
 * priority order
 */
const DEDUP_KEYS = ["phone_number"];

/**
 * INVALID RECORD POLICY
 * skip | keep
 */
const INVALID_RECORD_ACTION = "skip";

/**
 * ======================================
 * STOP EDITING BELOW THIS LINE
 * ======================================
 */

module.exports = {
  OUTPUT_CSV_FILE,
  FIELDS,
  DEDUP_KEYS,
  INVALID_RECORD_ACTION
};
