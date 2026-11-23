import { getAuthorName, getUserId } from "@/lib/auth";
import { createUploadthing, type FileRouter } from "uploadthing/next";
import { UploadThingError } from "uploadthing/server";
import { getBus } from "@/lib/buses";
import { getDb } from "@/lib/db";
import { photos } from "@/db/schema";
import { notifyAdmin } from "@/lib/notify";

const f = createUploadthing();

/** Standard Schema validator for the upload input: the id of the bus the photos belong to. */
const busInput = {
  "~standard": {
    version: 1 as const,
    vendor: "buss-info",
    validate: (value: unknown) => {
      const busId = Number((value as { busId?: unknown } | null)?.busId);
      return Number.isInteger(busId) && busId > 0 ? { value: { busId } } : { issues: [{ message: "busId must be a positive integer" }] };
    },
    types: undefined as unknown as { input: { busId: number }; output: { busId: number } },
  },
};

/** Upload routes: bus photos, held for review until approved. */
export const fileRouter = {
  busPhoto: f({ image: { maxFileSize: "8MB", maxFileCount: 4 } })
    .input(busInput)
    .middleware(async ({ input }) => {
      const userId = await getUserId();
      if (!userId) throw new UploadThingError("Sign in to upload photos");
      if (!input) throw new UploadThingError("Missing bus id");
      if (!(await getBus(input.busId))) throw new UploadThingError("Bus not found");
      return { userId, busId: input.busId, author: await getAuthorName() };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      await (await getDb()).insert(photos).values({
        bus_id: metadata.busId,
        url: file.ufsUrl,
        file_key: file.key,
        user_id: metadata.userId,
        author: metadata.author,
      });
      await notifyAdmin(`Photo uploaded for bus #${metadata.busId}`, [
        `${metadata.author ?? "Someone"} uploaded a photo of bus #${metadata.busId}:`,
        `  ${file.ufsUrl}`,
        "It stays hidden until you approve it.",
      ]);
      return { ok: true };
    }),
} satisfies FileRouter;

/** Type of the upload router, used to type the client upload button. */
export type BusFileRouter = typeof fileRouter;
