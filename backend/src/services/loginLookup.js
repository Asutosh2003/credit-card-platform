const { prisma } = require("../prisma");

const loginUserSelect = {
  id: true,
  userId: true,
  status: true,
  isSystemAdmin: true,
  passwordHash: true,
  attributes: true,
  resetTokenHash: true,
  resetTokenExpiresAt: true,
};

/**
 * Resolve a login identifier to a user by userId, email, or full name (case-insensitive).
 */
async function findUserByLoginIdentifier(raw) {
  const input = String(raw || "").trim();
  if (!input) {
    return { user: null, ambiguous: false };
  }

  const rows = await prisma.$queryRaw`
    SELECT u.id
    FROM users u
    WHERE LOWER(u.user_id) = LOWER(${input})
       OR LOWER(u.attributes->>'email') = LOWER(${input})
       OR LOWER(u.attributes->>'display_name') = LOWER(${input})
       OR LOWER(
         TRIM(
           CONCAT(
             COALESCE(u.attributes->>'first_name', ''),
             ' ',
             COALESCE(u.attributes->>'last_name', '')
           )
         )
       ) = LOWER(${input})
    LIMIT 2
  `;

  if (rows.length > 1) {
    return { user: null, ambiguous: true };
  }
  if (rows.length === 0) {
    return { user: null, ambiguous: false };
  }

  const user = await prisma.user.findUnique({
    where: { id: rows[0].id },
    select: loginUserSelect,
  });

  return { user, ambiguous: false };
}

module.exports = { findUserByLoginIdentifier, loginUserSelect };
