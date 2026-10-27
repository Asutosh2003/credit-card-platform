const bcrypt = require("bcryptjs");
const { prisma } = require("../prisma");
const { validateAttributes } = require("./validation");
const { getSchemaFields } = require("./cache");
const {
  applyAutoUserAttributes,
  mapAccountStatusToSystem,
  buildUserIdFromNames,
} = require("./userAttributes");

/** bcrypt cost for provisioned accounts — 4 is enough for demo/connector traffic. */
const PROVISION_BCRYPT_ROUNDS = Math.min(
  10,
  Math.max(4, Number(process.env.PROVISION_BCRYPT_ROUNDS || 4) || 4)
);

/** Reuse hash when every joiner gets PROVISION_DEFAULT_PASSWORD (bulk path). */
const passwordHashCache = new Map();

async function hashPassword(password) {
  const key = `${PROVISION_BCRYPT_ROUNDS}:${password}`;
  const hit = passwordHashCache.get(key);
  if (hit) return hit;
  const hash = await bcrypt.hash(password, PROVISION_BCRYPT_ROUNDS);
  // Cap cache — only the default provision password is reused heavily.
  if (passwordHashCache.size > 8) passwordHashCache.clear();
  passwordHashCache.set(key, hash);
  return hash;
}

async function assertPrimaryKeyUnique(attributes, fields, excludeUserId) {
  const pkField = fields.find((f) => f.isPrimaryKey);
  if (!pkField) return null;
  const value = attributes?.[pkField.columnName];
  if (value === null || value === undefined || value === "") {
    return `${pkField.displayName} is required (primary key)`;
  }
  const login = String(value);
  const duplicate = await prisma.user.findFirst({
    where: {
      OR: [{ userId: login }],
      ...(excludeUserId ? { NOT: { id: excludeUserId } } : {}),
    },
    select: { id: true },
  });
  if (duplicate) {
    return `${pkField.displayName} must be unique (already used)`;
  }
  return null;
}

async function applyUserPayload(
  body,
  { isCreate = false, excludeUserId = null, existingUser = null, skipDuplicateCheck = false } = {}
) {
  const { password, isSystemAdmin, attributes } = body || {};
  const data = {};
  const errors = [];
  const passwordChanged = Boolean(password);

  if (isCreate) {
    if (!password || typeof password !== "string" || password.length < 4) {
      errors.push("password is required (min 4 characters)");
    } else {
      data.passwordHash = await hashPassword(password);
    }
  } else if (password) {
    if (typeof password !== "string" || password.length < 4) {
      errors.push("password must be at least 4 characters");
    } else {
      data.passwordHash = await hashPassword(password);
    }
  }

  if (isSystemAdmin !== undefined) {
    data.isSystemAdmin = Boolean(isSystemAdmin);
  }

  if (attributes !== undefined || isCreate) {
    const fields = await getSchemaFields("user");
    const existingAttrs = existingUser?.attributes || {};
    const attrsIn = attributes || {};
    // Accept first_name / last_name when sent; never require them.
    // Always require email (and user_id after auto attrs).
    const fieldsForValidation = fields.map((f) => {
      if (f.columnName === "first_name" || f.columnName === "last_name") {
        return { ...f, required: false };
      }
      if (f.columnName === "email") {
        return { ...f, required: true };
      }
      return f;
    });
    const result = validateAttributes(attrsIn, fieldsForValidation);
    if (result.errors.length) {
      errors.push(...result.errors);
    } else {
      const merged = applyAutoUserAttributes(result.cleaned, {
        isCreate,
        existingAttrs,
        passwordChanged: isCreate || passwordChanged,
      });

      if (!merged.user_id) {
        errors.push(
          "User ID is required — send user_id (or userId) or first_name + last_name"
        );
      } else if (!String(merged.email || "").trim()) {
        errors.push("Email is required");
      } else {
        const pkError = skipDuplicateCheck
          ? null
          : await assertPrimaryKeyUnique(merged, fields, excludeUserId);
        if (pkError) {
          errors.push(pkError);
        } else {
          data.userId = merged.username || merged.user_id;
          if (!merged.display_name) {
            merged.display_name = merged.user_id;
          }
          data.attributes = merged;
          data.status = mapAccountStatusToSystem(merged.status);
        }
      }
    }
  }

  return { errors, data };
}

function tentativeLoginFromJoiner(joiner) {
  const attrs = joiner?.attributes || {};
  const explicit = String(attrs.user_id || attrs.username || "").trim();
  if (explicit) return explicit;
  return buildUserIdFromNames(attrs);
}

module.exports = {
  applyUserPayload,
  tentativeLoginFromJoiner,
  assertPrimaryKeyUnique,
};
