import { createHash } from "node:crypto";
import { prisma } from "../prisma/lib/prisma.js";

export default {
  storeToken,
  deleteToken,
  rotateToken,
};

type TokenRotationResult =
  | {
      status: 200;
      message: string;
      row: string;
      reusedWithinGrace: false;
    }
  | {
      status: 200;
      message: string;
      reusedWithinGrace: true;
      replacedBy: string;
    }
  | {
      status: 403 | 500;
      message: string;
    };

const REFRESH_TOKEN_GRACE_PERIOD_MS = 5_000;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function hasPrismaCode(error: unknown, code: string) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

function isInsideGracePeriod(usedAt: Date | null, now: Date) {
  if (!usedAt) {
    return false;
  }

  return now.getTime() - usedAt.getTime() <= REFRESH_TOKEN_GRACE_PERIOD_MS;
}

async function storeToken(token: string, userId: string) {
  try {
    const row = await prisma.tokens.create({
      data: {
        user_id: userId,
        token: hashToken(token),
      },
    });

    return { status: 200, row: row.id };
  } catch (error) {
    console.error("Error storing token:", error);
    return { status: 500 };
  }
}

async function deleteToken(token: string, userId: string) {
  try {
    await prisma.tokens.delete({
      where: { token: hashToken(token) },
    });

    return { status: 200 };
  } catch (error) {
    if (hasPrismaCode(error, "P2025")) {
      await prisma.tokens.deleteMany({ where: { user_id: userId } });
      return { status: 403 };
    }

    console.error("Error deleting token:", error);
    return { status: 500 };
  }
}

async function rotateToken(
  oldToken: string,
  newToken: string,
  userId: string,
): Promise<TokenRotationResult> {
  try {
    const oldHashedToken = hashToken(oldToken);
    const now = new Date();

    return await prisma.$transaction(async (tx) => {
      const oldTokenRow = await tx.tokens.findUnique({
        where: { token: oldHashedToken },
      });

      if (!oldTokenRow || oldTokenRow.user_id !== userId) {
        await tx.tokens.deleteMany({ where: { user_id: userId } });
        return { status: 403, message: "Reused token" };
      }

      if (oldTokenRow.status === "USED") {
        if (
          isInsideGracePeriod(oldTokenRow.used_at, now) &&
          oldTokenRow.replaced_by
        ) {
          return {
            status: 200,
            message: "Token inside grace period",
            reusedWithinGrace: true,
            replacedBy: oldTokenRow.replaced_by,
          };
        }

        await tx.tokens.deleteMany({ where: { user_id: userId } });
        return { status: 403, message: "Reused token" };
      }

      const newTokenRow = await tx.tokens.create({
        data: {
          user_id: userId,
          token: hashToken(newToken),
        },
      });

      const updated = await tx.tokens.updateMany({
        where: {
          id: oldTokenRow.id,
          status: "ACTIVE",
        },
        data: {
          status: "USED",
          used_at: now,
          replaced_by: newTokenRow.id,
        },
      });

      if (updated.count === 1) {
        return {
          status: 200,
          row: newTokenRow.id,
          message: "Token rotated",
          reusedWithinGrace: false,
        };
      }

      await tx.tokens.delete({ where: { id: newTokenRow.id } });

      const updatedOldTokenRow = await tx.tokens.findUnique({
        where: { token: oldHashedToken },
      });

      if (
        updatedOldTokenRow?.status === "USED" &&
        isInsideGracePeriod(updatedOldTokenRow.used_at, now) &&
        updatedOldTokenRow.replaced_by
      ) {
        return {
          status: 200,
          message: "Token inside grace period",
          reusedWithinGrace: true,
          replacedBy: updatedOldTokenRow.replaced_by,
        };
      }

      return { status: 500, message: "Error rotating token" };
    });
  } catch (error) {
    console.error("Error rotating token:", error);
    return { status: 500, message: "Error rotating token" };
  }
}
