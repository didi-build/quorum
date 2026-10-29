import specMarkdown from "../../../design/app/ui-polish/spec.md?raw";
import type { GalleryEntry } from "../../gallery/lib/types.js";
import { StatusChip } from "./StatusChip.js";

export const statusChipGallery: GalleryEntry = {
  id: "status-chip",
  title: "StatusChip",
  specPath: "design/app/ui-polish/spec.md",
  specMarkdown,
  component: StatusChip as unknown as GalleryEntry["component"],
  variants: [
    {
      name: "Pending",
      props: { status: "pending" },
    },
    {
      name: "Indexing",
      props: { status: "indexing" },
    },
    {
      name: "Ready",
      props: { status: "ready" },
    },
    {
      name: "Error",
      props: { status: "error" },
    },
    {
      name: "Refreshing",
      props: { status: "ready", refreshing: true },
    },
  ],
};
