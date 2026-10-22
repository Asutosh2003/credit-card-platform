/** Canonical entitlement catalog for Wisibility Loan Hub (20 total). */

/** Codes kept in the catalog for administration but not assigned by demo seed. */
const UNASSIGNED_ENTITLEMENT_CODES = [
  "LOAN_PRODUCT_ADMIN",
  "LOAN_SYSTEM_ADMIN",
  "LOAN_DATA_STEWARD",
  "LOAN_AUDIT_ADMIN",
];

const SOURCE = "Wisibility Loan Hub";

function entAttrs({ description, owner, privilege, entitlement_type = "Business" }) {
  return {
    description,
    ...(owner !== undefined ? { owner } : {}),
    privilege: Boolean(privilege),
    is_privilege: Boolean(privilege),
    entitlement_type,
    is_active: true,
    source: SOURCE,
  };
}

const DEFAULT_ENTITLEMENTS = [
  ["Application Intake Specialist", "LOAN_APPLICATION_INTAKE", "Capture and validate new loan applications", "Origination", false],
  ["Loan Originator", "LOAN_ORIGINATOR", "Originate and manage borrower applications", "Origination", false],
  ["Loan Processor", "LOAN_PROCESSOR", "Process documentation and application conditions", "Operations", false],
  ["Credit Analyst", "LOAN_CREDIT_ANALYST", "Analyze borrower creditworthiness", "Credit", false],
  ["Senior Credit Analyst", "LOAN_SENIOR_CREDIT_ANALYST", "Perform senior credit review", "Credit", true],
  ["Underwriter", "LOAN_UNDERWRITER", "Evaluate risk and underwriting conditions", "Underwriting", false],
  ["Senior Underwriter", "LOAN_SENIOR_UNDERWRITER", "Approve complex underwriting decisions", "Underwriting", true],
  ["Loan Approver", "LOAN_APPROVER", "Approve or decline loan applications", "Lending", true],
  ["Branch Manager", "LOAN_BRANCH_MANAGER", "Manage branch lending operations", "Lending", true],
  ["Portfolio Manager", "LOAN_PORTFOLIO_MANAGER", "Manage an active loan portfolio", "Servicing", true],
  ["Loan Servicing Specialist", "LOAN_SERVICING_SPECIALIST", "Maintain accounts after origination", "Servicing", false],
  ["Payment Operations Specialist", "LOAN_PAYMENT_OPERATIONS", "Process loan payments and adjustments", "Servicing", false],
  ["Collections Officer", "LOAN_COLLECTIONS_OFFICER", "Manage delinquent loan accounts", "Collections", false],
  ["Collections Manager", "LOAN_COLLECTIONS_MANAGER", "Oversee collections strategy and operations", "Collections", true],
  ["Risk Analyst", "LOAN_RISK_ANALYST", "Monitor credit and portfolio risk", "Risk", false],
  ["Fraud Investigator", "LOAN_FRAUD_INVESTIGATOR", "Investigate suspected application and payment fraud", "Risk", false],
  ["Compliance Officer", "LOAN_COMPLIANCE_OFFICER", "Monitor lending regulatory compliance", "Compliance", false],
  ["Loan Auditor", "LOAN_AUDITOR", "Audit loan activity and controls", "Audit", false],
  ["Loan Product Administrator", "LOAN_PRODUCT_ADMIN", "Administer loan products and configuration", "Administration", true],
  ["Loan System Administrator", "LOAN_SYSTEM_ADMIN", "Administer Loan Hub system access", "Administration", true],
].map(([name, code, description, owner, privilege]) => ({
  name,
  code,
  attributes: entAttrs({ description, owner, privilege }),
}));

/** Removable entitlement columns (id + name are fixed system fields) */
const DEFAULT_ENTITLEMENT_FIELDS = [
  {
    entityType: "entitlement",
    columnName: "description",
    displayName: "Description",
    dataType: "string",
    length: 500,
    required: false,
    isPrimaryKey: false,
    options: [],
    sortOrder: 0,
  },
  {
    entityType: "entitlement",
    columnName: "owner",
    displayName: "Owner",
    dataType: "dropdown",
    length: 100,
    required: false,
    isPrimaryKey: false,
    options: ["Credit", "Lending", "Risk", "Collections", "Administration", "Audit", "Operations"],
    sortOrder: 1,
  },
  {
    entityType: "entitlement",
    columnName: "privilege",
    displayName: "Privilege",
    dataType: "boolean",
    length: null,
    required: false,
    isPrimaryKey: false,
    options: [],
    sortOrder: 2,
  },
  {
    entityType: "entitlement",
    columnName: "entitlement_type",
    displayName: "Entitlement Type",
    dataType: "dropdown",
    length: 50,
    required: false,
    isPrimaryKey: false,
    options: ["Business", "System", "Technical", "Temporary", "External"],
    sortOrder: 3,
  },
  {
    entityType: "entitlement",
    columnName: "is_active",
    displayName: "Is Active",
    dataType: "boolean",
    length: null,
    required: false,
    isPrimaryKey: false,
    options: [],
    sortOrder: 4,
  },
  {
    entityType: "entitlement",
    columnName: "source",
    displayName: "Source",
    dataType: "string",
    length: 150,
    required: false,
    isPrimaryKey: false,
    options: [],
    sortOrder: 5,
  },
];

function assignableEntitlements() {
  const blocked = new Set(UNASSIGNED_ENTITLEMENT_CODES);
  return DEFAULT_ENTITLEMENTS.filter((e) => !blocked.has(e.code));
}

module.exports = {
  DEFAULT_ENTITLEMENTS,
  DEFAULT_ENTITLEMENT_FIELDS,
  UNASSIGNED_ENTITLEMENT_CODES,
  assignableEntitlements,
};
