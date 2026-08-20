/**
 * BrowseBackupsModal stories (REFRESH task 36, W27).
 *
 * 🏁 NO STORE PROVIDER, AND NO MSW NEEDED. The modal called `backupApi.list`
 * itself until task 36 — that single import was what kept it out of `ui/`.
 * The call is the `loadBackups` prop now, so these stories drive the loading,
 * loaded, empty and FAILED states by resolving or rejecting a plain function.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ `LoadFailed` IS THE IMPORTANT STORY — DO NOT DELETE IT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Task 15 fixed a bug where a server error resolved to `[]` and rendered as
 * "no backups" — which reads to the user as "your backups are gone". The
 * contract is that `loadBackups` REJECTS on failure and the modal shows an
 * explicit error. `NoBackups` and `LoadFailed` must stay visibly different.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { BrowseBackupsModal } from "./BrowseBackupsModal";
import type { BackupEntry } from "../../../types";

const BACKUPS: BackupEntry[] = [
  { date: "08-16-2026", time: "14-32-08", filename: "backup-1.json.gz" },
  { date: "08-16-2026", time: "09-15-44", filename: "backup-2.json.gz" },
  { date: "08-15-2026", time: "22-04-01", filename: "backup-3.json.gz" },
  { date: "08-14-2026", time: "11-47-30", filename: "backup-4.json.gz" },
];

const meta = {
  component: BrowseBackupsModal,
  args: {
    onClose: fn(),
    projectName: "Base Unit",
    onRestoreFromBackup: fn(async () => true),
    loadBackups: fn(async () => BACKUPS),
  },
} satisfies Meta<typeof BrowseBackupsModal>;

export default meta;
type Story = StoryObj<typeof meta>;

/** EMPTY: the project has no backups. NOT the same as a failed load. */
export const NoBackups: Story = {
  args: { loadBackups: fn(async () => []) },
};

/** TYPICAL: four backups across three days, grouped by date. */
export const Typical: Story = {};

/** The load never settles — the spinner state. */
export const Loading: Story = {
  args: { loadBackups: fn(() => new Promise<BackupEntry[]>(() => {})) },
};

/**
 * EDGE: the load REJECTS. Must show an explicit error, never "no backups" —
 * see the warning at the top of this file.
 */
export const LoadFailed: Story = {
  args: {
    loadBackups: fn(async () => {
      throw new Error("Could not reach the server");
    }),
  },
};

/** EDGE: many backups on a single day — exercises grouping and scrolling. */
export const ManyBackups: Story = {
  args: {
    loadBackups: fn(async () =>
      Array.from({ length: 40 }, (_, i) => ({
        date: "08-16-2026",
        time: `${String(23 - Math.floor(i / 3)).padStart(2, "0")}-${String(
          (i * 7) % 60,
        ).padStart(2, "0")}-00`,
        filename: `backup-${i}.json.gz`,
      })),
    ),
  },
};

/** EDGE: restore is refused by the server. */
export const RestoreFails: Story = {
  args: { onRestoreFromBackup: fn(async () => false) },
};
