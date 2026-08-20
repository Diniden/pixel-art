/** UnavailableStep stories (REFRESH task 34). No store provider. */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { UnavailableStep } from "./UnavailableStep";
import "../AIInterpolateModal.css";

const meta = {
  title: "AIInterpolate/Steps/UnavailableStep",
  component: UnavailableStep,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Shown when the health check concluded the service cannot take " +
          "work. The three stories are the three DISTINCT failure modes the " +
          "check separates — which is why it cannot simply trust " +
          "`status === \"ok\"`.",
      },
    },
  },
  args: { detail: "The AI service is not reachable." },
} satisfies Meta<typeof UnavailableStep>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The service answered, but not with `ok`. */
export const ServiceNotReachable: Story = {};

/**
 * ⚠️ The case health checks usually miss: the proxy is UP and returns
 * `status: "ok"`, but has no remote configured, so every job would fail.
 * Reporting "Connected" here would be a lie.
 */
export const ProxyWithoutRemote: Story = {
  args: {
    detail:
      "The AI proxy is running but no remote service is configured (AI_REMOTE_URL unset).",
  },
};

/** The Express server itself is down — the health call THREW. */
export const ServerDown: Story = {
  args: { detail: "Failed to fetch" },
};

/** No detail available; the line renders empty rather than "null". */
export const NoDetail: Story = { args: { detail: null } };
