"use client";

import { useState } from "react";
import { generateUploadButton } from "@uploadthing/react";
import type { BusFileRouter } from "@/app/api/uploadthing/core";

const UploadButton = generateUploadButton<BusFileRouter>();

export function PhotoUpload({ busId, label, done }: { busId: number; label: string; done: string }) {
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-start gap-2">
      <UploadButton
        endpoint="busPhoto"
        input={{ busId }}
        content={{ button: label }}
        appearance={{ button: "bg-ink text-street rounded-md px-4 w-auto", container: "items-start" }}
        onClientUploadComplete={() => setMessage(done)}
        onUploadError={(error) => setMessage(error.message)}
      />
      {message && <p role="status">{message}</p>}
    </div>
  );
}
